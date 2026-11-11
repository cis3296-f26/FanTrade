"""
Generate backend/data/usage_shares.json from nflverse play-by-play data.

Run offline (not at request time):
    pip install -r requirements.txt
    python generate_usage_shares.py

Output: ../backend/data/usage_shares.json
  Array of { id, name, team, position, targets, avg_depth, espn_id, shares: number[18] }
  shares[lane * 6 + band] = percent of that player's targets in that cell.
  Lanes: 0=left 1=middle 2=right
  Bands: 0=<5 1=5-10 2=10-15 3=15-20 4=20-30 5=30+
  Minimum 50 targets.
"""

import csv
import io
import json
import pathlib
import sys
import urllib.request

try:
    import nflreadpy as nfl
    import pandas as pd
except ImportError:
    sys.exit("Missing dependencies. Run: pip install -r requirements.txt")

SEASONS = [2025]
MIN_TARGETS = 50
LANES = {"left": 0, "middle": 1, "right": 2}
DEPTH_EDGES = [5, 10, 15, 20, 30]
OUT_PATH = pathlib.Path(__file__).parent.parent / "backend" / "data" / "usage_shares.json"
PLAYERS_CSV_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"


def depth_band(air_yards):
    for i, edge in enumerate(DEPTH_EDGES):
        if air_yards < edge:
            return i
    return len(DEPTH_EDGES)


def load_espn_id_map():
    """Download nflverse players CSV and return {gsis_id: espn_id} map."""
    print("Fetching ESPN ID map from nflverse...")
    try:
        with urllib.request.urlopen(PLAYERS_CSV_URL, timeout=30) as resp:
            text = resp.read().decode("utf-8")
        mapping = {}
        for row in csv.DictReader(io.StringIO(text)):
            gsis = row.get("gsis_id", "").strip()
            espn = row.get("espn_id", "").strip()
            if gsis and espn:
                mapping[gsis] = espn
        print(f"  Loaded ESPN IDs for {len(mapping)} players")
        return mapping
    except Exception as e:
        print(f"  Warning: could not fetch ESPN ID map ({e}). espn_id will be omitted.")
        return {}


def main():
    espn_id_map = load_espn_id_map()

    print(f"Loading play-by-play for seasons {SEASONS}...")
    pbp = nfl.load_pbp(SEASONS).to_pandas()

    # Filter to regular-season pass plays with receiver/location/air_yards
    t = pbp[
        (pbp["season_type"] == "REG")
        & (pbp["play_type"] == "pass")
        & pbp["receiver_player_id"].notna()
        & pbp["pass_location"].notna()
        & pbp["air_yards"].notna()
    ].copy()

    t["lane"] = t["pass_location"].map(LANES)
    t["band"] = t["air_yards"].apply(depth_band)

    # Drop rows where pass_location didn't map (shouldn't happen with notna filter,
    # but handles unexpected values like "NA" strings)
    t = t[t["lane"].notna()].copy()
    t["lane"] = t["lane"].astype(int)
    t["band"] = t["band"].astype(int)

    # Load roster data to get positions
    print("Loading roster data...")
    try:
        rosters = nfl.load_rosters(SEASONS).to_pandas()
        # nflverse gsis_id is the same as receiver_player_id in pbp
        position_map = (
            rosters[["gsis_id", "position"]]
            .dropna(subset=["gsis_id"])
            .drop_duplicates("gsis_id")
            .set_index("gsis_id")["position"]
            .to_dict()
        )
    except Exception as e:
        print(f"Warning: could not load rosters ({e}). Position will be omitted.")
        position_map = {}

    print("Aggregating target shares...")
    players = []
    for rid, g in t.groupby("receiver_player_id"):
        n = len(g)
        if n < MIN_TARGETS:
            continue

        counts = [0] * 18
        for lane, band in zip(g["lane"], g["band"]):
            counts[lane * 6 + band] += 1

        players.append({
            "id": rid,
            "name": g["receiver_player_name"].mode().iat[0],
            "team": g["posteam"].iloc[-1],
            "position": position_map.get(rid, ""),
            "targets": n,
            "avg_depth": round(float(g["air_yards"].mean()), 1),
            "espn_id": espn_id_map.get(rid, ""),
            "shares": [round(c / n * 100, 2) for c in counts],
        })

    players.sort(key=lambda p: -p["targets"])

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(players, f)

    print(f"Wrote {len(players)} players to {OUT_PATH}")
    if players:
        sample = players[0]
        total = sum(sample["shares"])
        print(f"Sample: {sample['name']} ({sample['team']}) — {sample['targets']} targets, "
              f"espn_id={sample.get('espn_id','?')}, "
              f"shares sum={total:.1f}%, avg_depth={sample['avg_depth']} yds")


if __name__ == "__main__":
    main()
