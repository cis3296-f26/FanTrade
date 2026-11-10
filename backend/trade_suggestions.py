"""Find two-for-two trades using roster needs and shared market values."""

from bisect import bisect_left
from collections import Counter
from functools import lru_cache
from itertools import combinations
import math

from fancalc_connection import build_player_value_lookup, evaluate_player_values

POSITIONS = ("QB", "RB", "WR", "TE")
FLEX_POSITIONS = ("RB", "WR", "TE")
SLOT_POSITIONS = {
    **{position: (position,) for position in POSITIONS},
    "FLEX": FLEX_POSITIONS,
    "SUPER_FLEX": POSITIONS,
    "REC_FLEX": ("WR", "TE"),
    "WRRB_FLEX": ("WR", "RB"),
}
MIN_GAIN_PERCENT = 2
MAX_GAIN_PERCENT = 8
MAX_LINEUP_CHECKS = 2500


def validate_suggestion_request(data):
    """Check selections before making any external requests."""
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    league_id = data.get("league_id")
    if not isinstance(league_id, str) or not league_id.strip().isdigit():
        raise ValueError("Choose a valid league.")
    ids = []
    for field in ("your_roster_id", "partner_roster_id"):
        value = data.get(field)
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            raise ValueError("Choose two valid teams.")
        if not str(value).isdigit() or int(value) < 1:
            raise ValueError("Choose two valid teams.")
        ids.append(int(value))
    if ids[0] == ids[1]:
        raise ValueError("Choose two different teams.")
    position = data.get("position", "ANY")
    if not isinstance(position, str) or position not in (*POSITIONS, "ANY", "FLEX"):
        raise ValueError("Choose Any, QB, RB, WR, TE, or FLEX.")
    return league_id.strip(), ids[0], ids[1], position


def league_trade_settings(league):
    """Map supported league rules to FantasyCalc's available settings."""
    raw_slots = league.get("roster_positions") or []
    # Kicker, defense, and bench slots never participate in suggestion analysis.
    slots = [slot for slot in raw_slots if slot not in ("BN", "K", "DEF")]
    if not slots or len(slots) > 12 or any(slot not in SLOT_POSITIONS for slot in slots):
        raise ValueError("This league's starting lineup format is not supported yet.")
    settings = league.get("settings") or {}
    league_type = settings.get("type")
    if league_type not in (0, 2):
        raise ValueError("Suggestions currently support redraft and dynasty leagues.")
    teams = settings.get("num_teams", league.get("total_rosters"))
    ppr = (league.get("scoring_settings") or {}).get("rec", 0)
    qb_slots = slots.count("QB") + slots.count("SUPER_FLEX")
    if teams not in (8, 10, 12, 14) or ppr not in (0, 0.5, 1) or qb_slots not in (1, 2):
        raise ValueError("This league's size, PPR scoring, or QB format is not supported yet.")
    return slots, {
        "is_dynasty": league_type == 2, "num_qbs": qb_slots,
        "num_teams": teams, "ppr": ppr,
    }


def analyze_roster(players, slots):
    """Find the highest-value eligible lineup, counting each player only once."""
    groups = {
        pos: sorted((p for p in players if p["position"] == pos),
                    key=lambda p: (-p["value"], p["player_id"]))
        for pos in POSITIONS
    }
    # Fill restrictive slots first. Explore flex choices instead of greedily
    # using a player who may be needed in another slot.
    ordered_slots = sorted(slots, key=lambda slot: len(SLOT_POSITIONS[slot]))

    @lru_cache(maxsize=None)
    def fill(index, counts):
        if index == len(ordered_slots):
            return 0, 0, ()
        slot = ordered_slots[index]
        filled, value, lineup = fill(index + 1, counts)
        best = filled, value, ((slot, None),) + lineup
        for pos in SLOT_POSITIONS[slot]:
            pos_index = POSITIONS.index(pos)
            used = counts[pos_index]
            if used >= len(groups[pos]):
                continue
            player = groups[pos][used]
            next_counts = list(counts)
            next_counts[pos_index] += 1
            filled, value, lineup = fill(index + 1, tuple(next_counts))
            candidate = filled + 1, value + player["value"], ((slot, player["player_id"]),) + lineup
            if candidate[:2] > best[:2]:
                best = candidate
        return best

    filled, total, lineup = fill(0, (0, 0, 0, 0))
    by_id = {p["player_id"]: p for p in players}
    starters = [{"slot": slot, "player": by_id.get(pid)} for slot, pid in lineup]
    starter_ids = {pid for _, pid in lineup if pid is not None}
    return {
        "filled_slots": filled, "value": total, "starters": starters,
        "depth": [p for p in players if p["player_id"] not in starter_ids],
    }


def rank_target_positions(analysis, requested, market_values):
    """Compare starters within their own positions rather than comparing raw QB/TE values."""
    allowed = POSITIONS if requested == "ANY" else FLEX_POSITIONS if requested == "FLEX" else (requested,)
    needs = {pos: 1.0 for pos in allowed}
    for starter in analysis["starters"]:
        player = starter["player"]
        eligible = SLOT_POSITIONS[starter["slot"]]
        for pos in allowed:
            if pos not in eligible or (player and player["position"] != pos):
                continue
            values = market_values.get(pos, [])
            percentile = bisect_left(values, player["value"]) / len(values) if player and values else 0
            needs[pos] = min(needs[pos], percentile)
    return sorted(allowed, key=lambda pos: (needs[pos], POSITIONS.index(pos)))


def within_value_range(give_total, receive_total):
    # Use unrounded totals at the boundaries; rounding could admit a 1.96% gain.
    larger = max(give_total, receive_total)
    difference = receive_total - give_total
    return larger > 0 and MIN_GAIN_PERCENT * larger <= difference * 100 <= MAX_GAIN_PERCENT * larger


def generate_trade_suggestion(league, your_id, partner_id, requested, fc_data):
    """Search a bounded set of packages and return a suggestion or a clear no-match result."""
    if requested not in (*POSITIONS, "ANY", "FLEX") or your_id == partner_id:
        raise ValueError("Choose two different teams and a supported position.")
    slots, settings = league_trade_settings(league)
    rosters = {str(r["roster_id"]): r for r in league.get("rosters", [])}
    if str(your_id) not in rosters or str(partner_id) not in rosters:
        raise ValueError("Both teams must belong to the selected league.")
    selected = [rosters[str(your_id)], rosters[str(partner_id)]]
    directory = {str(p["player_id"]): p for r in selected for p in r["players"]}
    lookup = build_player_value_lookup(fc_data, directory)
    warnings = []
    teams = []
    for roster in selected:
        players, missing, seen = [], 0, set()
        for player in roster["players"]:
            if player.get("position") not in POSITIONS:
                continue
            pid = str(player["player_id"])
            if pid in seen:
                continue
            seen.add(pid)
            valued = lookup(pid)
            if valued["unranked"] or not isinstance(valued["value"], (int, float)) or not math.isfinite(valued["value"]) or valued["value"] <= 0:
                missing += 1
                continue
            # Slot eligibility comes from the actual roster, not a name fallback.
            valued["position"] = player["position"]
            players.append(valued)
        if len(players) > 30:
            raise ValueError("Suggestions currently support up to 30 valued offensive players per team.")
        if missing:
            warnings.append(f"{roster.get('team_name', 'A team')}: {missing} players lacked usable market values and were excluded.")
        teams.append(sorted(players, key=lambda p: p["player_id"]))
    yours, theirs = teams
    if set(p["player_id"] for p in yours) & set(p["player_id"] for p in theirs):
        raise ValueError("The teams contain overlapping players. Reload the league and try again.")
    if not yours or not theirs:
        raise RuntimeError("Not enough player valuation data is available for these teams.")

    before = [analyze_roster(team, slots) for team in teams]
    market = {pos: [] for pos in POSITIONS}
    for item in fc_data:
        pos = (item.get("player") or {}).get("position")
        value = item.get("value")
        if pos in market and isinstance(value, (int, float)) and math.isfinite(value) and value > 0:
            market[pos].append(value)
    for values in market.values():
        values.sort()
    targets = rank_target_positions(before[0], requested, market)
    depth_ids = [{p["player_id"] for p in analysis["depth"]} for analysis in before]

    # Enumerate packages first, then prioritize exchanges of spare depth. The
    # cheap value check avoids rebuilding lineups for obviously unsuitable trades.
    candidates = []
    for give in combinations(yours, 2):
        give_total = sum(p["value"] for p in give)
        for receive in combinations(theirs, 2):
            receive_total = sum(p["value"] for p in receive)
            if not within_value_range(give_total, receive_total):
                continue
            positions = {p["position"] for p in receive}
            target_rank = next((i for i, pos in enumerate(targets) if pos in positions), None)
            if target_rank is None:
                continue
            depth = sum(p["player_id"] in depth_ids[0] for p in give) + sum(p["player_id"] in depth_ids[1] for p in receive)
            candidates.append((target_rank, -depth, give, receive))
    candidates.sort(key=lambda c: c[:2])
    limited = len(candidates) > MAX_LINEUP_CHECKS
    best = None
    checked = 0
    for _, _, give, receive in candidates[:MAX_LINEUP_CHECKS]:
        checked += 1
        give_ids = {p["player_id"] for p in give}
        receive_ids = {p["player_id"] for p in receive}
        after = [
            analyze_roster([p for p in yours if p["player_id"] not in give_ids] + list(receive), slots),
            analyze_roster([p for p in theirs if p["player_id"] not in receive_ids] + list(give), slots),
        ]
        gains = [after[i]["value"] - before[i]["value"] for i in range(2)]
        # Both teams must gain starter value without leaving more slots empty.
        if any(gains[i] <= 0 or after[i]["filled_slots"] < before[i]["filled_slots"] for i in range(2)):
            continue
        coverage_lost = False
        for i in range(2):
            old_coverage = Counter(s["slot"] for s in before[i]["starters"] if s["player"])
            new_coverage = Counter(s["slot"] for s in after[i]["starters"] if s["player"])
            if any(new_coverage[slot] < count for slot, count in old_coverage.items()):
                coverage_lost = True
        if coverage_lost:
            continue
        target = None
        for pos in targets:
            old_values = sorted((s["player"]["value"] for s in before[0]["starters"] if s["player"] and s["player"]["position"] == pos), reverse=True)
            new_starters = [s["player"] for s in after[0]["starters"] if s["player"] and s["player"]["position"] == pos]
            new_values = sorted((p["value"] for p in new_starters), reverse=True)
            if any(p["player_id"] in receive_ids for p in new_starters) and sum(new_values) > sum(old_values):
                target = pos
                break
        if target is None:
            continue
        # Prefer the highest-priority need, then benefits shared by both teams.
        rank = (-targets.index(target), min(gains), sum(gains))
        if best is None or rank > best[0]:
            best = (rank, give, receive, target, gains)

    if limited:
        warnings.append("The search checked the highest-priority packages within its search limit.")
    common = {
        "warnings": warnings, "candidates_checked": checked, "search_limited": limited,
        "value_range": {"min_percent": MIN_GAIN_PERCENT, "max_percent": MAX_GAIN_PERCENT},
        "settings": settings,
    }
    if best is None:
        return {**common, "status": "no_match", "suggestion": None,
                "message": "No suitable two-for-two trade was found among the evaluated packages. Try another team or position."}
    _, give, receive, target, gains = best
    evaluation = evaluate_player_values(list(give), list(receive), **settings)
    return {**common, "status": "ok", "suggestion": {
        "target_position": target, "evaluation": evaluation,
        "your_lineup_value_gain": gains[0], "partner_lineup_value_gain": gains[1],
        "reasons": [
            f"You improve your starting {target} options while gaining {evaluation['diff_percentage']}% in trade value.",
            "Your trade partner gains starting-lineup value by exchanging players they can replace.",
        ],
        "method_note": "Lineup improvements use FantasyCalc market values, not projected points. Injuries, bye weeks, and custom scoring bonuses are not modeled.",
    }}
