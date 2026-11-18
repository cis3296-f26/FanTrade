"""Find two-for-two trades using roster needs and shared market values."""

from collections import Counter
from itertools import combinations
import math

from fancalc_connection import build_player_value_lookup, evaluate_player_values
from trade_analysis import (
    POSITIONS, FLEX_POSITIONS, SLOT_POSITIONS, analyze_roster,
    analyze_team_positional_needs, extract_valued_players_for_roster,
    league_trade_settings, rank_target_positions,
)

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

    # Verify whether our trade engine can make an immediate trade package for each partner
    for p in partners:
        target = target_position if target_position in (POSITIONS + ("FLEX",)) else p["target_position"]
        if target not in (POSITIONS + ("FLEX", "ANY")):
            target = "ANY"
        res = None
        try:
            res = generate_trade_suggestion(league, your_id, p["roster_id"], target, fc_data)
        except Exception:
            pass

        # If a specific requested position didn't produce a trade, check if an ANY-position trade exists
        if (not res or res.get("status") != "ok" or not res.get("suggestion")) and target != "ANY":
            try:
                res = generate_trade_suggestion(league, your_id, p["roster_id"], "ANY", fc_data)
            except Exception:
                pass

        if res and res.get("status") == "ok" and res.get("suggestion"):
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
            p["compatibility_score"] = min(99, max(p["compatibility_score"] + 10, 45 if p["compatibility_score"] < 25 else p["compatibility_score"] + 10))
            if p["tier"] == "Low Match":
                p["tier"] = "Moderate Match"
                if "Limited" in p["primary_axis"] or "No strong" in p["primary_axis"]:
                    give_positions = "/".join(sorted(set(pl.get("position", "") for pl in eval_data.get("give", []))))
                    recv_positions = "/".join(sorted(set(pl.get("position", "") for pl in eval_data.get("receive", []))))
                    if give_positions and recv_positions:
                        p["primary_axis"] = f"Trade your {give_positions} for their {recv_positions}"

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
