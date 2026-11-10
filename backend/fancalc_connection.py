"""FanCalc (FantasyCalc) API integration for fantasy football trade evaluations.

Provides market-consensus trade values based on real fantasy football trades.
Per FantasyCalc API terms:
- Data is cached for 3 hours per parameter combination.
- Attribution is provided with links to https://fantasycalc.com.
"""

import logging
import time
import urllib.parse
import urllib.request
import json
from typing import Callable, Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# In-memory cache: (is_dynasty, num_qbs, num_teams, ppr) -> (timestamp, data)
_CACHE: Dict[tuple, tuple] = {}
CACHE_TTL = 3 * 3600  # 3 hours per FantasyCalc guidelines

FANCALC_API_BASE = "https://api.fantasycalc.com/values/current"


def fetch_fancalc_values(
    is_dynasty: bool = False,
    num_qbs: int = 1,
    num_teams: int = 12,
    ppr: float = 1.0,
) -> List[Dict[str, Any]]:
    """Fetch current player trade values from FantasyCalc with caching."""
    cache_key = (bool(is_dynasty), int(num_qbs), int(num_teams), float(ppr))
    now = time.monotonic()

    cached = _CACHE.get(cache_key)
    if cached and (now - cached[0] < CACHE_TTL):
        return cached[1]

    params = {
        "isDynasty": "true" if is_dynasty else "false",
        "numQbs": str(num_qbs),
        "numTeams": str(num_teams),
        "ppr": str(ppr),
    }
    url = f"{FANCALC_API_BASE}?{urllib.parse.urlencode(params)}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "FanTrade/1.0 (Fantasy Football Analytics)",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(data, list):
                raise ValueError("Unexpected response from FantasyCalc API")
            _CACHE[cache_key] = (now, data)
            return data
    except Exception as exc:
        # If fetch fails but we have stale cache, fall back to stale cache
        if cached:
            logger.warning("FantasyCalc fetch failed (%s); using stale cache", exc)
            return cached[1]
        logger.exception("Failed to fetch FantasyCalc values")
        raise RuntimeError(
            "FantasyCalc trade value service is currently unreachable. Please try again."
        ) from exc


def evaluate_fancalc_trade(
    give_ids: List[str],
    receive_ids: List[str],
    is_dynasty: bool = False,
    num_qbs: int = 1,
    num_teams: int = 12,
    ppr: float = 1.0,
    sleeper_players: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate trade values using FantasyCalc data for both sides."""
    fc_data = fetch_fancalc_values(
        is_dynasty=is_dynasty,
        num_qbs=num_qbs,
        num_teams=num_teams,
        ppr=ppr,
    )

    # Keep the calculator's existing ID fallback while sharing the lookup code.
    resolve_player = build_player_value_lookup(
        fc_data, sleeper_players, allow_fancalc_ids=True
    )
    give_players = [resolve_player(pid) for pid in give_ids]
    receive_players = [resolve_player(pid) for pid in receive_ids]

    return evaluate_player_values(
        give_players, receive_players,
        is_dynasty=is_dynasty, num_qbs=num_qbs, num_teams=num_teams, ppr=ppr,
    )


def build_player_value_lookup(
    fc_data: List[Dict[str, Any]],
    sleeper_players: Optional[Dict[str, Any]] = None,
    *,
    allow_fancalc_ids: bool = False,
) -> Callable[[str], Dict[str, Any]]:
    """Prepare a reusable player lookup without fetching any data."""
    # Build these once so every candidate uses the same set of market values.
    sleeper_map = {}
    name_map = {}
    fc_id_map = {}

    for item in fc_data:
        p = item.get("player") or {}
        sleeper_id = p.get("sleeperId")
        if sleeper_id:
            sleeper_map[str(sleeper_id)] = item
        name = p.get("name")
        if name:
            name_map[name.strip().lower()] = item
        fc_id = p.get("id")
        if fc_id:
            fc_id_map[str(fc_id)] = item

    sleeper_dir = sleeper_players or {}

    def resolve_player(pid: str) -> Dict[str, Any]:
        pid_str = str(pid).strip()
        matched_item = sleeper_map.get(pid_str)

        # Fallback to Sleeper directory for name matching if needed
        sleeper_info = sleeper_dir.get(pid_str, {})
        if not matched_item and sleeper_info:
            s_name = sleeper_info.get("full_name", "").strip().lower()
            if s_name:
                matched_item = name_map.get(s_name)

        # Sleeper-only callers must not confuse IDs from the two services.
        if not matched_item and allow_fancalc_ids:
            matched_item = fc_id_map.get(pid_str)

        if matched_item:
            player_obj = matched_item.get("player", {})
            return {
                "player_id": pid_str,
                "name": player_obj.get("name", "Unknown Player"),
                "position": player_obj.get("position") or sleeper_info.get("position") or "FLEX",
                "team": player_obj.get("maybeTeam") or sleeper_info.get("team") or "FA",
                "value": int(matched_item.get("value", 0)),
                "overall_rank": matched_item.get("overallRank"),
                "position_rank": matched_item.get("positionRank"),
                "trend_30_day": matched_item.get("trend30Day", 0),
                "unranked": False,
            }

        # Player not ranked in FantasyCalc (e.g. deep bench/waiver)
        return {
            "player_id": pid_str,
            "name": sleeper_info.get("full_name") or f"Player {pid_str}",
            "position": sleeper_info.get("position") or "FLEX",
            "team": sleeper_info.get("team") or "FA",
            "value": 0,
            "overall_rank": None,
            "position_rank": None,
            "trend_30_day": 0,
            "unranked": True,
        }

    # Each call returns a fresh player record, leaving the cached data untouched.
    return resolve_player


def evaluate_player_values(
    give_players: List[Dict[str, Any]],
    receive_players: List[Dict[str, Any]],
    *,
    is_dynasty: bool = False,
    num_qbs: int = 1,
    num_teams: int = 12,
    ppr: float = 1.0,
) -> Dict[str, Any]:
    """Score already-valued players without another fetch or lookup rebuild."""
    # Keep the calculator's totals and verdict rules in one place for both features.
    give_total = sum(p["value"] for p in give_players)
    receive_total = sum(p["value"] for p in receive_players)
    difference = receive_total - give_total

    max_side = max(give_total, receive_total)
    diff_pct = round((difference / max_side) * 100, 1) if max_side > 0 else 0.0

    # Trade fairness determination: within 5-6% or 400 points is considered a fair/even deal
    threshold = max(400, int(max_side * 0.06))
    if abs(difference) <= threshold:
        verdict = "Fair Trade"
        favors = "Even"
        trade_label = "Fair Trade"
    elif difference > 0:
        verdict = f"Winning Trade (+{difference:,} pts)"
        favors = "Receive"
        trade_label = "Winning Trade"
    else:
        verdict = f"Losing Trade (-{abs(difference):,} pts)"
        favors = "Give"
        trade_label = "Losing Trade"

    return {
        "mode": "fancalc",
        "verdict": verdict,
        "favors": favors,
        "trade_label": trade_label,
        "threshold": threshold,
        "give_total": give_total,
        "receive_total": receive_total,
        "difference": difference,
        "diff_percentage": diff_pct,
        "give": give_players,
        "receive": receive_players,
        "is_dynasty": is_dynasty,
        "num_qbs": num_qbs,
        "num_teams": num_teams,
        "ppr": ppr,
        "source": "FantasyCalc Consensus Values",
        "attribution": "Trade values powered by FantasyCalc",
        "attribution_url": "https://fantasycalc.com",
    }
