import os
import re
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from sleeper_connection import (
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
app.config.update(
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv(
        "SESSION_COOKIE_SECURE", "true" if os.getenv("VERCEL") else "false"
    ).lower() not in ("0", "false", "no"),
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    MAX_CONTENT_LENGTH=16 * 1024,
)
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


@api.route("/trade-evaluation")
def trade_evaluation():
    return jsonify({"message": "Evaluate trades here"})


# ------------------------------------------------------------------------------
# ACCOUNT AND SAVED-LEAGUE ROUTES
# ------------------------------------------------------------------------------

def auth_configuration_error():
    if not app.config["SECRET_KEY"]:
        return jsonify({"error": "Account sign-in is not configured on the server."}), 503
    return None


def account_from_rows(user_row, league_rows):
    return {
        "user": {"id": user_row[0], "username": user_row[1]},
        "saved_leagues": [
            {
                "league_id": row[0],
                "platform": row[1],
                "league_name": row[2] or row[0],
            }
            for row in league_rows
        ],
    }


async def load_account(client, user_id):
    user_result = await client.execute(
        "SELECT id, username FROM users WHERE id = ?",
        [user_id],
    )
    if not user_result.rows:
        return None

    leagues_result = await client.execute(
        """
        SELECT league_id, platform, league_name
        FROM user_leagues
        WHERE user_id = ?
        ORDER BY id
        """,
        [user_id],
    )
    return account_from_rows(user_result.rows[0], leagues_result.rows)


@api.route("/auth/register", methods=["POST"])
async def register():
    configuration_error = auth_configuration_error()
    if configuration_error:
        return configuration_error

    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Username and password are required."}), 400

    username = username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,32}", username):
        return jsonify({
            "error": "Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens."
        }), 400
    if len(password) < 8 or len(password) > 128:
        return jsonify({"error": "Password must be between 8 and 128 characters."}), 400

    try:
        client = await get_db()
        async with client:
            existing = await client.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
                [username],
            )
            if existing.rows:
                return jsonify({"error": "That username is already taken."}), 409

            result = await client.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                [username, generate_password_hash(password)],
            )
            session.clear()
            session["user_id"] = result.last_insert_rowid
            session.permanent = True
            account = await load_account(client, result.last_insert_rowid)
            return jsonify(account), 201
    except Exception:
        app.logger.exception("Unable to register account")
        return jsonify({"error": "Account registration failed. Please try again."}), 500


@api.route("/auth/login", methods=["POST"])
async def login():
    configuration_error = auth_configuration_error()
    if configuration_error:
        return configuration_error

    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Username and password are required."}), 400

    username = username.strip().lower()
    try:
        client = await get_db()
        async with client:
            result = await client.execute(
                """
                SELECT id, username, password_hash
                FROM users
                WHERE username = ? COLLATE NOCASE
                """,
                [username],
            )
            if (
                not result.rows
                or not result.rows[0][2]
                or not check_password_hash(result.rows[0][2], password)
            ):
                return jsonify({"error": "Incorrect username or password."}), 401

            session.clear()
            session["user_id"] = result.rows[0][0]
            session.permanent = True
            account = await load_account(client, result.rows[0][0])
            return jsonify(account)
    except Exception:
        app.logger.exception("Unable to sign in")
        return jsonify({"error": "Sign-in failed. Please try again."}), 500


@api.route("/auth/logout", methods=["POST"])
def logout():
    configuration_error = auth_configuration_error()
    if configuration_error:
        return configuration_error
    session.clear()
    return jsonify({"success": True})


@api.route("/auth/me")
async def current_account():
    configuration_error = auth_configuration_error()
    if configuration_error:
        return configuration_error

    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"user": None, "saved_leagues": []})

    try:
        client = await get_db()
        async with client:
            account = await load_account(client, user_id)
        if account is None:
            session.clear()
            return jsonify({"user": None, "saved_leagues": []})
        return jsonify(account)
    except Exception:
        app.logger.exception("Unable to load account")
        return jsonify({"error": "Unable to load your account. Please try again."}), 500


@api.route("/users/me/leagues", methods=["POST", "DELETE"])
async def saved_leagues():
    configuration_error = auth_configuration_error()
    if configuration_error:
        return configuration_error

    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"error": "Sign in to manage saved leagues."}), 401

    data = request.get_json(silent=True) or {}
    league_id = data.get("league_id")
    platform = data.get("platform", "sleeper")
    if not isinstance(league_id, str) or not league_id.strip():
        return jsonify({"error": "A league ID is required."}), 400
    if platform != "sleeper":
        return jsonify({"error": "Only Sleeper leagues can be saved right now."}), 400
    league_id = league_id.strip()

    try:
        client = await get_db()
        async with client:
            if request.method == "POST":
                league_name = data.get("league_name")
                if not isinstance(league_name, str) or not league_name.strip():
                    league_name = league_id
                await client.execute(
                    """
                    INSERT INTO user_leagues (user_id, league_id, platform, league_name)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id, league_id, platform)
                    DO UPDATE SET league_name = excluded.league_name
                    """,
                    [user_id, league_id, platform, league_name.strip()[:200]],
                )
            else:
                await client.execute(
                    """
                    DELETE FROM user_leagues
                    WHERE user_id = ? AND league_id = ? AND platform = ?
                    """,
                    [user_id, league_id, platform],
                )

            account = await load_account(client, user_id)
            if account is None:
                session.clear()
                return jsonify({"error": "Your account could not be found."}), 401
            return jsonify(account)
    except Exception:
        app.logger.exception("Unable to update saved leagues")
        return jsonify({"error": "Unable to update saved leagues. Please try again."}), 500


# Register the API Blueprint with Flask app
app.register_blueprint(api)

if __name__ == "__main__":
    app.run(port=5001, debug=True)