from backend.sleeper_connection import (
    get_user_leagues,
    get_current_nfl_state,
    get_league_rosters,
    get_nfl_team_roster,
    get_all_nfl_teams,
    search_nfl_players
)
from backend.espn_connection import get_espn_league
from nfl_pbp_connection import get_play_by_play_data, get_summary_stats

app = Flask(__name__)
PBP_CACHE = {}
CORS(app, origins=["http://localhost:5173"])
COLS = ["game_id", "season", "week", "home_team", "away_team", "play_type", "yards_gained", "desc"]


@app.route("/")
def home():
    return (
        '<h1>FanTrade Demo</h1><p>'
        '<a href="/sleeper?username=GSM4">Sleeper User</a> | '
        '<a href="/sleeper/rosters?league_id=1258183584468971520">Sleeper Rosters</a> | '
        '<a href="/espn?league_id=16016&season=2026">ESPN League (16016)</a> | '
        '<a href="/nfl/team/PHI?season=2026">Real NFL Roster (Eagles)</a> | '
        '<a href="/players/search?q=Saquon">Search Player (Saquon)</a> | '
        '<a href="/pbp?team=PHI&season=2026">PBP</a> | '
        '<a href="/trade-evaluation">Trade Evaluation</a>'
        '</p>'
    )


@app.route("/sleeper")
def sleeper_demo():
    user = request.args.get("username")
    return jsonify(get_user_leagues(user) if user else {"nfl_state": get_current_nfl_state()})


@app.route("/sleeper/rosters")
@app.route("/sleeper/rosters/<league_id>")
def sleeper_rosters_demo(league_id=None):
    target_id = league_id or request.args.get("league_id", "1258183584468971520")
    return jsonify(get_league_rosters(target_id))


@app.route("/espn")
@app.route("/espn/<league_id>")
def espn_demo(league_id=None):
    target_id = league_id or request.args.get("league_id", "16016")
    season = request.args.get("season", 2026, type=int)
    espn_s2 = request.args.get("espn_s2")
    swid = request.args.get("swid")
    return jsonify(get_espn_league(target_id, season=season, espn_s2=espn_s2, swid=swid))


@app.route("/nfl/teams")
def nfl_teams():
    return jsonify(get_all_nfl_teams())


@app.route("/nfl/team/<team>")
def nfl_team_roster_route(team):
    season = request.args.get("season")
    return jsonify(get_nfl_team_roster(team, season=season))


@app.route("/players/search")
def player_search_route():
    query = request.args.get("q") or request.args.get("query", "")
    season = request.args.get("season")
    pos = request.args.get("position")
    limit = request.args.get("limit", 15, type=int)
    return jsonify(search_nfl_players(query, limit=limit, season=season, position=pos))


@app.route("/pbp")
def pbp_demo():
    season = request.args.get("season", 2026, type=int)
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


@app.route('/trade-evaluation')
def trade_evaluation():
    return "<h1>Trade Evaluation</h1><p>Evaluate trades here</p>"


if __name__ == '__main__':
    app.run(debug=True)
