from flask import Flask, Blueprint, jsonify, request
from sleeper_connection import (
    _load_players,
    get_user_leagues,
    get_current_nfl_state,
    get_league_rosters,
    get_nfl_team_roster,
    get_all_nfl_teams,
    search_nfl_players,
)
from espn_connection import get_espn_league
from nfl_pbp_connection import get_play_by_play_data, get_summary_stats

from db import get_db

app = Flask(__name__)
api = Blueprint("api", __name__, url_prefix="/api")

PBP_CACHE = {}
COLS = ["game_id", "season", "week", "home_team", "away_team", "play_type", "yards_gained", "desc"]


@api.route("/health")
def health():
    return jsonify({"status": "ok"})


@api.route("/sleeper")
def sleeper_demo():
    user = request.args.get("username")
    return jsonify(get_user_leagues(user) if user else {"nfl_state": get_current_nfl_state()})


@api.route("/sleeper/rosters")
@api.route("/sleeper/rosters/<league_id>")
def sleeper_rosters_demo(league_id=None):
    target_id = league_id or request.args.get("league_id", "1258183584468971520")
    return jsonify(get_league_rosters(target_id))


@api.route("/espn")
@api.route("/espn/<league_id>")
def espn_demo(league_id=None):
    target_id = league_id or request.args.get("league_id", "16016")
    season = request.args.get("season", 2026, type=int)
    espn_s2 = request.args.get("espn_s2")
    swid = request.args.get("swid")
    return jsonify(get_espn_league(target_id, season=season, espn_s2=espn_s2, swid=swid))


@api.route("/nfl/teams")
def nfl_teams():
    return jsonify(get_all_nfl_teams())


@api.route("/nfl/team/<team>")
def nfl_team_roster_route(team):
    season = request.args.get("season")
    return jsonify(get_nfl_team_roster(team, season=season))


@api.route("/players/search")
def player_search_route():
    query = request.args.get("q") or request.args.get("query", "")
    season = request.args.get("season")
    pos = request.args.get("position")
    limit = request.args.get("limit", 15, type=int)
    return jsonify(search_nfl_players(query, limit=limit, season=season, position=pos))


@api.route("/pbp")
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


@api.route("/trade-evaluation/players")
def trade_players():
    # Identity lookup only: avoids loading projections just to search names.
    query = request.args.get("q", "").strip().lower()

    if len(query) < 2:
        return jsonify([])

    players = _load_players()

    if not players:
        return jsonify({
            "error": "Player directory is unavailable. Try again."
        }), 503

    matches = [
        {
            "player_id": str(pid),
            "name": player.get("full_name"),
            "team": player.get("team") or "FA",
        }
        for pid, player in players.items()
        if player.get("position") in {"QB", "WR", "RB", "TE", "K", "DEF"}
        and query in (player.get("full_name") or "").lower()
        ]

    return jsonify(
        sorted(matches, key=lambda player: player["name"])[:20]
    )


@api.route("/trade-evaluation", methods=["POST"])
def trade_evaluation():
    from trade_calculation import calculate_trade, load_season
    from datetime import datetime

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object."}), 400

    season = data.get("season")

    if (
        isinstance(season, bool)
        or not isinstance(season, int)
        or not 1999 <= season <= datetime.now().year
    ):
        return jsonify({
            "error": "Choose a valid season from 1999 through this year."
        }), 400

    try:
        players = _load_players()

        if not players:
            raise RuntimeError(
                "Player directory is unavailable. Try again."
            )

        result = calculate_trade(
            data,
            players,
            load_season(season),
        )

        return jsonify({
            **result,
            "season": season,
            "ppr": data.get("ppr", 1),
            "source": "NFLverse regular-season statistics",
        })

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception:
        app.logger.exception("Trade data loading failed")

        return jsonify({
            "error": (
                "Could not load NFLverse season stats. "
                "Try again or choose another season."
            )
        }), 503

# ------------------------------------------------------------------------------
# USER DATABASE ROUTES (Async Turso Connection)
# ------------------------------------------------------------------------------

@api.route("/users/create", methods=["POST"])
async def create_user():
    data = request.get_json() or {}
    username = data.get("username")
    email = data.get("email")

    if not username or not email:
        return jsonify({"error": "Username and email are required"}), 400

    try:
        client = await get_db()
        async with client:
            res = await client.execute(
                "INSERT INTO users (username, email) VALUES (?, ?)",
                [username, email]
            )
            return jsonify({
                "success": True,
                "user_id": res.last_insert_rowid,
                "username": username
            }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.route("/users/<int:user_id>/link-league", methods=["POST"])
async def link_league_to_user(user_id):
    data = request.get_json() or {}
    league_id = data.get("league_id")
    platform = data.get("platform", "sleeper")

    if not league_id:
        return jsonify({"error": "League ID is required"}), 400

    try:
        client = await get_db()
        async with client:
            await client.execute(
                "INSERT INTO user_leagues (user_id, league_id, platform) VALUES (?, ?, ?)",
                [user_id, league_id, platform]
            )
            return jsonify({
                "success": True,
                "message": f"Linked {platform} league {league_id} to user {user_id}"
            }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.route("/users/<int:user_id>", methods=["GET"])
async def get_user_profile(user_id):
    try:
        client = await get_db()
        async with client:
            user_res = await client.execute(
                "SELECT id, username, email FROM users WHERE id = ?",
                [user_id]
            )
            if not user_res.rows:
                return jsonify({"error": "User not found"}), 404

            user = {
                "id": user_res.rows[0][0],
                "username": user_res.rows[0][1],
                "email": user_res.rows[0][2]
            }

            leagues_res = await client.execute(
                "SELECT league_id, platform FROM user_leagues WHERE user_id = ?",
                [user_id]
            )
            user["saved_leagues"] = [
                {"league_id": r[0], "platform": r[1]} for r in leagues_res.rows
            ]

            return jsonify({"user": user})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Register the API Blueprint with Flask app
app.register_blueprint(api)

if __name__ == "__main__":
    app.run(port=5001, debug=True)