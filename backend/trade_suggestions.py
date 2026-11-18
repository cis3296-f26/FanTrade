"""Find trade suggestions and compatible partners using shared roster values."""

import math

from fancalc_connection import build_player_value_lookup, evaluate_player_values
from trade_analysis import (
    POSITIONS, FLEX_POSITIONS, SLOT_POSITIONS, analyze_roster,
    analyze_team_positional_needs, extract_valued_players_for_roster,
    league_trade_settings, rank_target_positions,
)

from trade_preferences import TradePreferences
from trade_search import prepare_team, search_packages

MAX_CANDIDATE_PAIRS = 25000
MAX_LINEUP_CHECKS = 900


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


def within_value_range(give_total, receive_total, preferences=None, drop_total=0):
    """Apply the same net-value rules used by the search preferences."""
    return (preferences or TradePreferences()).accepts_value(give_total, receive_total, drop_total)


def generate_trade_suggestion(league, your_id, partner_id, requested, fc_data, preferences=None):
    """Prepare two teams once, then search their permitted package sizes."""
    preferences = preferences or TradePreferences()
    if requested not in (*POSITIONS, "ANY", "FLEX") or str(your_id) == str(partner_id):
        raise ValueError("Choose two different teams and a supported position.")
    slots, settings = league_trade_settings(league)
    rosters = {str(r["roster_id"]): r for r in league.get("rosters", [])}
    if str(your_id) not in rosters or str(partner_id) not in rosters:
        raise ValueError("Both teams must belong to the selected league.")
    selected = [rosters[str(your_id)], rosters[str(partner_id)]]
    directory = {str(p["player_id"]): p for r in selected for p in r["players"]}
    lookup = build_player_value_lookup(fc_data, directory)
    # K and DEF still take up roster space even though they are never trade assets.
    capacity = len(league["roster_positions"])
    yours, theirs = [prepare_team(r, lookup, slots, capacity) for r in selected]
    if yours["active_ids"] & theirs["active_ids"]:
        raise ValueError("The teams contain overlapping players. Reload the league and try again.")
    warnings = [f"{t['team_name']}: {t['missing']} players lacked usable market values and were excluded."
                for t in (yours, theirs) if t["missing"]]
    market = {pos: [] for pos in POSITIONS}
    for item in fc_data:
        pos = (item.get("player") or {}).get("position")
        value = item.get("value")
        if pos in market and isinstance(value, (int, float)) and math.isfinite(value) and value > 0:
            market[pos].append(value)
    for values in market.values():
        values.sort()
    targets = rank_target_positions(yours["lineup"], requested, market)
    best, diagnostics = search_packages(yours, theirs, slots, preferences, targets,
                                        MAX_CANDIDATE_PAIRS, MAX_LINEUP_CHECKS)
    if diagnostics["search_limited"]:
        warnings.append("The search checked a limited selection of packages across the allowed trade formats.")
    common = {
        **diagnostics, "warnings": warnings, "preferences": preferences.as_dict(),
        "value_range": {"min_percent": preferences.min_gain_percent,
                        "max_percent": preferences.max_gain_percent},
        "settings": settings,
    }
    if best is None:
        return {**common, "status": "no_match", "suggestion": None,
                "message": "No suitable trade was found among the evaluated packages. Try another team, position, trade style, or value range."}
    give, receive = best["give"], best["receive"]
    evaluation = evaluate_player_values(list(give.players), list(receive.players), **settings)
    your_after, partner_after = best["your_after"], best["partner_after"]
    cost = give.total + your_after["drop_value"]
    net_gain = receive.total - cost
    net_percent = round(net_gain / max(cost, receive.total) * 100, 1)
    adding_depth = len(receive.players) > len(give.players)
    style = "add_depth" if adding_depth else "trade_up" if len(give.players) > len(receive.players) else "balanced"
    target = best["target"]
    reasons = [
        (f"You add starting options at {target}." if adding_depth else f"You upgrade a starting option at {target}."),
        f"Your net value advantage is {net_percent}% after any required cuts.",
    ]
    if best["gains"][1] > 0:
        reasons.append("Your trade partner also improves their projected starting-lineup value.")
    elif best["gains"][1] < 0:
        reasons.append("Your trade partner gives up starting-lineup value in this exchange.")
    # Required counts are separate from suggested names: a user may choose different cuts.
    moves = {}
    for side, team, after in (("you", yours, your_after), ("partner", theirs, partner_after)):
        moves[side] = {key: value for key, value in after.items() if key != "lineup"}
        moves[side].update(roster_id=team["roster_id"], team_name=team["team_name"])
    return {**common, "status": "ok", "suggestion": {
        "target_position": target, "trade_style": style,
        "trade_type": f"{len(give.players)}-for-{len(receive.players)}",
        "evaluation": evaluation, "net_value_gain": net_gain,
        "net_advantage_percent": net_percent, "roster_moves": moves,
        "your_lineup_value_gain": best["gains"][0], "partner_lineup_value_gain": best["gains"][1],
        "reasons": reasons,
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
