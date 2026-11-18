"""
Generate per-game replay JSON files from nflverse play-by-play data.

Run offline (not at request time):
    pip install -r requirements.txt
    python generate_game_replays.py [--season 2024] [--week 1] [--game 2024_01_KC_BAL]

Output directory: ../frontend/public/data/game-replays/
  manifest.json                    — index of all available games
  2024_01_KC_BAL.json              — per-game play data
  ...

Each game JSON:
{
  "game_id": "2024_01_KC_BAL",
  "season": 2024, "week": 1,
  "home_team": "BAL", "away_team": "KC",
  "game_date": "2024-09-05",
  "home_score": 27, "away_score": 20,
  "plays": [ ...ordered play objects... ]
}

Each play object:
{
  "play_id": "...", "play_index": 0,
  "qtr": 1, "game_seconds_remaining": 3600,
  "game_clock": "15:00", "half": 1,
  "down": 1, "ydstogo": 10, "yardline_100": 65,
  "posteam": "KC", "defteam": "BAL",
  "play_type": "pass",           // pass | run | punt | kickoff | field_goal | extra_point | no_play | ...
  "desc": "...",
  "yards_gained": 7,
  "touchdown": false, "interception": false, "fumble": false,
  "sack": false, "complete_pass": null,
  "field_goal_result": null,     // "made" | "missed" | "blocked" | null
  "punt_result": null,           // "punt" | "out of bounds" | "touchback" | null
  "kickoff_result": null,
  "two_point_conv_result": null,
  "home_score": 0, "away_score": 0,
  "passer_id": null, "passer_name": null,
  "receiver_id": null, "receiver_name": null,
  "rusher_id": null, "rusher_name": null,
  "tackle_for_loss_1_player_id": null,
  "return_yards": null,
  "kick_distance": null,
  "air_yards": null,
  "yards_after_catch": null,
  "ep": null, "epa": null, "wp": null,
  "fantasy": {
    // per player_id: { pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fumble_lost, two_pt }
  }
}
"""

import argparse
import json
import math
import pathlib
import sys

try:
    import nfl_data_py as nfl
    import pandas as pd
except ImportError:
    sys.exit("Missing dependencies. Run: pip install nfl_data_py pandas pyarrow")

OUT_DIR = pathlib.Path(__file__).parent.parent / "frontend" / "public" / "data" / "game-replays"

# Columns to pull from nfl_data_py (subset to keep download small)
PBP_COLS = [
    "game_id", "season", "week", "season_type",
    "home_team", "away_team", "game_date",
    "play_id", "play_type", "desc",
    "qtr", "game_seconds_remaining", "time",
    "down", "ydstogo", "yardline_100",
    "posteam", "defteam",
    "yards_gained", "air_yards", "yards_after_catch",
    "touchdown", "pass_touchdown", "rush_touchdown",
    "interception", "fumble", "fumble_lost",
    "sack", "complete_pass", "incomplete_pass",
    "field_goal_result", "extra_point_result", "two_point_conv_result",
    "kick_distance", "return_yards",
    "total_home_score", "total_away_score",
    "passer_player_id", "passer_player_name",
    "receiver_player_id", "receiver_player_name",
    "rusher_player_id", "rusher_player_name",
    "tackle_for_loss_1_player_id",
    "ep", "epa", "wp",
    # These exist in the schema but may be null for non-scoring plays
    "passing_yards", "rushing_yards", "receiving_yards",
    "pass_length", "pass_location", "run_location",
    "shotgun", "no_huddle",
    "penalty_type", "penalty_yards", "penalty_team",
    "punt_in_endzone", "punt_out_of_bounds", "punt_fair_catch",
    "kickoff_in_endzone", "kickoff_out_of_bounds", "kickoff_fair_catch",
    "return_team",
    "passer_id", "rusher_id", "receiver_id",
]


def safe_float(v):
    try:
        f = float(v)
        return None if math.isnan(f) else round(f, 3)
    except (TypeError, ValueError):
        return None


def safe_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def safe_str(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "nat") else None


def field_goal_result(row):
    """Normalize field_goal_result to 'made'|'missed'|'blocked'|null."""
    raw = safe_str(row.get("field_goal_result"))
    if not raw:
        return None
    raw = raw.lower()
    if "made" in raw:
        return "made"
    if "blocked" in raw:
        return "blocked"
    if "missed" in raw or "no good" in raw:
        return "missed"
    return raw


def play_type_norm(pt, desc):
    """Normalize play_type to our set."""
    if not pt:
        return "no_play"
    pt = pt.lower().strip()
    if pt in ("pass",):
        return "pass"
    if pt in ("run", "rush"):
        return "run"
    if pt == "punt":
        return "punt"
    if pt == "kickoff":
        return "kickoff"
    if pt == "field_goal":
        return "field_goal"
    if pt == "extra_point":
        return "extra_point"
    if pt == "qb_kneel":
        return "run"
    if pt == "qb_spike":
        return "no_play"
    if pt == "no_play":
        desc_l = (desc or "").lower()
        if "timeout" in desc_l:
            return "timeout"
        if "two-point" in desc_l or "2-point" in desc_l:
            return "extra_point"
        return "no_play"
    return pt


def build_fantasy_stats(row):
    """Build per-player fantasy contributions for this play."""
    stats = {}

    def add(pid, pname, **kwargs):
        if not pid:
            return
        pid = safe_str(pid)
        if not pid:
            return
        if pid not in stats:
            stats[pid] = {"name": safe_str(pname), **{k: 0 for k in [
                "pass_yd", "pass_td", "pass_int",
                "rush_yd", "rush_td",
                "rec", "rec_yd", "rec_td",
                "fumble_lost", "two_pt"
            ]}}
        for k, v in kwargs.items():
            if v:
                stats[pid][k] = stats[pid].get(k, 0) + v

    # Prefer passer_id (consolidated) over passer_player_id
    passer = safe_str(row.get("passer_id")) or safe_str(row.get("passer_player_id"))
    pname = safe_str(row.get("passer_player_name"))
    if passer:
        pass_yd = safe_float(row.get("passing_yards")) or 0
        pass_td = 1 if safe_int(row.get("pass_touchdown")) else 0
        pass_int = 1 if safe_int(row.get("interception")) else 0
        add(passer, pname, pass_yd=pass_yd, pass_td=pass_td, pass_int=pass_int)

    # Receiving
    recv = safe_str(row.get("receiver_id")) or safe_str(row.get("receiver_player_id"))
    rname = safe_str(row.get("receiver_player_name"))
    if recv:
        rec_yd = safe_float(row.get("receiving_yards")) or 0
        rec_td = 1 if safe_int(row.get("pass_touchdown")) else 0
        complete = safe_int(row.get("complete_pass"))
        add(recv, rname, rec=complete or 0, rec_yd=rec_yd, rec_td=rec_td)

    # Rushing
    rusher = safe_str(row.get("rusher_id")) or safe_str(row.get("rusher_player_id"))
    rushname = safe_str(row.get("rusher_player_name"))
    if rusher:
        rush_yd = safe_float(row.get("rushing_yards")) or 0
        rush_td = 1 if safe_int(row.get("rush_touchdown")) else 0
        add(rusher, rushname, rush_yd=rush_yd, rush_td=rush_td)

    # Fumbles lost
    if safe_int(row.get("fumble_lost")):
        carrier = rusher or recv
        cname = rushname or rname
        if carrier:
            add(carrier, cname, fumble_lost=1)

    # Two-point conversions
    two_pt = safe_str(row.get("two_point_conv_result"))
    if two_pt and two_pt.lower() == "success":
        for pid in list(stats.keys()):
            stats[pid]["two_pt"] = 1

    # Remove empty entries
    return {k: v for k, v in stats.items() if any(
        v.get(f, 0) for f in ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "fumble_lost", "two_pt"]
    )}


def normalize_play(row, play_index):
    """Convert a DataFrame row dict to our normalized play object."""
    desc = safe_str(row.get("desc"))
    pt = play_type_norm(safe_str(row.get("play_type")), desc)

    return {
        "play_id": safe_str(row.get("play_id")) or str(play_index),
        "play_index": play_index,
        "qtr": safe_int(row.get("qtr")),
        "game_seconds_remaining": safe_int(row.get("game_seconds_remaining")),
        "game_clock": safe_str(row.get("time")),
        "half": 1 if (safe_int(row.get("qtr")) or 0) <= 2 else 2,
        "down": safe_int(row.get("down")),
        "ydstogo": safe_int(row.get("ydstogo")),
        "yardline_100": safe_int(row.get("yardline_100")),
        "posteam": safe_str(row.get("posteam")),
        "defteam": safe_str(row.get("defteam")),
        "play_type": pt,
        "desc": desc,
        "yards_gained": safe_int(row.get("yards_gained")),
        "touchdown": bool(safe_int(row.get("touchdown"))),
        "pass_touchdown": bool(safe_int(row.get("pass_touchdown"))),
        "rush_touchdown": bool(safe_int(row.get("rush_touchdown"))),
        "interception": bool(safe_int(row.get("interception"))),
        "fumble": bool(safe_int(row.get("fumble"))),
        "fumble_lost": bool(safe_int(row.get("fumble_lost"))),
        "sack": bool(safe_int(row.get("sack"))),
        "complete_pass": safe_int(row.get("complete_pass")),
        "field_goal_result": field_goal_result(row),
        "extra_point_result": safe_str(row.get("extra_point_result")),
        "punt_in_endzone": bool(safe_int(row.get("punt_in_endzone"))),
        "punt_out_of_bounds": bool(safe_int(row.get("punt_out_of_bounds"))),
        "punt_fair_catch": bool(safe_int(row.get("punt_fair_catch"))),
        "kickoff_in_endzone": bool(safe_int(row.get("kickoff_in_endzone"))),
        "kickoff_out_of_bounds": bool(safe_int(row.get("kickoff_out_of_bounds"))),
        "kickoff_fair_catch": bool(safe_int(row.get("kickoff_fair_catch"))),
        "two_point_conv_result": safe_str(row.get("two_point_conv_result")),
        "kick_distance": safe_int(row.get("kick_distance")),
        "return_yards": safe_int(row.get("return_yards")),
        "return_team": safe_str(row.get("return_team")),
        "air_yards": safe_float(row.get("air_yards")),
        "yards_after_catch": safe_float(row.get("yards_after_catch")),
        "pass_location": safe_str(row.get("pass_location")),
        "pass_length": safe_str(row.get("pass_length")),
        "run_location": safe_str(row.get("run_location")),
        "shotgun": bool(safe_int(row.get("shotgun"))),
        "no_huddle": bool(safe_int(row.get("no_huddle"))),
        "home_score": safe_int(row.get("total_home_score")) or 0,
        "away_score": safe_int(row.get("total_away_score")) or 0,
        "passer_id": safe_str(row.get("passer_id")) or safe_str(row.get("passer_player_id")),
        "passer_name": safe_str(row.get("passer_player_name")),
        "receiver_id": safe_str(row.get("receiver_id")) or safe_str(row.get("receiver_player_id")),
        "receiver_name": safe_str(row.get("receiver_player_name")),
        "rusher_id": safe_str(row.get("rusher_id")) or safe_str(row.get("rusher_player_id")),
        "rusher_name": safe_str(row.get("rusher_player_name")),
        "tackle_for_loss_1_player_id": safe_str(row.get("tackle_for_loss_1_player_id")),
        "penalty_type": safe_str(row.get("penalty_type")),
        "penalty_yards": safe_int(row.get("penalty_yards")),
        "ep": safe_float(row.get("ep")),
        "epa": safe_float(row.get("epa")),
        "wp": safe_float(row.get("wp")),
        "fantasy": build_fantasy_stats(row),
    }


def process_season(season, week_filter=None, game_filter=None):
    print(f"Loading PBP data for season {season}...")
    try:
        df = nfl.import_pbp_data(years=[season], columns=PBP_COLS, downcast=True)
    except Exception as e:
        print(f"  Warning: some columns unavailable ({e}), retrying with reduced set...")
        core_cols = [c for c in PBP_COLS if c not in (
            "passing_yards", "rushing_yards", "receiving_yards",
            "kickoff_in_endzone", "kickoff_out_of_bounds", "kickoff_fair_catch",
            "punt_in_endzone", "punt_out_of_bounds", "punt_fair_catch",
            "passer_id", "rusher_id", "receiver_id",
            "pass_length", "shotgun", "no_huddle",
        )]
        df = nfl.import_pbp_data(years=[season], columns=core_cols, downcast=True)

    # Regular season only
    df = df[df["season_type"] == "REG"].copy()

    if week_filter is not None:
        df = df[df["week"] == week_filter]

    if game_filter:
        df = df[df["game_id"] == game_filter]

    if df.empty:
        print("  No plays found for the given filters.")
        return []

    game_ids = df["game_id"].unique()
    print(f"  Processing {len(game_ids)} game(s)...")

    manifest_entries = []
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for gid in sorted(game_ids):
        game_df = df[df["game_id"] == gid].sort_values("play_id").reset_index(drop=True)

        # Extract game metadata from first row
        first = game_df.iloc[0]
        home_team = safe_str(first.get("home_team"))
        away_team = safe_str(first.get("away_team"))
        game_date = safe_str(first.get("game_date"))
        week_num = safe_int(first.get("week"))

        # Final score from last play with scores
        score_rows = game_df[game_df["total_home_score"].notna()]
        if not score_rows.empty:
            last_score = score_rows.iloc[-1]
            home_score = safe_int(last_score.get("total_home_score")) or 0
            away_score = safe_int(last_score.get("total_away_score")) or 0
        else:
            home_score = away_score = 0

        # Normalize plays — skip plays with no play_type (incomplete rows)
        plays = []
        for idx, row in game_df.iterrows():
            pt = safe_str(row.get("play_type"))
            if not pt or pt == "note":
                continue
            plays.append(normalize_play(row.to_dict(), len(plays)))

        if not plays:
            continue

        # Build game JSON filename — use nflverse game_id directly (safe for filenames)
        safe_gid = gid.replace(" ", "_")
        filename = f"{safe_gid}.json"

        game_data = {
            "game_id": gid,
            "filename": filename,
            "season": season,
            "week": week_num,
            "home_team": home_team,
            "away_team": away_team,
            "game_date": game_date,
            "home_score": home_score,
            "away_score": away_score,
            "play_count": len(plays),
            "plays": plays,
        }

        out_path = OUT_DIR / filename
        with open(out_path, "w") as f:
            json.dump(game_data, f, separators=(",", ":"))

        size_kb = out_path.stat().st_size // 1024
        print(f"  {gid}: {len(plays)} plays → {filename} ({size_kb} KB)")

        manifest_entries.append({
            "game_id": gid,
            "filename": filename,
            "season": season,
            "week": week_num,
            "home_team": home_team,
            "away_team": away_team,
            "game_date": game_date,
            "home_score": home_score,
            "away_score": away_score,
            "play_count": len(plays),
        })

    return manifest_entries


def update_manifest(new_entries):
    """Merge new entries into the manifest, deduplicating by game_id."""
    manifest_path = OUT_DIR / "manifest.json"
    existing = []
    if manifest_path.exists():
        with open(manifest_path) as f:
            existing = json.load(f)

    by_id = {e["game_id"]: e for e in existing}
    for entry in new_entries:
        by_id[entry["game_id"]] = entry

    merged = sorted(by_id.values(), key=lambda e: (e["season"], e["week"], e["game_id"]))
    with open(manifest_path, "w") as f:
        json.dump(merged, f, indent=2)
    print(f"\nManifest updated: {len(merged)} game(s) in {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate NFL game replay JSON files")
    parser.add_argument("--season", type=int, default=2024, help="NFL season year (default: 2024)")
    parser.add_argument("--week", type=int, default=None, help="Only process this week (optional)")
    parser.add_argument("--game", type=str, default=None, help="Only process this game_id (optional)")
    parser.add_argument("--all-weeks", action="store_true", help="Process all regular-season weeks")
    args = parser.parse_args()

    if args.game:
        # Single-game mode
        entries = process_season(args.season, game_filter=args.game)
    elif args.all_weeks:
        entries = process_season(args.season)
    else:
        week = args.week if args.week is not None else 1
        entries = process_season(args.season, week_filter=week)

    if entries:
        update_manifest(entries)
        print(f"\nDone! {len(entries)} game(s) generated.")
        print(f"Output: {OUT_DIR}")
    else:
        print("\nNo games generated.")


if __name__ == "__main__":
    main()
