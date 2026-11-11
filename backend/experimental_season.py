"""Experimental trade analysis for NFL players."""

import logging
from collections import Counter, defaultdict


def load_records(season, scoring_fields):
    import nflreadpy as nfl
    import polars as pl

    stats = nfl.load_player_stats([season]).filter(pl.col("season_type") == "REG")
    if "passing_interceptions" in stats.columns and "interceptions" not in stats.columns:
        stats = stats.rename({"passing_interceptions": "interceptions"})
    if stats.is_empty():
        raise RuntimeError("No NFLverse regular-season player stats are available.")

    totals = defaultdict(Counter)
    weeks = defaultdict(set)
    for row in stats.iter_rows(named=True):
        player_id = row["player_id"]
        if not player_id:
            continue
        weeks[player_id].add(row["week"])
        for field in scoring_fields:
            if field in row:
                totals[player_id][field] += row[field] or 0

    # Include appearances with snaps but no recorded box-score stats.
    snap_shares = defaultdict(dict)
    try:
        players = nfl.load_players().select("gsis_id", "pfr_id")
        ids = {pfr: gsis for gsis, pfr in players.iter_rows() if gsis and pfr}
        snaps = nfl.load_snap_counts([season]).filter(pl.col("game_type") == "REG")
        for pfr, week, share in snaps.select(
            "pfr_player_id", "week", "offense_pct"
        ).iter_rows():
            if pfr in ids and share is not None:
                snap_shares[ids[pfr]][week] = share
    except Exception:
        logging.getLogger(__name__).warning(
            "Experimental snap counts unavailable for %s", season
        )

    red_zone = Counter()
    defense = defaultdict(Counter)
    scores = {}
    pbp_available = False

    try:
        pbp = nfl.load_pbp([season]).filter(pl.col("season_type") == "REG")
        fields = (
            "game_id", "home_team", "away_team", "total_home_score",
            "total_away_score", "posteam", "defteam", "play_type",
            "yardline_100", "pass_attempt", "sack", "interception",
            "fumble_lost", "safety", "td_team", "receiver_player_id",
            "rusher_player_id", "passer_player_id",
        )

        for row in pbp.select(fields).iter_rows(named=True):
            scores[row["game_id"]] = (
                row["home_team"],
                row["away_team"],
                row["total_home_score"],
                row["total_away_score"],
            )

            play_type = row["play_type"]
            if play_type in ("no_play", None):
                continue

            yardline = row["yardline_100"]
            if yardline is not None and yardline <= 20:
                if play_type == "pass" and row["pass_attempt"] and not row["sack"]:
                    for field in ("receiver_player_id", "passer_player_id"):
                        if row[field]:
                            red_zone[row[field]] += 1

                if play_type == "run" and row["rusher_player_id"]:
                    red_zone[row["rusher_player_id"]] += 1

            if row["defteam"]:
                team = defense[row["defteam"]]
                team["dropbacks"] += bool(row["pass_attempt"] or row["sack"])
                team["sacks"] += bool(row["sack"])
                team["takeaways"] += bool(row["interception"]) + bool(row["fumble_lost"])
                team["defense_points"] += 2 * bool(row["safety"])

            td_team = row["td_team"]
            if td_team and (
                td_team != row["posteam"] or play_type in ("kickoff", "punt")
            ):
                defense[td_team]["defense_points"] += 6

        pbp_available = bool(scores)
    except Exception:
        logging.getLogger(__name__).warning(
            "Experimental play-by-play unavailable for %s", season
        )

    records = []
    for player_id, player_totals in totals.items():
        snaps = snap_shares[player_id]
        games = len(weeks[player_id] | snaps.keys())
        record = dict(player_totals, player_id=player_id, games=games)

        if snaps and weeks[player_id] <= snaps.keys():
            record["snap_share"] = sum(snaps.values()) / len(snaps)

        if pbp_available:
            record["red_zone_opportunities"] = red_zone[player_id]

        records.append(record)

    if pbp_available:
        for home, away, home_score, away_score in scores.values():
            for team, allowed in ((home, away_score), (away, home_score)):
                if team and allowed is not None:
                    defense[team]["games"] += 1
                    defense[team]["defense_points"] += points_allowed_score(allowed)

        records.extend(
            dict(
                team_totals,
                team=team,
                sacks=team_totals["sacks"],
                takeaways=team_totals["takeaways"],
                dropbacks=team_totals["dropbacks"],
            )
            for team, team_totals in defense.items()
            if team_totals["games"]
        )

    return records


def points_allowed_score(points):
    for maximum, score in ((0, 10), (6, 7), (13, 4), (20, 1), (27, 0), (34, -1)):
        if points <= maximum:
            return score
    return -4