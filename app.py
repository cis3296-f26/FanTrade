from flask import Flask, jsonify, request
from sleeper_connection import get_user_leagues, get_current_nfl_state
from nfl_pbp_connection import get_play_by_play_data, get_summary_stats

app = Flask(__name__)
PBP_CACHE = {}
COLS = ["game_id", "season", "week", "home_team", "away_team", "play_type", "yards_gained", "desc"]


@app.route("/")
def home():
    return '<h1>FanTrade Demo</h1><p><a href="/sleeper?username=GSM4">Sleeper</a> | <a href="/pbp?team=PHI&season=2025">PBP</a></p>'


@app.route("/sleeper")
def sleeper_demo():
    user = request.args.get("username")
    return jsonify(get_user_leagues(user) if user else {"nfl_state": get_current_nfl_state()})


@app.route("/pbp")
def pbp_demo():
    season = request.args.get("season", 2025, type=int)
    team = request.args.get("team", "").upper().strip()

    if season not in PBP_CACHE:
        df = get_play_by_play_data(seasons=[season], columns=COLS)
        if df.empty and season != 2025:
            df = PBP_CACHE.get(2025, get_play_by_play_data(seasons=[2025], columns=COLS))
            season = 2025
        if df.empty:
            return jsonify({"error": f"Failed to load season {season}"}), 500
        PBP_CACHE[season] = df

    df = PBP_CACHE[season]
    if team:
        df = df[(df["home_team"] == team) | (df["away_team"] == team)]

    return jsonify({
        "season": season,
        "team": team or None,
        "summary": get_summary_stats(df),
        "sample_plays": df.head(5).to_dict(orient="records")
    })


if __name__ == "__main__":
    app.run(debug=True)