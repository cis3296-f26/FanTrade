"""Find trade suggestions and compatible partners using shared roster values."""

import math

from fancalc_connection import evaluate_player_values
from trade_analysis import (
    POSITIONS, FLEX_POSITIONS, SLOT_POSITIONS, analyze_roster,
    analyze_team_positional_needs, extract_valued_players_for_roster,
    league_trade_settings, rank_target_positions,
)

from trade_preferences import TradePreferences
from trade_search import LeagueTradeContext, search_packages

MAX_CANDIDATE_PAIRS = 25000
MAX_LINEUP_CHECKS = 900
PARTNER_PREVIEW_PAGE_SIZE = 3
MAX_PARTNER_CANDIDATE_PAIRS = 25000
MAX_PARTNER_LINEUP_CHECKS = 900


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
    if not isinstance(position, str) or position.upper() not in (*POSITIONS, "ANY", "FLEX"):
        raise ValueError("Choose Any, QB, RB, WR, TE, or FLEX.")
    return league_id.strip(), ids[0], ids[1], position.upper()


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
        raise ValueError("Choose Any, QB, RB, WR, TE, or FLEX.")
    return league_id.strip(), int(your_id), position.upper()


def within_value_range(give_total, receive_total, preferences=None, drop_total=0):
    """Apply the same net-value rules used by the search preferences."""
    return (preferences or TradePreferences()).accepts_value(give_total, receive_total, drop_total)


def generate_trade_suggestion(league, your_id, partner_id, requested, fc_data, preferences=None):
    """Prepare two teams once, then search their permitted package sizes."""
    preferences = preferences or TradePreferences()
    if requested not in (*POSITIONS, "ANY", "FLEX") or str(your_id) == str(partner_id):
        raise ValueError("Choose two different teams and a supported position.")
    context = LeagueTradeContext(league, fc_data)
    return _generate_from_context(context, your_id, partner_id, requested, preferences,
                                  MAX_CANDIDATE_PAIRS, MAX_LINEUP_CHECKS)


def _generate_from_context(context, your_id, partner_id, requested, preferences, pair_budget, lineup_budget):
    """Use the same engine and result format for previews and full searches."""
    yours, theirs = context.team(your_id), context.team(partner_id)
    if yours["active_ids"] & theirs["active_ids"]:
        raise ValueError("The teams contain overlapping players. Reload the league and try again.")
    warnings = [f"{t['team_name']}: {t['missing']} players lacked usable market values and were excluded."
                for t in (yours, theirs) if t["missing"]]
    targets = context.targets(yours, requested)
    best, diagnostics = search_packages(yours, theirs, context.slots, preferences, targets,
                                        pair_budget, lineup_budget)
    settings = context.settings
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


def validate_verification_offset(data):
    """Let expanded recommendations request the next small batch of previews."""
    offset = data.get("verification_offset", 0)
    if type(offset) is not int or not 0 <= offset <= 13:
        raise ValueError("Choose a valid recommendation page.")
    return offset


def find_compatible_trade_partners(league, your_id, fc_data, target_position="ANY",
                                   preferences=None, verification_offset=0):
    """Rank every partner, but verify only one bounded page of trade previews."""
    preferences = preferences or TradePreferences()
    if target_position not in (*POSITIONS, "ANY", "FLEX"):
        raise ValueError("Choose Any, QB, RB, WR, TE, or FLEX.")
    validate_verification_offset({"verification_offset": verification_offset})
    context = LeagueTradeContext(league, fc_data)
    yours = context.team(your_id)
    your_needs = yours["needs"]
    warnings = []
    partners = []
    for roster_id, roster in context.rosters.items():
        if roster_id == str(your_id):
            continue
        try:
            team = context.team(roster_id)
        except (ValueError, RuntimeError) as exc:
            # One unsupported roster must not hide usable recommendations for the rest.
            warnings.append(f"{roster.get('team_name', 'A team')}: {exc}")
            continue
        needs = team["needs"]
        comp = calculate_pair_compatibility(your_needs, needs, requested_position=target_position)
        partners.append({
            "roster_id": int(roster_id),
            "team_name": roster.get("team_name") or f"Team {roster_id}",
            "owner_name": roster.get("owner_name") or "Owner",
            "compatibility_score": comp["score"], "tier": comp["tier"],
            "primary_axis": comp["primary_axis"], "give_position": comp["give_position"],
            "target_position": comp["target_position"],
            "partner_surplus_positions": [p for p, n in needs.items() if n["status"] == "surplus"],
            "partner_need_positions": [p for p, n in needs.items() if n["status"] == "need"],
            "reasons": comp["reasons"], "has_direct_trade": False,
            "direct_trade_preview": None, "suggestion_result": None,
            "verification_status": "not_checked",
        })
    # Keep this ordering stable across pages. Verification badges are separate
    # from the roster-fit score, so checking a page cannot reorder the next one.
    partners.sort(key=lambda p: (-p["compatibility_score"], p["roster_id"]))
    page = partners[verification_offset:verification_offset + PARTNER_PREVIEW_PAGE_SIZE]
    considered = checked = 0
    for index, partner in enumerate(page):
        pair_budget = MAX_PARTNER_CANDIDATE_PAIRS // len(page) + (index < MAX_PARTNER_CANDIDATE_PAIRS % len(page))
        lineup_budget = MAX_PARTNER_LINEUP_CHECKS // len(page) + (index < MAX_PARTNER_LINEUP_CHECKS % len(page))
        try:
            # Never retry an explicit request with ANY. Ready always means a
            # qualifying trade was actually found under these exact preferences.
            result = _generate_from_context(context, your_id, partner["roster_id"], target_position,
                                            preferences, pair_budget, lineup_budget)
        except (ValueError, RuntimeError) as exc:
            partner["verification_status"] = "unavailable"
            partner["verification_message"] = str(exc)
            continue
        considered += result["candidates_considered"]
        checked += result["candidates_checked"]
        partner["search_limited"] = result["search_limited"]
        if result["status"] != "ok":
            partner["verification_status"] = "search_limited" if result["search_limited"] else "no_match"
            continue
        suggestion = result["suggestion"]
        evaluation = suggestion["evaluation"]
        partner["verification_status"] = "ready"
        partner["has_direct_trade"] = True
        # Use the actual target from this verified trade when a card autofills
        # ANY, rather than an earlier heuristic that might suggest another position.
        partner["target_position"] = suggestion["target_position"]
        partner["direct_trade_preview"] = {
            "give": [p["name"] for p in evaluation["give"]],
            "receive": [p["name"] for p in evaluation["receive"]],
            "give_count": len(evaluation["give"]), "receive_count": len(evaluation["receive"]),
            "trade_type": suggestion["trade_type"], "advantage_percent": suggestion["net_advantage_percent"],
            "target_position": suggestion["target_position"],
        }
        # The UI can reuse this verified result for unchanged selections instead
        # of running another search that samples a different candidate shortlist.
        partner["suggestion_result"] = result
        give_positions = "/".join(sorted({p["position"] for p in evaluation["give"]}))
        receive_positions = "/".join(sorted({p["position"] for p in evaluation["receive"]}))
        partner["primary_axis"] = f"Trade your {give_positions} for their {receive_positions}"
    next_offset = verification_offset + len(page)
    return {
        "status": "ok", "your_roster_id": int(your_id), "target_position": target_position,
        "preferences": preferences.as_dict(), "warnings": warnings,
        "your_analysis": {
            "positions": your_needs,
            "surplus_positions": [p for p, n in your_needs.items() if n["status"] == "surplus"],
            "need_positions": [p for p, n in your_needs.items() if n["status"] == "need"],
        },
        "verification": {"offset": verification_offset, "checked_count": len(page),
                         "next_offset": next_offset if next_offset < len(partners) else None,
                         "candidates_considered": considered, "candidates_checked": checked},
        "partners": partners,
    }
