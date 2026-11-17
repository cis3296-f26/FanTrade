"""Tests for the /trade-evaluation and /trade-evaluation/players endpoints."""

import unittest
from unittest.mock import patch

from app import app


MARKET = [
    {"player": {"sleeperId": "10", "id": 20, "name": "Top Receiver",
                "position": "WR", "maybeTeam": "KC"}, "value": 8000},
    {"player": {"sleeperId": "11", "id": 21, "name": "Solid Runner",
                "position": "RB", "maybeTeam": "PHI"}, "value": 5000},
]

SLEEPER_PLAYERS = {
    "10": {"full_name": "Top Receiver", "position": "WR",
           "status": "Active", "search_rank": 3, "team": "KC"},
    "11": {"full_name": "Solid Runner", "position": "RB",
           "status": "Active", "search_rank": 10, "team": "PHI"},
    "99": {"full_name": "Unknown Bench Guy", "position": "WR",
           "status": "Active", "search_rank": 500, "team": "JAX"},
}


class TradeEvaluationEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    # ── FanCalc mode ──────────────────────────────────────────────────────────

    def test_fancalc_trade_returns_verdict_and_totals(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            response = self.client.post("/api/trade-evaluation", json={
                "give": ["10"], "receive": ["11"],
                "isDynasty": False, "numQbs": 1, "numTeams": 12, "ppr": 1.0,
            })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("give_total", data)
        self.assertIn("receive_total", data)
        self.assertIn("verdict", data)

    def test_fancalc_winning_trade_verdict_reflects_direction(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            # Receiving the higher-value player should produce a "Winning" verdict.
            response = self.client.post("/api/trade-evaluation", json={
                "give": ["11"], "receive": ["10"],
            })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("Winning", data["verdict"])

    def test_missing_both_sides_returns_400(self):
        response = self.client.post("/api/trade-evaluation", json={
            "give": [], "receive": [],
        })
        self.assertEqual(response.status_code, 400)

    def test_non_json_body_returns_400(self):
        response = self.client.post(
            "/api/trade-evaluation",
            data="not json",
            content_type="text/plain",
        )
        self.assertEqual(response.status_code, 400)

    def test_fancalc_settings_are_forwarded_to_fetch(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET) as fetch:
            self.client.post("/api/trade-evaluation", json={
                "give": ["10"], "receive": ["11"],
                "isDynasty": True, "numQbs": 2, "numTeams": 10, "ppr": 0.5,
            })
        fetch.assert_called_once_with(is_dynasty=True, num_qbs=2, num_teams=10, ppr=0.5)

    # ── Experimental mode ─────────────────────────────────────────────────────

    def test_experimental_mode_requires_season(self):
        response = self.client.post("/api/trade-evaluation", json={
            "give": ["10"], "receive": ["11"], "mode": "experimental",
        })
        self.assertEqual(response.status_code, 400)

    def test_experimental_mode_rejects_boolean_season(self):
        response = self.client.post("/api/trade-evaluation", json={
            "give": ["10"], "receive": ["11"],
            "mode": "experimental", "season": True,
        })
        self.assertEqual(response.status_code, 400)

    def test_experimental_mode_rejects_out_of_range_season(self):
        response = self.client.post("/api/trade-evaluation", json={
            "give": ["10"], "receive": ["11"],
            "mode": "experimental", "season": 1776,
        })
        self.assertEqual(response.status_code, 400)


class TradePlayersEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_short_query_returns_empty_list(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            response = self.client.get("/api/trade-evaluation/players?q=a")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])

    def test_search_returns_matching_player(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            response = self.client.get("/api/trade-evaluation/players?q=receiver")
        self.assertEqual(response.status_code, 200)
        names = [p["name"] for p in response.get_json()]
        self.assertIn("Top Receiver", names)

    def test_popular_returns_fancalc_top_list(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            response = self.client.get("/api/trade-evaluation/players?popular=true")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        self.assertIn("value", data[0])

    def test_unavailable_player_directory_returns_503(self):
        with patch("app._load_players", return_value=None):
            response = self.client.get("/api/trade-evaluation/players?q=receiver")
        self.assertEqual(response.status_code, 503)

    def test_ids_param_returns_resolved_player_cards(self):
        with patch("app._load_players", return_value=SLEEPER_PLAYERS), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=MARKET):
            response = self.client.get("/api/trade-evaluation/players?ids=10,11")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data), 2)
        self.assertEqual({p["player_id"] for p in data}, {"10", "11"})


if __name__ == "__main__":
    unittest.main()
