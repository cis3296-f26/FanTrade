import datetime
import requests

BASE_URL = "https://api.sleeper.app/v1"

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

    # Dynamic fallback based on calendar date if API call drops
    today = datetime.date.today()
    # If before August, active fantasy cycle usually refers to the prior fall season
    estimated_season = str(today.year if today.month >= 8 else today.year - 1)
    return {
        "season": estimated_season,
        "week": None,
        "season_type": "unknown"
    }

def get_user_leagues(username: str, season: str = None):
    """
    Fetches user profile and active NFL leagues for a Sleeper username.
    If season is None, it dynamically resolves the active NFL season.
    """
    clean_username = username.strip()
    if not clean_username:
        return {"error": "Username cannot be empty"}

    # 1. Dynamically resolve season if not explicitly supplied
    if not season:
        current_state = get_current_nfl_state()
        season = current_state["season"]

    # 2. Resolve username to user_id
    user_resp = requests.get(f"{BASE_URL}/user/{clean_username}", timeout=10)
    if user_resp.status_code == 404 or not user_resp.json():
        return {"error": f"Sleeper user '{clean_username}' not found"}
    
    user_data = user_resp.json()
    user_id = user_data.get("user_id")
    display_name = user_data.get("display_name", clean_username)

    # 3. Fetch leagues for the resolved season
    leagues_resp = requests.get(f"{BASE_URL}/user/{user_id}/leagues/nfl/{season}", timeout=10)
    if leagues_resp.status_code != 200:
        return {"error": f"Failed to retrieve leagues for season {season}"}

    raw_leagues = leagues_resp.json()

    # 4. Clean and normalize league data
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

if __name__ == "__main__":
    import sys
    test_user = sys.argv[1] if len(sys.argv) > 1 else input("Enter Sleeper username to test: ")
    result = get_user_leagues(test_user)
    
    if "error" in result:
        print(f"\nError: {result['error']}")
    else:
        print(f"\nUser Found: {result['display_name']} (User ID: {result['user_id']})")
        print(f"Season: {result['active_season']}")
        print(f"Found {result['league_count']} leagues:")
        for idx, l in enumerate(result["leagues"], start=1):
            print(f"  {idx}. {l['name']} ({l['total_rosters']} teams) | Format: {l['scoring_type']} | ID: {l['league_id']}")