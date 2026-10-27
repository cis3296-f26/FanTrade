import datetime
import requests

BASE_URL = "https://api.sleeper.app/v1"

# Simple in-memory caches
_PLAYER_CACHE = {}
_STATS_CACHE = {}
_PROJECTIONS_CACHE = {}

# 32 NFL Teams Mapping
NFL_TEAMS = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs",
    "LV": "Las Vegas Raiders",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots",
    "NO": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SF": "San Francisco 49ers",
    "SEA": "Seattle Seahawks",
    "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
}


def get_current_nfl_state():
    """
    Dynamically fetches the current NFL state from Sleeper.
    Returns a dict with 'season' and 'week' without any hardcoded dates.
    Falls back to current calendar year if the endpoint fails.
    """
    try:
        resp = requests.get(f"{BASE_URL}/state/nfl", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "season": str(data.get("season")),
                "week": data.get("week"),
                "season_type": data.get("season_type")
            }
    except requests.exceptions.RequestException:
        pass

    today = datetime.date.today()
    estimated_season = str(today.year if today.month >= 8 else today.year - 1)
    return {
        "season": estimated_season,
        "week": None,
        "season_type": "unknown"
    }


def _load_players():
    """Helper to fetch and cache all NFL players from Sleeper."""
    global _PLAYER_CACHE
    if not _PLAYER_CACHE:
        try:
            resp = requests.get(f"{BASE_URL}/players/nfl", timeout=10)
            if resp.status_code == 200:
                _PLAYER_CACHE = resp.json()
        except requests.exceptions.RequestException:
            pass
    return _PLAYER_CACHE


def _load_season_stats(season: str):
    """Helper to fetch and cache seasonal player stats from Sleeper."""
    global _STATS_CACHE
    s_str = str(season)
    if s_str not in _STATS_CACHE:
        try:
            resp = requests.get(f"{BASE_URL}/stats/nfl/regular/{s_str}", timeout=10)
            if resp.status_code == 200:
                _STATS_CACHE[s_str] = resp.json()
        except requests.exceptions.RequestException:
            pass
    return _STATS_CACHE.get(s_str, {})


def _load_season_projections(season: str):
    """Helper to fetch and cache full season projections from Sleeper."""
    global _PROJECTIONS_CACHE
    s_str = str(season)
    if s_str not in _PROJECTIONS_CACHE:
        try:
            resp = requests.get(f"{BASE_URL}/projections/nfl/regular/{s_str}", timeout=10)
            if resp.status_code == 200:
                _PROJECTIONS_CACHE[s_str] = resp.json()
        except requests.exceptions.RequestException:
            pass
    return _PROJECTIONS_CACHE.get(s_str, {})


def get_player_name(player_id: str) -> str:
    """
    Looks up a Sleeper player ID (e.g. '421' -> 'Matthew Stafford (QB - LAR)').
    Handles team defenses (e.g. 'PHI' -> 'PHI Defense').
    """
    p_id = str(player_id).strip()

    if p_id.isalpha() and len(p_id) <= 3:
        team_full = NFL_TEAMS.get(p_id.upper(), p_id)
        return f"{team_full} Defense"

    players = _load_players()
    player_info = players.get(p_id)
    if player_info:
        full_name = player_info.get("full_name")
        pos = player_info.get("position", "")
        team = player_info.get("team", "")
        if full_name:
            return f"{full_name} ({pos} - {team})" if pos else full_name

    return f"Player {p_id}"


def get_all_nfl_teams():
    """Returns a list of all 32 NFL teams with abbreviations and full names."""
    return [{"abbr": abbr, "name": name} for abbr, name in sorted(NFL_TEAMS.items())]


def search_nfl_players(query: str, limit: int = 15, season: str = None, position: str = None):
    """
    Searches NFL players by name, returning their actual stats AND projections for the season.
    Defaults dynamically to the active NFL season if omitted.
    """
    q_clean = query.lower().strip()
    if not q_clean:
        return []

    if not season:
        season = get_current_nfl_state()["season"]

    players = _load_players()
    season_stats = _load_season_stats(season)
    season_projections = _load_season_projections(season)

    pos_filter = position.upper().strip() if position else None
    matches = []

    for pid, p in players.items():
        fname = (p.get("full_name") or "").lower()
        search_name = (p.get("search_full_name") or "")

        if q_clean in fname or q_clean in search_name:
            pos = p.get("position") or "N/A"
            if pos_filter and pos != pos_filter:
                continue

            s = season_stats.get(pid, {})
            proj = season_projections.get(pid, {})

            actual_pts = round(s.get("pts_ppr") or 0.0, 2)
            proj_pts = round(proj.get("pts_ppr") or 0.0, 2)

            matches.append({
                "player_id": pid,
                "name": p.get("full_name"),
                "position": pos,
                "team": p.get("team") or "FA",
                "number": p.get("number"),
                "status": p.get("status", "Active"),
                "season": str(season),
                "stats": {
                    "games_played": int(s.get("gp") or 0),
                    "fantasy_points_ppr": actual_pts,
                    "pass_yards": s.get("pass_yd") or 0.0,
                    "pass_tds": s.get("pass_td") or 0,
                    "rush_yards": s.get("rush_yd") or 0.0,
                    "rush_tds": s.get("rush_td") or 0,
                    "receptions": s.get("rec") or 0,
                    "rec_yards": s.get("rec_yd") or 0.0,
                    "rec_tds": s.get("rec_td") or 0
                },
                "projections": {
                    "fantasy_points_ppr": proj_pts,
                    "pass_yards": proj.get("pass_yd") or 0.0,
                    "pass_tds": proj.get("pass_td") or 0,
                    "rush_yards": proj.get("rush_yd") or 0.0,
                    "rush_tds": proj.get("rush_td") or 0,
                    "receptions": proj.get("rec") or 0,
                    "rec_yards": proj.get("rec_yd") or 0.0,
                    "rec_tds": proj.get("rec_td") or 0
                }
            })

    # Sort by projected points if actual is 0, else by actual points
    matches.sort(key=lambda x: max(x["stats"]["fantasy_points_ppr"], x["projections"]["fantasy_points_ppr"]), reverse=True)
    return matches[:limit]


def get_nfl_team_roster(team_abbr: str, season: str = None):
    """
    Pulls a real-life NFL team's active roster with both actual stats and projections from Sleeper.
    """
    abbr_clean = team_abbr.upper().strip()
    if abbr_clean not in NFL_TEAMS:
        return {"error": f"Invalid NFL team '{team_abbr}'. Valid teams: {', '.join(sorted(NFL_TEAMS.keys()))}"}

    if not season:
        season = get_current_nfl_state()["season"]

    players = _load_players()
    season_stats = _load_season_stats(season)
    season_projections = _load_season_projections(season)

    roster = []
    for pid, p in players.items():
        if p.get("team") == abbr_clean and p.get("status") == "Active":
            s = season_stats.get(pid, {})
            proj = season_projections.get(pid, {})

            actual_pts = round(s.get("pts_ppr") or 0.0, 2)
            proj_pts = round(proj.get("pts_ppr") or 0.0, 2)

            roster.append({
                "player_id": pid,
                "name": p.get("full_name") or f"Player {pid}",
                "position": p.get("position", "N/A"),
                "number": p.get("number"),
                "depth_order": p.get("depth_chart_order", 99),
                "years_exp": p.get("years_exp", 0),
                "college": p.get("college", "N/A"),
                "stats": {
                    "games_played": int(s.get("gp") or 0),
                    "fantasy_points_ppr": actual_pts,
                    "pass_yards": s.get("pass_yd") or 0.0,
                    "pass_tds": s.get("pass_td") or 0,
                    "rush_yards": s.get("rush_yd") or 0.0,
                    "rush_tds": s.get("rush_td") or 0,
                    "receptions": s.get("rec") or 0,
                    "rec_yards": s.get("rec_yd") or 0.0,
                    "rec_tds": s.get("rec_td") or 0
                },
                "projections": {
                    "fantasy_points_ppr": proj_pts,
                    "pass_yards": proj.get("pass_yd") or 0.0,
                    "pass_tds": proj.get("pass_td") or 0,
                    "rush_yards": proj.get("rush_yd") or 0.0,
                    "rush_tds": proj.get("rush_td") or 0,
                    "receptions": proj.get("rec") or 0,
                    "rec_yards": proj.get("rec_yd") or 0.0,
                    "rec_tds": proj.get("rec_td") or 0
                }
            })

    roster.sort(key=lambda x: max(x["stats"]["fantasy_points_ppr"], x["projections"]["fantasy_points_ppr"]), reverse=True)

    return {
        "team": abbr_clean,
        "team_name": NFL_TEAMS[abbr_clean],
        "season": str(season),
        "player_count": len(roster),
        "roster": roster
    }


def get_user_leagues(username: str, season: str = None):
    """
    Fetches user profile and active NFL leagues for a Sleeper username.
    """
    clean_username = username.strip()
    if not clean_username:
        return {"error": "Username cannot be empty"}

    if not season:
        current_state = get_current_nfl_state()
        season = current_state["season"]

    user_resp = requests.get(f"{BASE_URL}/user/{clean_username}", timeout=10)
    if user_resp.status_code == 404 or not user_resp.json():
        return {"error": f"Sleeper user '{clean_username}' not found"}

    user_data = user_resp.json()
    user_id = user_data.get("user_id")
    display_name = user_data.get("display_name", clean_username)

    leagues_resp = requests.get(f"{BASE_URL}/user/{user_id}/leagues/nfl/{season}", timeout=10)
    if leagues_resp.status_code != 200:
        return {"error": f"Failed to retrieve leagues for season {season}"}

    raw_leagues = leagues_resp.json()
    cleaned_leagues = []
    for lg in raw_leagues:
        rec_val = lg.get("scoring_settings", {}).get("rec", 0)
        scoring = "PPR" if rec_val == 1 else "Half-PPR" if rec_val == 0.5 else "Standard"

        cleaned_leagues.append({
            "league_id": lg.get("league_id"),
            "name": lg.get("name"),
            "total_rosters": lg.get("total_rosters"),
            "scoring_type": scoring,
            "season": lg.get("season"),
            "status": lg.get("status")
        })

    return {
        "user_id": user_id,
        "display_name": display_name,
        "active_season": season,
        "league_count": len(cleaned_leagues),
        "leagues": cleaned_leagues
    }


def get_league_rosters(league_id: str, resolve_names: bool = True):
    """
    Fetches all teams and active fantasy rosters for a given Sleeper league ID.
    """
    clean_id = str(league_id).strip()
    if not clean_id:
        return {"error": "League ID cannot be empty"}

    league_resp = requests.get(f"{BASE_URL}/league/{clean_id}", timeout=10)
    if league_resp.status_code != 200 or not league_resp.json():
        return {"error": f"Sleeper league '{clean_id}' not found"}
    league_data = league_resp.json()

    users_resp = requests.get(f"{BASE_URL}/league/{clean_id}/users", timeout=10)
    user_map = {}
    if users_resp.status_code == 200:
        for u in users_resp.json():
            uid = str(u.get("user_id"))
            meta = u.get("metadata") or {}
            team_name = meta.get("team_name") or u.get("display_name") or f"Team {uid}"
            user_map[uid] = {
                "owner_name": u.get("display_name", "Unknown"),
                "team_name": team_name
            }

    rosters_resp = requests.get(f"{BASE_URL}/league/{clean_id}/rosters", timeout=10)
    if rosters_resp.status_code != 200:
        return {"error": f"Failed to retrieve rosters for league {clean_id}"}

    cleaned_rosters = []
    for r in rosters_resp.json():
        owner_id = str(r.get("owner_id", ""))
        owner_info = user_map.get(owner_id, {})
        settings = r.get("settings") or {}

        fpts = round(settings.get("fpts", 0) + (settings.get("fpts_decimal", 0) / 100.0), 2)
        raw_players = r.get("players") or []
        starters_ids = set(r.get("starters") or [])

        players_list = []
        for pid in raw_players:
            p_name = get_player_name(pid) if resolve_names else f"Player {pid}"
            is_starter = pid in starters_ids
            players_list.append({
                "player_id": pid,
                "name": p_name,
                "is_starter": is_starter
            })

        cleaned_rosters.append({
            "roster_id": r.get("roster_id"),
            "owner_name": owner_info.get("owner_name", "Unknown Owner"),
            "team_name": owner_info.get("team_name", f"Team {r.get('roster_id')}"),
            "wins": settings.get("wins", 0),
            "losses": settings.get("losses", 0),
            "ties": settings.get("ties", 0),
            "points": fpts,
            "player_count": len(players_list),
            "players": players_list
        })

    return {
        "league_id": clean_id,
        "name": league_data.get("name", "Unnamed League"),
        "season": league_data.get("season"),
        "total_rosters": len(cleaned_rosters),
        "rosters": cleaned_rosters
    }


if __name__ == "__main__":
    import sys
    print("--- Sleeper Connection Test ---")
    
    arg = sys.argv[1] if len(sys.argv) > 1 else "Mahomes"
    if arg.upper() in NFL_TEAMS:
        print(f"Fetching NFL roster for {arg.upper()}...")
        roster_data = get_nfl_team_roster(arg.upper())
        print(f"Loaded {roster_data['team_name']} ({roster_data['season']}):")
        for p in roster_data["roster"][:3]:
            print(f"  {p['name']} ({p['position']}) | Actual Pts: {p['stats']['fantasy_points_ppr']} | Proj Pts: {p['projections']['fantasy_points_ppr']}")
    else:
        print(f"Searching for player: '{arg}'...")
        results = search_nfl_players(arg, limit=2)
        for r in results:
            print(f"  {r['name']} ({r['position']} - {r['team']}) [{r['season']}]")
            print(f"    Actual: {r['stats']['pass_yards']} pass yds, {r['stats']['fantasy_points_ppr']} pts")
            print(f"    Projected: {r['projections']['pass_yards']} pass yds, {r['projections']['fantasy_points_ppr']} pts")
