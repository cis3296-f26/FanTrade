"""Shared lineup, player eligibility, and positional analysis for trade features."""

from bisect import bisect_left
from functools import lru_cache
import math

POSITIONS = ("QB", "RB", "WR", "TE")
FLEX_POSITIONS = ("RB", "WR", "TE")
SLOT_POSITIONS = {
    **{position: (position,) for position in POSITIONS},
    "FLEX": FLEX_POSITIONS,
    "SUPER_FLEX": POSITIONS,
    "REC_FLEX": ("WR", "TE"),
    "WRRB_FLEX": ("WR", "RB"),
}

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


