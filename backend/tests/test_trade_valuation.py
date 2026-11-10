import unittest
from unittest.mock import patch

from fancalc_connection import (
    build_player_value_lookup,
    evaluate_fancalc_trade,
    evaluate_player_values,
)


class TradeValuationTests(unittest.TestCase):
    def setUp(self):
        # Small fixed values keep the tests independent of the live market.
        self.market = [
            {"player": {"sleeperId": "10", "id": 20, "name": "First Player",
                        "position": "RB", "maybeTeam": "PHI"}, "value": 6000},
            {"player": {"sleeperId": "11", "id": 21, "name": "Second Player",
                        "position": "WR", "maybeTeam": "BUF"}, "value": 6500},
        ]

    def test_calculator_preserves_values_and_selected_settings(self):
        # The existing entry point should still fetch with the user's settings.
        with patch("fancalc_connection.fetch_fancalc_values", return_value=self.market) as fetch:
            result = evaluate_fancalc_trade(
                ["10"], ["11"], is_dynasty=True, num_qbs=2, num_teams=10, ppr=0.5,
            )
        fetch.assert_called_once_with(is_dynasty=True, num_qbs=2, num_teams=10, ppr=0.5)
        self.assertEqual(result["give_total"], 6000)
        self.assertEqual(result["receive_total"], 6500)
        self.assertEqual(result["difference"], 500)
        self.assertEqual(result["diff_percentage"], 7.7)
        self.assertEqual(result["verdict"], "Winning Trade (+500 pts)")
        self.assertEqual(result["threshold"], 400)
        self.assertEqual(result["give"][0]["name"], "First Player")
        self.assertEqual(
            (result["is_dynasty"], result["num_qbs"], result["num_teams"], result["ppr"]),
            (True, 2, 10, 0.5),
        )

    def test_repeated_candidate_scoring_needs_no_network(self):
        # A single lookup can score either direction without fetching again.
        with patch("fancalc_connection.fetch_fancalc_values", side_effect=AssertionError("Unexpected fetch")):
            lookup = build_player_value_lookup(self.market)
            forward = evaluate_player_values([lookup("10")], [lookup("11")])
            reverse = evaluate_player_values([lookup("11")], [lookup("10")])
        self.assertEqual(forward["difference"], 500)
        self.assertEqual(reverse["verdict"], "Losing Trade (-500 pts)")

    def test_fairness_threshold_keeps_absolute_and_percentage_boundaries(self):
        # Check both the 400-point floor and the 6% rule used by the calculator.
        for give, receive, verdict in [
            (600, 1000, "Fair Trade"),
            (599, 1000, "Winning Trade"),
            (9400, 10000, "Fair Trade"),
            (9399, 10000, "Winning Trade"),
        ]:
            with self.subTest(give=give, receive=receive):
                result = evaluate_player_values([{"value": give}], [{"value": receive}])
                self.assertEqual(result["trade_label"], verdict)

    def test_missing_value_stays_explicitly_unranked(self):
        # The generator can exclude unknown values using this flag, even though
        # the existing calculator keeps its zero-value fallback.
        lookup = build_player_value_lookup(self.market, {"99": {"full_name": "Unknown Player"}})
        self.assertTrue(lookup("99")["unranked"])
        self.assertEqual(lookup("99")["value"], 0)
        self.assertFalse(lookup("10")["unranked"])

    def test_sleeper_lookup_does_not_match_an_unrelated_fantasycalc_id(self):
        # Sleeper ID 20 must not accidentally resolve to FantasyCalc ID 20.
        lookup = build_player_value_lookup(self.market)
        self.assertTrue(lookup("20")["unranked"])
        with patch("fancalc_connection.fetch_fancalc_values", return_value=self.market):
            result = evaluate_fancalc_trade(["20"], ["11"])
        self.assertEqual(result["give"][0]["name"], "First Player")

    def test_name_fallback_and_returned_records_are_independent(self):
        lookup = build_player_value_lookup(
            self.market, {"other-id": {"full_name": " first player "}}
        )
        player = lookup("other-id")
        self.assertEqual(player["value"], 6000)
        player["value"] = 1
        self.assertEqual(lookup("other-id")["value"], 6000)
        self.assertEqual(self.market[0]["value"], 6000)


if __name__ == "__main__":
    unittest.main()
