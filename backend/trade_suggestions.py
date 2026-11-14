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


def validate_compatible_partners_request(data):
    """Check partner scan parameters before fetching external data."""
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    league_id = data.get("league_id")
    if not isinstance(league_id, str) or not league_id.strip().isdigit():
        raise ValueError("Choose a valid league.")
    your_id = data.get("your_roster_id")
    if isinstance(your_id, bool) or not isinstance(your_id, (str, int)):
        raise ValueError("Choose a valid team.")
    if not str(your_id).isdigit() or int(your_id) < 1:
        raise ValueError("Choose a valid team.")
    position = data.get("position", "ANY")
    if not isinstance(position, str) or position.upper() not in POSITIONS + ("ANY", "FLEX"):
        position = "ANY"
    else:
        position = position.upper()
    return league_id.strip(), int(your_id), position


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


def extract_valued_players_for_roster(roster, lookup):
    """Filter roster to supported offensive positions with verified positive market valuations."""
    players = []
    seen = set()
    # Strip out defensive players, kickers, or unranked guys so we only evaluate real offensive assets
    for player in roster.get("players", []):
        if player.get("position") not in POSITIONS:
            continue
        pid = str(player.get("player_id", ""))
        if not pid or pid in seen:
            continue
        seen.add(pid)
        valued = lookup(pid)
        if (
            valued.get("unranked")
            or not isinstance(valued.get("value"), (int, float))
            or not math.isfinite(valued.get("value", 0))
            or valued.get("value", 0) <= 0
        ):
            continue
        v_copy = dict(valued)
        v_copy["position"] = player.get("position", valued.get("position"))
        v_copy["name"] = player.get("name", player.get("full_name", f"Player {pid}"))
        players.append(v_copy)
    return sorted(players, key=lambda p: p["player_id"])


def analyze_team_positional_needs(players, slots):
    """
    Analyzes a team's positional roster composition, evaluating:
    - starter counts, totals, and baseline starter levels
    - bench depth and quality startable reserves
    - within-starter dropoff (e.g. dropoff between RB1 and RB2)
    - starter-to-bench dropoff (cliff dropoff to bench)
    - surplus scores (0-100) indicating expendable depth
    - need scores (0-100) indicating roster weakness or fragility
    """
    # Group optimal starters and bench players by position using the league's roster rules
    lineup = analyze_roster(players, slots)
    starters_by_pos = {pos: [] for pos in POSITIONS}
    for item in lineup["starters"]:
        p = item.get("player")
        if p and p.get("position") in starters_by_pos:
            starters_by_pos[p["position"]].append(p)

    bench_by_pos = {pos: [] for pos in POSITIONS}
    for p in lineup["depth"]:
        if p and p.get("position") in bench_by_pos:
            bench_by_pos[p["position"]].append(p)

    required_counts = {pos: slots.count(pos) for pos in POSITIONS}

    analysis = {}
    for pos in POSITIONS:
        starters = sorted(starters_by_pos[pos], key=lambda x: -x.get("value", 0))
        bench = sorted(bench_by_pos[pos], key=lambda x: -x.get("value", 0))

        starter_count = len(starters)
        bench_count = len(bench)
        total_count = starter_count + bench_count

        starter_values = [p.get("value", 0) for p in starters]
        bench_values = [p.get("value", 0) for p in bench]

        starter_total = sum(starter_values)
        starter_avg = round(starter_total / starter_count) if starter_count else 0
        bench_total = sum(bench_values)

        lowest_starter = starter_values[-1] if starter_values else 0
        highest_bench = bench_values[0] if bench_values else 0

        # Look at the dropoff between starters and bench. If their RB2 is a huge dropoff, they're hurting at RB.
        within_starter_dropoff = (
            (starter_values[0] - starter_values[-1])
            if len(starter_values) >= 2
            else 0
        )
        starter_to_bench_dropoff = (
            (lowest_starter - highest_bench)
            if (starter_values and bench_values)
            else (lowest_starter if starter_values else 0)
        )

        # Quality startable bench depth (FantasyCalc value >= 1500)
        quality_bench = [p for p in bench if p.get("value", 0) >= 1500]
        quality_bench_count = len(quality_bench)
        quality_bench_val = sum(p.get("value", 0) for p in quality_bench)

        req = required_counts.get(pos, 1)

        # Calculate surplus score based on quality bench players sitting out of the starting lineup
        surplus = 0
        if starter_count >= req and bench_count > 0:
            surplus += quality_bench_count * 25
            surplus += min(30, round(quality_bench_val / 300))
            if highest_bench >= 3500:
                surplus += 20
            elif highest_bench >= 2500:
                surplus += 10
            if total_count > req + 1:
                surplus += 15
        surplus_score = max(0, min(100, surplus))

        # Calculate need score based on weak starters, steep dropoffs, or zero startable depth
        need = 0
        if starter_count < req:
            need = 95
        else:
            if starter_avg < 3000:
                need += 35
            elif starter_avg < 5000:
                need += 20
            elif starter_avg < 6500:
                need += 10

            if within_starter_dropoff > 4000 and lowest_starter < 3000:
                need += 25
            elif within_starter_dropoff > 2500 and lowest_starter < 4000:
                need += 15

            if bench_count == 0:
                need += 20
            elif quality_bench_count == 0 and req > 1:
                need += 15
            elif quality_bench_count == 0 and req == 1:
                need += 5

            if starter_to_bench_dropoff > 4500 and quality_bench_count == 0:
                need += 15

        need_score = max(0, min(100, need))

        analysis[pos] = {
            "position": pos,
            "count": total_count,
            "starter_count": starter_count,
            "bench_count": bench_count,
            "quality_bench_count": quality_bench_count,
            "starter_total": starter_total,
            "starter_avg": starter_avg,
            "lowest_starter": lowest_starter,
            "highest_bench": highest_bench,
            "within_starter_dropoff": within_starter_dropoff,
            "starter_to_bench_dropoff": starter_to_bench_dropoff,
            "surplus_score": surplus_score,
            "need_score": need_score,
            "status": "balanced",
        }

    # Mark true surplus positions
    for pos in POSITIONS:
        if analysis[pos]["surplus_score"] >= 45 and analysis[pos]["surplus_score"] > analysis[pos]["need_score"] + 10:
            analysis[pos]["status"] = "surplus"

    # Only flag the top 1 or 2 most severe needs so we do not mark every position on a team as a need
    need_candidates = [
        pos for pos in POSITIONS
        if analysis[pos]["status"] != "surplus"
        and analysis[pos]["need_score"] >= 45
        and analysis[pos]["need_score"] > analysis[pos]["surplus_score"] + 10
    ]
    need_candidates.sort(key=lambda p: -analysis[p]["need_score"])
    for pos in need_candidates[:2]:
        analysis[pos]["status"] = "need"

    return analysis


def calculate_pair_compatibility(y_needs, p_needs, requested_position="ANY"):
    """
    Computes reciprocal trade synergy between two teams across position pairs.
    When a target position is requested (e.g. RB, WR), it prioritizes partners with
    expendable depth at that specific position.
    Returns the optimal give/receive axis, compatibility score (0-99), tier, and insights.
    """
    if requested_position in POSITIONS:
        allowed_recv = [requested_position]
    elif requested_position == "FLEX":
        allowed_recv = [pos for pos in ("RB", "WR", "TE")]
    else:
        allowed_recv = list(POSITIONS)

    best_score = 0
    best_axis = None

    # Check candidate give/receive pairs to find where the two teams have the best mutual fit
    for give_pos in POSITIONS:
        for recv_pos in allowed_recv:
            if give_pos == recv_pos:
                continue

            y_give_surplus = y_needs[give_pos]["surplus_score"]
            p_recv_need = p_needs[give_pos]["need_score"]

            p_give_surplus = p_needs[recv_pos]["surplus_score"]
            y_recv_need = y_needs[recv_pos]["need_score"]

            # If user explicitly requested this position, treat need as priority
            effective_y_need = max(60, y_recv_need) if requested_position in POSITIONS else y_recv_need

            give_synergy = math.sqrt(y_give_surplus * p_recv_need)
            recv_synergy = math.sqrt(p_give_surplus * effective_y_need)

            score = 0.5 * give_synergy + 0.5 * recv_synergy

            # When both teams are trading from their surplus to fill a real need, give a mutual synergy bonus
            if (
                y_give_surplus >= 40
                and p_recv_need >= 40
                and p_give_surplus >= 40
                and effective_y_need >= 40
            ):
                score += 20
            elif (
                (y_give_surplus >= 30 and p_recv_need >= 30)
                or (p_give_surplus >= 30 and effective_y_need >= 30)
            ):
                score += 10

            # Targeted bonus when partner has surplus at the user's requested position
            if requested_position in POSITIONS and p_give_surplus >= 30:
                score += 15

            if score > best_score:
                best_score = score
                best_axis = (give_pos, recv_pos, give_synergy, recv_synergy)

    final_score = max(5, min(99, round(best_score)))

    if best_axis and best_score >= 25:
        give_pos, recv_pos, _, _ = best_axis
        tier = (
            "High Match"
            if final_score >= 75
            else "Good Match"
            if final_score >= 55
            else "Moderate Match"
            if final_score >= 40
            else "Low Match"
        )
        summary = f"Trade your {give_pos} depth for their {recv_pos} depth"
        reasons = [
            (
                f"You have surplus {give_pos} depth ({y_needs[give_pos]['count']} players, "
                f"{y_needs[give_pos]['quality_bench_count']} startable on bench) to improve their starters."
            ),
            (
                f"They have surplus {recv_pos} depth ({p_needs[recv_pos]['count']} players, "
                f"{p_needs[recv_pos]['quality_bench_count']} startable on bench) to address your {recv_pos} dropoff."
            ),
        ]
        dropoff_val = y_needs[recv_pos]["starter_to_bench_dropoff"]
        if dropoff_val > 2500:
            reasons.append(
                f"Your {recv_pos} room has a steep dropoff ({dropoff_val:,} pts) with limited bench depth."
            )
        target_pos = recv_pos
    elif requested_position in POSITIONS:
        tier = "Low Match"
        give_pos = None
        target_pos = requested_position
        summary = f"Limited {requested_position} depth available from this team"
        reasons = [f"This team does not have expendable {requested_position} depth to trade away."]
    else:
        tier = "Low Match"
        summary = "No strong mutual roster fit found"
        reasons = ["Both teams have overlapping needs or limited expendable depth."]
        give_pos = None
        target_pos = "ANY"

    return {
        "score": final_score,
        "tier": tier,
        "primary_axis": summary,
        "give_position": give_pos,
        "target_position": target_pos,
        "reasons": reasons,
    }


def find_compatible_trade_partners(league, your_id, fc_data, target_position="ANY"):
    """
    Scans every other team in the league against the user's team, evaluating
    positional surplus, dropoff, and mutual trade compatibility.
    """
    slots, _ = league_trade_settings(league)
    rosters = {str(r["roster_id"]): r for r in league.get("rosters", [])}
    if str(your_id) not in rosters:
        raise ValueError("Selected team must belong to the league.")

    all_players = [p for r in league.get("rosters", []) for p in r.get("players", [])]
    directory = {str(p["player_id"]): p for p in all_players}
    lookup = build_player_value_lookup(fc_data, directory)

    # First analyze the user's own team needs and surplus positions
    your_roster = rosters[str(your_id)]
    your_players = extract_valued_players_for_roster(your_roster, lookup)
    your_needs = analyze_team_positional_needs(your_players, slots)

    your_surplus = [pos for pos, data in your_needs.items() if data["status"] == "surplus"]
    your_need_positions = [pos for pos, data in your_needs.items() if data["status"] == "need"]

    # Now scan all other teams in the league and calculate mutual fit scores
    partners = []
    for r_id_str, partner_roster in rosters.items():
        if r_id_str == str(your_id):
            continue
        p_id = int(r_id_str)
        p_players = extract_valued_players_for_roster(partner_roster, lookup)
        if not p_players:
            continue
        p_needs = analyze_team_positional_needs(p_players, slots)
        comp = calculate_pair_compatibility(your_needs, p_needs, requested_position=target_position)

        p_surplus = [pos for pos, data in p_needs.items() if data["status"] == "surplus"]
        p_need_positions = [pos for pos, data in p_needs.items() if data["status"] == "need"]

        partner_entry = {
            "roster_id": p_id,
            "team_name": partner_roster.get("team_name") or f"Team {p_id}",
            "owner_name": partner_roster.get("owner_name") or "Owner",
            "compatibility_score": comp["score"],
            "tier": comp["tier"],
            "primary_axis": comp["primary_axis"],
            "give_position": comp["give_position"],
            "target_position": comp["target_position"],
            "partner_surplus_positions": p_surplus,
            "partner_need_positions": p_need_positions,
            "reasons": comp["reasons"],
            "has_direct_trade": False,
            "direct_trade_preview": None,
        }
        partners.append(partner_entry)

    # Sort so the highest compatibility trade partners come first
    partners.sort(key=lambda p: -p["compatibility_score"])

    # For the top 3 matches, verify whether our 2-for-2 trade engine can make an immediate trade package
    for p in partners[:3]:
        target = target_position if target_position in (POSITIONS + ("FLEX",)) else p["target_position"]
        if target not in (POSITIONS + ("FLEX", "ANY")):
            target = "ANY"
        try:
            res = generate_trade_suggestion(league, your_id, p["roster_id"], target, fc_data)
            if res.get("status") == "ok" and res.get("suggestion"):
                eval_data = res["suggestion"]["evaluation"]
                give_count = len(eval_data.get("give", []))
                recv_count = len(eval_data.get("receive", []))
                trade_type = f"{give_count}-for-{recv_count}" if give_count and recv_count else "Direct"
                p["has_direct_trade"] = True
                p["direct_trade_preview"] = {
                    "give": [player["name"] for player in eval_data["give"]],
                    "receive": [player["name"] for player in eval_data["receive"]],
                    "give_count": give_count,
                    "receive_count": recv_count,
                    "trade_type": trade_type,
                    "advantage_percent": eval_data["diff_percentage"],
                }
                # Verified trade partners get an extra confidence boost
                p["compatibility_score"] = min(99, p["compatibility_score"] + 5)
        except Exception:
            pass

    # Final re-sort in case a verified trade bumped up a partner
    partners.sort(key=lambda p: -p["compatibility_score"])

    return {
        "status": "ok",
        "your_roster_id": int(your_id),
        "target_position": target_position,
        "your_analysis": {
            "positions": your_needs,
            "surplus_positions": your_surplus,
            "need_positions": your_need_positions,
        },
        "partners": partners,
    }
