"""Tests for trade_calculation.py — the experimental WR stats model."""

import unittest

from trade_calculation import calculate_trade, player_value


def _record(gsis, games=16, rec=80, rec_yards=1000, rec_tds=8,
            rush_yards=0, rush_tds=0, passing_yards=0, passing_tds=0,
            interceptions=0, rec_fumbles=0, rush_fumbles=0, pass_fumbles=0,
            rec_2pt=0, rush_2pt=0, pass_2pt=0, sack_fumbles=0):
    return {
        "player_id": gsis,
        "games": games,
        "receptions": rec,
        "receiving_yards": rec_yards,
        "receiving_tds": rec_tds,
        "rushing_yards": rush_yards,
        "rushing_tds": rush_tds,
        "passing_yards": passing_yards,
        "passing_tds": passing_tds,
        "interceptions": interceptions,
        "receiving_fumbles_lost": rec_fumbles,
        "rushing_fumbles_lost": rush_fumbles,
        "sack_fumbles_lost": sack_fumbles,
        "passing_2pt_conversions": pass_2pt,
        "rushing_2pt_conversions": rush_2pt,
        "receiving_2pt_conversions": rec_2pt,
    }


PLAYERS = {
    "p1": {"full_name": "Alpha Receiver", "position": "WR", "gsis_id": "gsis-1"},
    "p2": {"full_name": "Beta Receiver",  "position": "WR", "gsis_id": "gsis-2"},
    "qb": {"full_name": "Some Quarterback", "position": "QB", "gsis_id": "gsis-qb"},
}

RECORDS = [
    _record("gsis-1", games=16, rec=80, rec_yards=1000, rec_tds=8),
    _record("gsis-2", games=16, rec=60, rec_yards=700,  rec_tds=4),
]


class PlayerValueTests(unittest.TestCase):
    def test_value_scales_with_production(self):
        high = player_value("p1", PLAYERS["p1"], RECORDS, ppr=1)
        low  = player_value("p2", PLAYERS["p2"], RECORDS, ppr=1)
        self.assertGreater(high["value"], low["value"])

    def test_ppr_increases_value_for_high_reception_player(self):
        full_ppr  = player_value("p1", PLAYERS["p1"], RECORDS, ppr=1)
        zero_ppr  = player_value("p1", PLAYERS["p1"], RECORDS, ppr=0)
        self.assertGreater(full_ppr["value"], zero_ppr["value"])

    def test_returned_record_contains_expected_keys(self):
        result = player_value("p1", PLAYERS["p1"], RECORDS, ppr=1)
        for key in ("player_id", "name", "games", "value", "averages"):
            self.assertIn(key, result)
        self.assertEqual(result["games"], 16)

    def test_non_wr_position_raises_value_error(self):
        with self.assertRaises(ValueError, msg="Non-WR should be rejected"):
            player_value("qb", PLAYERS["qb"], RECORDS, ppr=1)

    def test_missing_gsis_id_raises_value_error(self):
        player_no_gsis = {"full_name": "Ghost", "position": "WR", "gsis_id": None}
        with self.assertRaises(ValueError):
            player_value("ghost", player_no_gsis, RECORDS, ppr=1)

    def test_games_zero_raises_value_error(self):
        records = [_record("gsis-1", games=0)]
        with self.assertRaises(ValueError):
            player_value("p1", PLAYERS["p1"], records, ppr=1)


class CalculateTradeTests(unittest.TestCase):
    def _payload(self, give=("p1",), receive=("p2",), ppr=1):
        return {"give": list(give), "receive": list(receive), "ppr": ppr}

    def test_higher_production_side_wins(self):
        result = calculate_trade(self._payload(), PLAYERS, RECORDS)
        self.assertGreater(result["give_total"], result["receive_total"])
        self.assertIn("Lower", result["verdict"])

    def test_difference_matches_totals(self):
        result = calculate_trade(self._payload(), PLAYERS, RECORDS)
        self.assertAlmostEqual(
            result["difference"],
            result["receive_total"] - result["give_total"],
            places=6,
        )

    def test_invalid_ppr_raises_value_error(self):
        for bad_ppr in (0.25, 2, True, "1"):
            with self.subTest(ppr=bad_ppr):
                with self.assertRaises(ValueError):
                    calculate_trade(self._payload(ppr=bad_ppr), PLAYERS, RECORDS)

    def test_duplicate_player_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate_trade(self._payload(give=("p1",), receive=("p1",)), PLAYERS, RECORDS)

    def test_unknown_player_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate_trade(self._payload(give=("unknown",)), PLAYERS, RECORDS)

    def test_empty_side_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate_trade({"give": [], "receive": ["p2"], "ppr": 1}, PLAYERS, RECORDS)

    def test_too_many_players_raises_value_error(self):
        # 11 players on one side exceeds the 10-player limit
        many = [f"x{i}" for i in range(11)]
        players = {pid: {"full_name": f"Player {pid}", "position": "WR", "gsis_id": f"g-{pid}"} for pid in many}
        with self.assertRaises(ValueError):
            calculate_trade({"give": many, "receive": ["p2"], "ppr": 1}, {**PLAYERS, **players}, RECORDS)

    def test_non_dict_payload_raises_value_error(self):
        with self.assertRaises(ValueError):
            calculate_trade(["not", "a", "dict"], PLAYERS, RECORDS)

    def test_result_contains_give_and_receive_player_details(self):
        result = calculate_trade(self._payload(), PLAYERS, RECORDS)
        self.assertEqual(len(result["give"]), 1)
        self.assertEqual(len(result["receive"]), 1)
        self.assertEqual(result["give"][0]["name"], "Alpha Receiver")
        self.assertEqual(result["receive"][0]["name"], "Beta Receiver")


if __name__ == "__main__":
    unittest.main()
