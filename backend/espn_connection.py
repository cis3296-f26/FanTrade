import datetime
import re
from collections import defaultdict
from unicodedata import normalize

import requests

from sleeper_connection import NFL_TEAMS

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


ESPN_LINEUP_SLOTS = {
    "0": "QB", "2": "RB", "3": "WRRB_FLEX", "4": "WR", "5": "REC_FLEX",
    "6": "TE", "7": "SUPER_FLEX", "16": "DEF", "17": "K", "23": "FLEX",
}
ESPN_RESERVE_SLOTS = {"20", "21"}
ESPN_RECEPTIONS_STAT_ID = 53


def get_espn_league(league_id: str or int, season: int = None, espn_s2: str = None, swid: str = None):
    """
    Fetches league info, teams, and active rosters from ESPN Fantasy Football v3 API.
    Public leagues require no cookies.
    Private leagues require espn_s2 and swid cookie strings.
    """
    clean_id = str(league_id).strip()
    if not clean_id.isascii() or not clean_id.isdecimal():
        return {"error": "Enter a numeric ESPN league ID.", "status_code": 400}

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
            "error": "This ESPN league requires sign-in. FanTrade currently supports publicly viewable ESPN leagues.",
            "status_code": resp.status_code
        }
    elif resp.status_code == 404:
        return {
            "error": f"ESPN league '{clean_id}' was not found for season {season}. Check the league ID, season, and public viewability setting.",
            "status_code": 404
        }
    elif resp.status_code != 200:
        return {
            "error": f"ESPN returned HTTP error {resp.status_code}",
            "status_code": resp.status_code
        }

    try:
        data = resp.json()
    except ValueError:
        return {"error": "ESPN did not return league data.", "status_code": 502}
    if not isinstance(data, dict) or not isinstance(data.get("teams"), list):
        return {"error": "ESPN did not return a team list.", "status_code": 502}

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
                "injury_status": (pinfo.get("injuryStatus") or "Healthy").replace("ACTIVE", "Healthy"),
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
        "teams": teams,
        "rules": {
            "lineup_slot_counts": (settings.get("rosterSettings") or {}).get("lineupSlotCounts"),
            "num_teams": settings.get("size"),
            "keeper_count": (settings.get("draftSettings") or {}).get("keeperCount"),
            "future_keeper_count": (settings.get("draftSettings") or {}).get("keeperCountFuture"),
            "scoring_type": (settings.get("scoringSettings") or {}).get("scoringType"),
            "scoring_items": (settings.get("scoringSettings") or {}).get("scoringItems"),
        },
    }


def _player_name_key(name):
    ascii_name = normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    without_suffix = re.sub(r"\s+(jr|sr|ii|iii|iv)\.?$", "", ascii_name.strip())
    return re.sub(r"[^a-z0-9]", "", without_suffix)


def espn_trade_rosters(league, player_directory):
    """Map current ESPN roster entries to the calculator's player IDs."""
    candidates = defaultdict(list)
    names = defaultdict(list)
    for player_id, player in player_directory.items():
        position = player.get("position")
        if player.get("espn_id"):
            candidates[(str(player["espn_id"]), position)].append(player_id)
        if player.get("full_name"):
            names[(_player_name_key(player["full_name"]), position)].append(player_id)

    defense_ids = {
        name.rsplit(" ", 1)[-1].casefold(): team
        for team, name in NFL_TEAMS.items()
        if team in player_directory
    }

    rosters = []
    unmapped_count = 0
    for team in league["teams"]:
        players = []
        for player in team["players"]:
            position = player["position"]
            if position == "DEF":
                nickname = player["name"].removesuffix(" D/ST").strip().casefold()
                player_id = defense_ids.get(nickname)
            else:
                matches = candidates[(player["player_id"], position)]
                if not matches:
                    matches = names[(_player_name_key(player["name"]), position)]
                    if len(matches) == 1 and player_directory[matches[0]].get("espn_id"):
                        matches = []
                player_id = matches[0] if len(matches) == 1 else None
            if not player_id:
                unmapped_count += 1
                continue
            players.append({
                **player,
                "player_id": player_id,
                "full_name": player_directory[player_id].get("full_name") or player["name"],
                "team": player_directory[player_id].get("team"),
            })
        rosters.append({**team, "roster_id": str(team["team_id"]), "players": players})
    return {
        "league_id": league["league_id"],
        "name": league["name"],
        "season": league["season"],
        "rosters": rosters,
        "unmapped_count": unmapped_count,
    }


def espn_suggestion_league(league, player_directory):
    """Translate ESPN rules to the roster and scoring inputs the suggestion engine uses."""
    rules = league.get("rules", {})
    if rules.get("keeper_count") != 0 or rules.get("future_keeper_count") not in (None, 0):
        raise ValueError("ESPN suggestions currently support redraft leagues.")

    counts = rules.get("lineup_slot_counts")
    slots = []
    if not isinstance(counts, dict):
        raise ValueError("ESPN did not return lineup settings for this league.")
    for slot_id, count in counts.items():
        if type(count) is not int or count < 0:
            raise ValueError("ESPN returned invalid lineup settings.")
        if not count or slot_id in ESPN_RESERVE_SLOTS:
            continue
        if slot_id not in ESPN_LINEUP_SLOTS or count > 12:
            raise ValueError("This ESPN league's starting lineup format is not supported yet.")
        slots.extend([ESPN_LINEUP_SLOTS[slot_id]] * count)

    scoring_items = rules.get("scoring_items")
    if rules.get("scoring_type") != "H2H_POINTS" or not isinstance(scoring_items, list) or not scoring_items:
        raise ValueError("This ESPN league's scoring format is not supported yet.")
    receptions = [item for item in scoring_items if item.get("statId") == ESPN_RECEPTIONS_STAT_ID]
    if len(receptions) > 1 or any(item.get("pointsOverrides") for item in receptions):
        raise ValueError("ESPN suggestions do not support position-specific reception scoring.")
    ppr = receptions[0].get("points") if receptions else 0
    result = espn_trade_rosters(league, player_directory)
    return {
        **result,
        "total_rosters": len(result["rosters"]),
        "roster_positions": slots,
        "settings": {"type": 0, "num_teams": rules.get("num_teams")},
        "scoring_settings": {"rec": ppr},
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
