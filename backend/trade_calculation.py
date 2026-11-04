"""WR trade comparison using regular-season totals divided by games played."""

import math
import time

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
    # Reuse season data for one hour before loading it again.
    cached = _CACHE.get(season)

    if cached and time.monotonic() - cached[0] < 3600:
        return cached[1]

    import nfl_data_py as nfl

    data = nfl.import_seasonal_data([season], s_type="REG")

    if data.empty:
        raise RuntimeError(
            "NFLverse has no regular-season stats for this season. "
            "Try another season."
        )

    records = data.to_dict("records")
    _CACHE[season] = (time.monotonic(), records)

    return records


def player_value(player_id, player, records, ppr):
    if player.get("position") != "WR":
        raise ValueError("This first version supports WRs only.")

    # Match Sleeper players to NFLverse using their shared GSIS ID.
    gsis = player.get("gsis_id")

    rows = [
        record
        for record in records
        if gsis and record.get("player_id") == gsis
    ]

    name = player.get("full_name") or player_id

    if len(rows) != 1:
        raise ValueError(
            f"No unique NFLverse season stats found for {name}. "
            "No name-based guesses are used."
        )

    row = rows[0]
    required = ["games", "receptions", *FIELDS]

    if any(
        key not in row or not math.isfinite(float(row[key]))
        for key in required
    ):
        raise ValueError(f"Incomplete season stats for {name}.")

    games = float(row["games"])

    if games <= 0:
        raise ValueError(
            f"{name} has no recorded games in this season."
        )

    # Convert season totals to averages per game.
    averages = {
        key: float(row[key]) / games
        for key in required
        if key != "games"
    }

    value = (
        sum(
            averages[key] * weight
            for key, weight in FIELDS.items()
        )
        + averages["receptions"] * ppr
    )

    return {
        "player_id": player_id,
        "name": name,
        "games": int(games),
        "value": value,
        "averages": averages,
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
            raise ValueError(
                "Select between 1 and 10 player IDs on each side."
            )

    all_ids = give + receive

    if len(set(all_ids)) != len(all_ids):
        raise ValueError(
            "A player can appear only once in the trade."
        )

    if any(player_id not in players for player_id in all_ids):
        raise ValueError(
            "An unknown player was selected. Search again."
        )

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

    # Absolute values also handle negative fantasy scores.
    denominator = max(abs(give_total), abs(receive_total))
    advantage = difference / denominator * 100 if denominator else 0

    if difference > 0:
        verdict = "Higher average production received"
    elif difference < 0:
        verdict = "Lower average production received"
    else:
        verdict = "Equal average production"

    return {
        "give": giving,
        "receive": receiving,
        "give_total": give_total,
        "receive_total": receive_total,
        "difference": difference,
        "advantage_percent": advantage,
        "verdict": verdict,
    }
