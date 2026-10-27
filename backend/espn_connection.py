import datetime
import requests

ESPN_BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league_id}"

# Standard ESPN position ID mappings
ESPN_POSITION_MAP = {
    1: "QB",
    2: "RB",
    3: "WR",
    4: "TE",
    5: "K",
    16: "DEF"
}


def get_espn_league(league_id: str or int, season: int = None, espn_s2: str = None, swid: str = None):
    """
    Fetches league info, teams, and active rosters from ESPN Fantasy Football v3 API.
    Public leagues require no cookies.
    Private leagues require espn_s2 and swid cookie strings.
    """
    clean_id = str(league_id).strip()
    if not clean_id:
        return {"error": "ESPN league ID cannot be empty"}

    # Default to current season
    if not season:
        today = datetime.date.today()
        season = today.year if today.month >= 8 else today.year - 1

    url = ESPN_BASE_URL.format(season=season, league_id=clean_id)
    params = {"view": ["mTeam", "mRoster", "mSettings"]}

    # Pass cookies if provided (needed for private leagues)
    cookies = {}
    if espn_s2:
        cookies["espn_s2"] = espn_s2
    if swid:
        cookies["SWID"] = swid

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }

    try:
        resp = requests.get(url, params=params, cookies=cookies, headers=headers, timeout=10)
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to connect to ESPN API: {str(e)}"}

    if resp.status_code in (401, 403):
        return {
            "error": "This ESPN league is private. Pass 'espn_s2' and 'swid' cookies to view it.",
            "status_code": resp.status_code
        }
    elif resp.status_code == 404:
        return {
            "error": f"ESPN league '{clean_id}' was not found for season {season}. If this league is private, ESPN blocks access with a 404 unless you pass 'espn_s2' and 'SWID' cookies, or toggle 'Make League Viewable to Public' in ESPN league settings.",
            "status_code": 404
        }
    elif resp.status_code != 200:
        return {
            "error": f"ESPN returned HTTP error {resp.status_code}",
            "status_code": resp.status_code
        }

    data = resp.json()

    # 1. League name
    settings = data.get("settings", {})
    league_name = settings.get("name") or f"ESPN League {clean_id}"

    # 2. Member/Owner lookup
    members = data.get("members", [])
    member_map = {}
    for m in members:
        mid = str(m.get("id"))
        display = m.get("displayName") or f"{m.get('firstName', '')} {m.get('lastName', '')}".strip()
        member_map[mid] = display or f"Owner {mid}"

    # 3. Teams & Rosters
    raw_teams = data.get("teams", [])
    teams = []
    for t in raw_teams:
        team_id = t.get("id")
        location = t.get("location", "").strip()
        nickname = t.get("nickname", "").strip()
        team_name = f"{location} {nickname}".strip() or t.get("name") or f"Team {team_id}"

        owners = t.get("owners") or []
        primary_owner_id = str(t.get("primaryOwner") or (owners[0] if owners else ""))
        owner_name = member_map.get(primary_owner_id, "Unknown Owner")

        record = t.get("record", {}).get("overall", {})
        wins = record.get("wins", 0)
        losses = record.get("losses", 0)
        ties = record.get("ties", 0)
        points = round(record.get("pointsFor", 0.0), 2)

        # Player roster entries
        entries = t.get("roster", {}).get("entries", [])
        players = []
        for entry in entries:
            ppe = entry.get("playerPoolEntry", {})
            pinfo = ppe.get("player", {})
            pos_id = pinfo.get("defaultPositionId")
            position = ESPN_POSITION_MAP.get(pos_id, "N/A")
            slot_id = entry.get("lineupSlotId", 20)

            # Slot 20 in ESPN is Bench, 21 is IR
            is_starter = slot_id not in (20, 21)

            players.append({
                "player_id": str(entry.get("playerId") or pinfo.get("id", "")),
                "name": pinfo.get("fullName", "Unknown Player"),
                "position": position,
                "is_starter": is_starter
            })

        teams.append({
            "team_id": team_id,
            "team_name": team_name,
            "owner_name": owner_name,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "points": points,
            "player_count": len(players),
            "players": players
        })

    return {
        "platform": "espn",
        "league_id": clean_id,
        "name": league_name,
        "season": season,
        "total_rosters": len(teams),
        "teams": teams
    }


if __name__ == "__main__":
    import sys
    print("--- ESPN Connection Test ---")
    test_id = sys.argv[1] if len(sys.argv) > 1 else "610019474"
    test_season = int(sys.argv[2]) if len(sys.argv) > 2 else 2024
    print(f"Connecting to ESPN league {test_id} for season {test_season}...")
    result = get_espn_league(test_id, season=test_season)

    if "error" in result:
        print(f"Result: {result['error']}")
    else:
        print(f"Connected to: {result['name']} ({result['total_rosters']} teams)")
        for t in result["teams"][:3]:
            print(f"  Team: {t['team_name']} ({t['owner_name']}) - Players: {t['player_count']}")
