import datetime
import requests

BASE_URL = "https://api.sleeper.app/v1"

# Simple in-memory caches
_PLAYER_CACHE = {}
_STATS_CACHE = {}
_PROJECTIONS_CACHE = {}
_WEEKLY_PROJECTIONS_CACHE = {}
_WEEKLY_STATS_CACHE = {}
_SCHEDULE_CACHE = {}

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


def _load_weekly_projections(season: str, week: int):
    """Helper to fetch and cache regular season weekly projections from Sleeper."""
    global _WEEKLY_PROJECTIONS_CACHE
    if not week:
        return {}
    key = f"{season}_{week}"
    if key not in _WEEKLY_PROJECTIONS_CACHE:
        try:
            resp = requests.get(f"{BASE_URL}/projections/nfl/regular/{season}/{week}", timeout=10)
            _WEEKLY_PROJECTIONS_CACHE[key] = resp.json() if resp.status_code == 200 else {}
        except Exception:
            _WEEKLY_PROJECTIONS_CACHE[key] = {}
    return _WEEKLY_PROJECTIONS_CACHE.get(key, {})


def _load_weekly_stats(season: str, week: int):
    """Helper to fetch and cache regular season weekly actual stats from Sleeper."""
    global _WEEKLY_STATS_CACHE
    if not week:
        return {}
    key = f"{season}_{week}"
    if key not in _WEEKLY_STATS_CACHE:
        try:
            resp = requests.get(f"{BASE_URL}/stats/nfl/regular/{season}/{week}", timeout=10)
            _WEEKLY_STATS_CACHE[key] = resp.json() if resp.status_code == 200 else {}
        except Exception:
            _WEEKLY_STATS_CACHE[key] = {}
    return _WEEKLY_STATS_CACHE.get(key, {})


def _load_weekly_matchups(season: str, week: int):
    """Helper to determine each NFL team's weekly matchup (e.g. 'vs PHI', '@ KC', 'BYE')."""
    global _SCHEDULE_CACHE
    if not week:
        return {}
    key = f"{season}_{week}"
    if key not in _SCHEDULE_CACHE:
        matchups = {}
        try:
            import nfl_data_py as nfl
            sched = nfl.import_schedules([int(season)])
            week_games = sched[sched["week"] == int(week)]
            for _, row in week_games.iterrows():
                home = str(row["home_team"]).strip().replace("LA", "LAR")
                away = str(row["away_team"]).strip().replace("LA", "LAR")
                matchups[home] = f"vs {away}"
                matchups[away] = f"@ {home}"
        except Exception:
            pass
        _SCHEDULE_CACHE[key] = matchups
    return _SCHEDULE_CACHE.get(key, {})


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

            avatar_url = (
                f"https://sleepercdn.com/images/team_logos/nfl/{pid.lower()}.png"
                if pid.isalpha() and len(pid) <= 3
                else f"https://sleepercdn.com/content/nfl/players/thumb/{pid}.jpg"
            )

            matches.append({
                "player_id": pid,
                "name": p.get("full_name"),
                "position": pos,
                "team": p.get("team") or "FA",
                "number": p.get("number"),
                "avatar_url": avatar_url,
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

    # Determine league scoring setting (Half-PPR, PPR, or Standard)
    rec_scoring = league_data.get("scoring_settings", {}).get("rec", 1.0)
    pts_key = "pts_half_ppr" if rec_scoring == 0.5 else ("pts_std" if rec_scoring == 0 else "pts_ppr")

    # Fetch NFL state, weekly projections, weekly stats, matchups, and player metadata
    nfl_state = get_current_nfl_state()
    active_season = nfl_state.get("season") or str(league_data.get("season", "2026"))
    active_week = nfl_state.get("week")
    weekly_proj = _load_weekly_projections(active_season, active_week)
    weekly_stats = _load_weekly_stats(active_season, active_week)
    weekly_matchups = _load_weekly_matchups(active_season, active_week)
    all_players = _load_players()

    roster_positions = league_data.get("roster_positions") or []
    starter_slots = [pos for pos in roster_positions if pos != "BN"]
    pos_order_map = {"QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6}

    cleaned_rosters = []
    for r in rosters_resp.json():
        owner_id = str(r.get("owner_id", ""))
        owner_info = user_map.get(owner_id, {})
        settings = r.get("settings") or {}
        fpts = round(settings.get("fpts", 0) + (settings.get("fpts_decimal", 0) / 100.0), 2)
        
        starters_raw = r.get("starters") or []
        starters_set = set(str(pid).strip() for pid in starters_raw if pid and str(pid).strip() != "0")
        all_pids = [str(pid).strip() for pid in (r.get("players") or [])]

        def _format_player(pid, is_starter=False, slot="BN"):
            p_id = str(pid).strip()
            if p_id.isalpha() and len(p_id) <= 3:
                team = p_id.upper()
                full_name = f"{NFL_TEAMS.get(team, team)} Defense"
                pos, avatar = "DEF", f"https://sleepercdn.com/images/team_logos/nfl/{team.lower()}.png"
                injury = "Healthy"
            else:
                p = all_players.get(p_id, {})
                full_name = p.get("full_name") or f"Player {p_id}"
                pos, team = p.get("position", "N/A"), p.get("team", "FA")
                avatar = f"https://sleepercdn.com/content/nfl/players/thumb/{p_id}.jpg"
                injury = p.get("injury_status") or ("Healthy" if p.get("status") == "Active" else p.get("status", "Healthy"))

            p_proj_data = weekly_proj.get(p_id) or (weekly_proj.get(team) if pos == "DEF" else {}) or {}
            p_stat_data = weekly_stats.get(p_id) or (weekly_stats.get(team) if pos == "DEF" else {}) or {}

            proj = p_proj_data.get(pts_key)
            if proj is None:
                proj = p_proj_data.get("pts_ppr")

            act = p_stat_data.get(pts_key)
            if act is None:
                act = p_stat_data.get("pts_ppr")

            matchup = weekly_matchups.get(team, "BYE" if team in NFL_TEAMS else None)

            return {
                "player_id": p_id,
                "name": f"{full_name} ({pos} - {team})" if pos != "N/A" and team != "FA" else full_name,
                "full_name": full_name,
                "position": pos,
                "team": team,
                "slot": slot,
                "avatar_url": avatar,
                "injury_status": injury,
                "matchup": matchup,
                "actual_points": round(act, 2) if act is not None else None,
                "projected_points": round(proj, 2) if proj is not None else None,
                "is_starter": is_starter
            }

        # Starters strictly follow starting lineup slots (QB -> RB -> WR -> TE -> FLEX -> K -> DEF)
        starters_list = []
        for idx, pid in enumerate(starters_raw):
            p_clean = str(pid).strip()
            if not p_clean or p_clean == "0":
                continue
            slot = starter_slots[idx] if idx < len(starter_slots) else "STARTER"
            starters_list.append(_format_player(p_clean, is_starter=True, slot=slot))

        # Bench sorted by position priority (QB -> RB -> WR -> TE -> K -> DEF) then points
        bench_list = []
        for pid in all_pids:
            if pid not in starters_set:
                bench_list.append(_format_player(pid, is_starter=False, slot="BN"))

        bench_list.sort(key=lambda p: (
            pos_order_map.get(p["position"], 99),
            -(p["projected_points"] or 0),
            -(p["actual_points"] or 0),
            p["full_name"]
        ))

        players_list = starters_list + bench_list

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
        # Keep the full slot list, including slots with no starter assigned yet.
        "roster_positions": list(roster_positions),
        # Pass through league rules so trade analysis doesn't assume default scoring.
        "scoring_settings": dict(league_data.get("scoring_settings") or {}),
        "settings": dict(league_data.get("settings") or {}),
        "rosters": cleaned_rosters
    }


def get_available_players(league_id: str, query: str = "", position: str = None, limit: int = 100):
    """Returns active fantasy players who are not rostered in the Sleeper league."""
    clean_id = str(league_id).strip()
    if not clean_id:
        return {"error": "League ID cannot be empty"}

    try:
        rosters_resp = requests.get(f"{BASE_URL}/league/{clean_id}/rosters", timeout=10)
    except requests.exceptions.RequestException:
        return {"error": "Could not reach Sleeper. Please try again."}
    if rosters_resp.status_code == 404:
        return {"error": f"Sleeper league '{clean_id}' not found"}
    if rosters_resp.status_code != 200:
        return {"error": f"Failed to retrieve rosters for league {clean_id}"}

    try:
        rosters = rosters_resp.json()
    except ValueError:
        return {"error": "Sleeper returned invalid roster data"}
    if not isinstance(rosters, list):
        return {"error": "Sleeper returned invalid roster data"}

    rostered_ids = set()
    for roster in rosters:
        if not isinstance(roster, dict):
            continue
        for field in ("players", "starters", "reserve", "taxi"):
            roster_players = roster.get(field) or []
            if not isinstance(roster_players, list):
                continue
            rostered_ids.update(
                str(player_id)
                for player_id in roster_players
                if player_id and str(player_id) != "0"
            )

    players = _load_players()
    if not players:
        return {"error": "Player directory is unavailable. Try again."}

    nfl_state = get_current_nfl_state()
    season = nfl_state.get("season")
    week = nfl_state.get("week")
    projections = _load_weekly_projections(season, week) if season and week else {}

    clean_query = query.strip().lower()
    clean_position = position.upper().strip() if position else None

    def projected_points(player_id):
        projection = projections.get(str(player_id)) or {}
        return projection.get("pts_ppr") if isinstance(projection, dict) else None

    available = []
    for player_id, player in players.items():
        player_position = player.get("position")
        if (
            str(player_id) in rostered_ids
            or player.get("status") != "Active"
            or player_position not in {"QB", "RB", "WR", "TE", "K"}
            or (clean_position and player_position != clean_position)
        ):
            continue

        name = (player.get("full_name") or "").strip()
        if clean_query and clean_query not in name.lower():
            continue

        available.append({
            "player_id": str(player_id),
            "name": name or f"Player {player_id}",
            "position": player_position,
            "team": player.get("team") or "FA",
            "age": player.get("age"),
            "injury_status": player.get("injury_status") or "Healthy",
            "search_rank": player.get("search_rank"),
            "expected_points": projected_points(player_id),
            "avatar_url": f"https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg",
        })

    if not clean_position or clean_position == "DEF":
        for team, team_name in NFL_TEAMS.items():
            defense_name = f"{team_name} Defense"
            if team not in rostered_ids and clean_query in defense_name.lower():
                available.append({
                    "player_id": team,
                    "name": defense_name,
                    "position": "DEF",
                    "team": team,
                    "age": None,
                    "injury_status": "Healthy",
                    "search_rank": None,
                    "expected_points": projected_points(team),
                    "avatar_url": f"https://sleepercdn.com/images/team_logos/nfl/{team.lower()}.png",
                })

    def sort_key(player):
        try:
            rank = int(player["search_rank"])
        except (TypeError, ValueError):
            rank = 999999
        try:
            expected_points = float(player["expected_points"])
        except (TypeError, ValueError):
            expected_points = None
        return (
            expected_points is None,
            -(expected_points or 0),
            rank,
            player["name"].lower(),
        )

    available.sort(key=sort_key)
    return {"league_id": clean_id, "players": available[:max(1, min(limit, 200))]}


def get_trending_players(trend_type: str, lookback_hours: int = 24, limit: int = 25):
    """Fetches Sleeper trending adds or drops and resolves player details."""
    clean_type = str(trend_type).lower().strip()
    if clean_type not in {"add", "drop"}:
        return {"error": "Trend type must be 'add' or 'drop'."}

    try:
        response = requests.get(
            f"{BASE_URL}/players/nfl/trending/{clean_type}",
            params={"lookback_hours": lookback_hours, "limit": limit},
            timeout=10,
        )
    except requests.exceptions.RequestException:
        return {"error": "Could not reach Sleeper. Please try again."}

    if response.status_code != 200:
        return {"error": f"Sleeper could not retrieve trending {clean_type}s."}

    try:
        trending = response.json()
    except ValueError:
        return {"error": "Sleeper returned invalid trending data."}
    if not isinstance(trending, list):
        return {"error": "Sleeper returned invalid trending data."}

    players = _load_players()
    if not players:
        return {"error": "Player directory is unavailable. Try again."}

    results = []
    for item in trending:
        if not isinstance(item, dict) or not item.get("player_id"):
            continue
        player_id = str(item["player_id"])
        player = players.get(player_id, {})
        results.append({
            "player_id": player_id,
            "name": player.get("full_name") or f"Player {player_id}",
            "position": player.get("position") or "N/A",
            "team": player.get("team") or "FA",
            "count": item.get("count", 0),
            "avatar_url": f"https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg",
        })

    return {"trend_type": clean_type, "players": results}


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
