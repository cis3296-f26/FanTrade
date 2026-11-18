import unittest
from unittest.mock import patch

from app import app
try:
    from tests.test_trade_suggestions import fixture
except ImportError:
    from test_trade_suggestions import fixture


class TradeSuggestionApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.payload = {"league_id": "123", "your_roster_id": 1,
                        "partner_roster_id": 2, "position": "RB"}

    def test_endpoint_loads_one_value_snapshot_with_league_settings(self):
        league, market = fixture()
        with patch("app.get_league_rosters", return_value=league) as rosters, \
                patch("fancalc_connection.fetch_fancalc_values", return_value=market) as values:
            response = self.client.post("/api/trade-suggestions", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")
        rosters.assert_called_once_with("123")
        values.assert_called_once_with(is_dynasty=False, num_qbs=1, num_teams=10, ppr=0.5)

    def test_invalid_input_does_not_fetch_rosters(self):
        with patch("app.get_league_rosters") as rosters:
            response = self.client.post("/api/trade-suggestions", json={**self.payload, "position": "DEF"})
        self.assertEqual(response.status_code, 400)
        rosters.assert_not_called()

    def test_invalid_preferences_are_rejected_before_loading_rosters(self):
        for changes in ({"min_gain_percent": 0}, {"max_gain_percent": 36},
                        {"min_gain_percent": 5, "max_gain_percent": 12},
                        {"trade_style": ["trade_up", "add_depth"]}):
            with self.subTest(changes=changes), patch("app.get_league_rosters") as rosters:
                response = self.client.post("/api/trade-suggestions", json={**self.payload, **changes})
                self.assertEqual(response.status_code, 400)
                rosters.assert_not_called()

    def test_preferences_reach_the_search_and_are_echoed_in_results(self):
        league, market = fixture()
        preferences = {"min_gain_percent": 1, "max_gain_percent": 35,
                       "trade_style": "balanced"}
        with patch("app.get_league_rosters", return_value=league), \
                patch("fancalc_connection.fetch_fancalc_values", return_value=market):
            response = self.client.post("/api/trade-suggestions", json={**self.payload, **preferences})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["preferences"], preferences)
        trade = data["suggestion"]["evaluation"]
        self.assertEqual(len(trade["give"]), len(trade["receive"]))
        self.assertIn("roster_moves", data["suggestion"])

    def test_foreign_team_is_rejected_before_loading_values(self):
        league, _ = fixture()
        with patch("app.get_league_rosters", return_value=league), \
                patch("fancalc_connection.fetch_fancalc_values") as values:
            response = self.client.post("/api/trade-suggestions", json={**self.payload, "partner_roster_id": 99})
        self.assertEqual(response.status_code, 400)
        values.assert_not_called()

    def test_no_match_is_a_successful_response(self):
        league, market = fixture()
        with patch("app.get_league_rosters", return_value=league), \
                patch("fancalc_connection.fetch_fancalc_values", return_value=market):
            response = self.client.post("/api/trade-suggestions", json={**self.payload, "position": "TE"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "no_match")

    def test_unavailable_data_is_not_a_no_match(self):
        league, _ = fixture()
        with patch("app.get_league_rosters", return_value=league), \
                patch("fancalc_connection.fetch_fancalc_values", return_value=[]):
            response = self.client.post("/api/trade-suggestions", json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertIn("error", response.get_json())


if __name__ == "__main__":
    unittest.main()
