"""Experimental trade comparison using regular-season production and opportunity."""

import math
import time
from functools import lru_cache

_CACHE = {}

FIELDS = {
    "passing_yards": 0.04,
    "passing_tds": 4,
    "interceptions": -2,
    "rushing_yards": 0.1,
    "rushing_tds": 6,
    "receiving_yards": 0.1,
    "receiving_tds": 6,
    "sack_fumbles_lost": -2,
    "rushing_fumbles_lost": -2,
    "receiving_fumbles_lost": -2,
    "passing_2pt_conversions": 2,
    "rushing_2pt_conversions": 2,
    "receiving_2pt_conversions": 2,
}


def load_season(season):
    cached = _CACHE.get(season)
    if cached and time.monotonic() - cached[0] < 3600:
        return cached[1]

    from experimental_season import load_records

    records = load_records(
        season,
        (*FIELDS, "receptions", "targets", "carries", "attempts",
         "fg_made", "fg_att", "pat_made", "pat_att"),
    )
    _CACHE[season] = (time.monotonic(), records)
    return records


# Each usage entry is (metric, reference, maximum adjustment).
USAGE = {
    "QB": (
        ("attempts", 31.04, 0.50),
        ("carries", 3.53, 0.40),
        ("red_zone_opportunities", 5.21, 0.35),
        ("snap_share", 0.9395, 0.15),
    ),
    "RB": (
        ("carries", 12.07, 0.70),
        ("targets", 2.93, 0.45),
        ("red_zone_opportunities", 2.52, 0.45),
        ("snap_share", 0.5421, 0.25),
    ),
    "WR": (
        ("targets", 5.71, 0.85),
        ("red_zone_opportunities", 0.82, 0.35),
        ("snap_share", 0.701, 0.25),
    ),
    "TE": (
        ("targets", 4.40, 0.75),
        ("red_zone_opportunities", 0.75, 0.35),
        ("snap_share", 0.6829, 0.20),
    ),
    "K": (("fg_att", 2.12, 0.65), ("pat_att", 2.28, 0.25)),
    "DEF": (("dropbacks", 35.56, 0.45),),
}

# Each entry is (numerator, denominator, reference, maximum adjustment,
# opportunity count used to reduce the adjustment for small samples).
EFFICIENCY = {
    "QB": (("passing_yards", "attempts", 7.15, 1.25, 75),),
    "RB": (
        ("rushing_yards", "carries", 4.24, 0.90, 50),
        ("receiving_yards", "targets", 5.63, 0.45, 25),
    ),
    "WR": (
        ("receiving_yards", "targets", 8.28, 2.40, 25),
        ("receptions", "targets", 0.638, 0.80, 25),
    ),
    "TE": (
        ("receiving_yards", "targets", 7.30, 1.75, 25),
        ("receptions", "targets", 0.7168, 0.55, 25),
    ),
    "K": (("fg_made", "fg_att", 0.8462, 0.90, 12),),
    "DEF": (
        ("sacks", "dropbacks", 0.0663, 0.60, 75),
        ("takeaways", "dropbacks", 0.0366, 0.50, 75),
    ),
}

TEAM_ALIASES = {
    "LA": "LAR",
    "STL": "LAR",
    "SD": "LAC",
    "OAK": "LV",
    "JAC": "JAX",
    "WSH": "WAS",
}


def team_code(code):
    return TEAM_ALIASES.get(code, code)


def contribution(metric, reference, weight):
    return weight * max(-1, min(1, (metric / reference - 1) * 2))

@lru_cache(maxsize=1)
def gsis_ids_by_sleeper_id():
    import nflreadpy as nfl

    candidates = {}
    ids = nfl.load_ff_playerids().select("sleeper_id", "gsis_id")

    for sleeper_id, gsis_id in ids.iter_rows():
        if sleeper_id and gsis_id:
            candidates.setdefault(str(sleeper_id), set()).add(gsis_id)

    return {
        sleeper_id: next(iter(gsis_ids))
        for sleeper_id, gsis_ids in candidates.items()
        if len(gsis_ids) == 1
    }

def player_value(player_id, player, records, ppr):
    position = player.get("position")
    if position in {"DST", "D/ST"}:
        position = "DEF"
    if position not in USAGE:
        raise ValueError("Select a QB, RB, WR, TE, kicker, or team defense.")

    name = player.get("full_name") or player_id
    gsis = player.get("gsis_id")
    team = team_code(player.get("team") or player_id)

    if position == "DEF":
        rows = [
            row for row in records
            if row.get("team") and team_code(row["team"]) == team
        ]
    else:
        rows = [
            row for row in records
            if gsis and row.get("player_id") == gsis
        ]

        if not rows:
            fallback_gsis = gsis_ids_by_sleeper_id().get(str(player_id))
            if fallback_gsis and fallback_gsis != gsis:
                rows = [
                    row for row in records
                    if row.get("player_id") == fallback_gsis
                ]

    if len(rows) != 1:
        raise ValueError(f"No unique NFLverse season stats found for {name}.")

    row = rows[0]
    games = row.get("games", 0)
    if not isinstance(games, (int, float)) or not math.isfinite(games) or games <= 0:
        raise ValueError(f"{name} has no recorded games in this season.")

    weights = {
        "DEF": {"defense_points": 1, "sacks": 1, "takeaways": 2},
        "K": {"fg_made": 3, "pat_made": 1},
    }.get(position, {**FIELDS, "receptions": ppr})

    if any(
        not isinstance(row.get(field), (int, float)) or not math.isfinite(row[field])
        for field in weights
    ):
        raise ValueError(f"Incomplete season stats for {name}.")

    averages = {field: row[field] / games for field in weights}
    baseline = sum(averages[field] * weight for field, weight in weights.items())

    usage_details = []
    usage_adjustment = 0
    for field, reference, weight in USAGE[position]:
        if field in row:
            average = row[field] if field == "snap_share" else row[field] / games
            averages[field] = average
            relative = 2 * (average / reference - 1)
            adjustment = weight * relative / (1 + abs(relative))
            usage_adjustment += adjustment
            usage_details.append({
                "metric": field,
                "actual": average,
                "benchmark": reference,
                "adjustment": adjustment,
            })

    efficiency = {}
    efficiency_details = []
    efficiency_adjustment = 0
    for numerator, denominator, reference, weight, prior in EFFICIENCY[position]:
        attempts = row.get(denominator, 0)
        if attempts > 0 and numerator in row:
            metric = f"{numerator}_per_{denominator}"
            rate = row[numerator] / attempts
            efficiency[metric] = rate
            adjustment = (
                contribution(rate, reference, weight) * attempts / (attempts + prior)
            )
            efficiency_adjustment += adjustment
            efficiency_details.append({
                "metric": metric,
                "actual": rate,
                "benchmark": reference,
                "adjustment": adjustment,
            })

    return {
        "player_id": player_id,
        "name": name,
        "position": position,
        "games": int(games),
        "baseline": baseline,
        "usage_adjustment": usage_adjustment,
        "efficiency_adjustment": efficiency_adjustment,
        "value": baseline + usage_adjustment + efficiency_adjustment,
        "averages": averages,
        "efficiency": efficiency,
        "scoring_details": {
            "usage": usage_details,
            "efficiency": efficiency_details,
        },
    }


def calculate_trade(payload, players, records):
    if not isinstance(payload, dict):
        raise ValueError("Send a JSON object.")

    give = payload.get("give")
    receive = payload.get("receive")

    for side in (give, receive):
        if (
            not isinstance(side, list)
            or not 1 <= len(side) <= 10
            or any(not isinstance(player_id, str) for player_id in side)
        ):
            raise ValueError("Select between 1 and 10 player IDs on each side.")

    all_ids = give + receive
    if len(set(all_ids)) != len(all_ids):
        raise ValueError("A player can appear only once in the trade.")

    if any(player_id not in players for player_id in all_ids):
        raise ValueError("An unknown player was selected. Search again.")

    ppr = payload.get("ppr", 1)
    if isinstance(ppr, bool) or ppr not in (0, 0.5, 1):
        raise ValueError("PPR must be 0, 0.5, or 1.")

    giving = [
        player_value(player_id, players[player_id], records, ppr)
        for player_id in give
    ]
    receiving = [
        player_value(player_id, players[player_id], records, ppr)
        for player_id in receive
    ]

    give_total = sum(player["value"] for player in giving)
    receive_total = sum(player["value"] for player in receiving)
    difference = receive_total - give_total

    denominator = max(abs(give_total), abs(receive_total))
    advantage = difference / denominator * 100 if denominator else 0

    if difference > 0:
        verdict = "Higher experimental value received"
    elif difference < 0:
        verdict = "Lower experimental value received"
    else:
        verdict = "Equal experimental value"

    return {
        "give": giving,
        "receive": receiving,
        "give_total": give_total,
        "receive_total": receive_total,
        "difference": difference,
        "advantage_percent": advantage,
        "verdict": verdict,
    }