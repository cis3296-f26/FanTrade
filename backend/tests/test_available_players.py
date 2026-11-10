import unittest
from unittest.mock import Mock, patch

from app import app
from sleeper_connection import get_available_players, get_trending_players


class AvailablePlayersTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.player_directory = {
            "1": {
                "full_name": "Rostered Player", "position": "RB", "status": "Active",
                "search_rank": 1, "team": "PHI",
            },
            "2": {
                "full_name": "Free Agent Runner", "position": "RB", "status": "Active",
                "search_rank": 5, "team": "KC",
            },
            "3": {
                "full_name": "Free Agent Receiver", "position": "WR", "status": "Active",
                "search_rank": 2, "team": "BUF",
            },
            "4": {
                "full_name": "Inactive Player", "position": "RB", "status": "Inactive",
                "search_rank": 3, "team": "DAL",
            },
        }

    def test_available_players_excludes_rostered_and_inactive_players(self):
        response = Mock(status_code=200, json=Mock(return_value=[
            {"players": ["1"], "reserve": ["1"], "taxi": []},
        ]))
        with patch("sleeper_connection.requests.get", return_value=response), \
                patch("sleeper_connection._load_players", return_value=self.player_directory), \
                patch("sleeper_connection.get_current_nfl_state", return_value={"season": "2026", "week": 1}), \
                patch("sleeper_connection._load_weekly_projections", return_value={}):
            result = get_available_players("league-1", limit=20)

        self.assertEqual(
            [player["player_id"] for player in result["players"][:2]],
            ["3", "2"],
        )
        self.assertNotIn("1", [player["player_id"] for player in result["players"]])
        self.assertNotIn("4", [player["player_id"] for player in result["players"]])
        self.assertIn("ARI", [player["player_id"] for player in result["players"]])

    def test_available_players_search_and_position_filters(self):
        response = Mock(status_code=200, json=Mock(return_value=[]))
        with patch("sleeper_connection.requests.get", return_value=response), \
                patch("sleeper_connection._load_players", return_value=self.player_directory), \
                patch("sleeper_connection.get_current_nfl_state", return_value={"season": "2026", "week": 1}), \
                patch("sleeper_connection._load_weekly_projections", return_value={}):
            result = get_available_players(
                "league-1", query="runner", position="RB", limit=1
            )

        self.assertEqual([player["name"] for player in result["players"]], ["Free Agent Runner"])

    def test_available_players_are_ranked_by_expected_points(self):
        response = Mock(status_code=200, json=Mock(return_value=[]))
        projections = {
            "2": {"pts_ppr": 4.5},
            "3": {"pts_ppr": 18.2},
        }
        with patch("sleeper_connection.requests.get", return_value=response), \
                patch("sleeper_connection._load_players", return_value=self.player_directory), \
                patch("sleeper_connection.get_current_nfl_state", return_value={"season": "2026", "week": 1}), \
                patch("sleeper_connection._load_weekly_projections", return_value=projections):
            result = get_available_players("league-1", limit=20)

        self.assertEqual(
            [player["player_id"] for player in result["players"][:2]],
            ["3", "2"],
        )
        self.assertEqual(result["players"][0]["expected_points"], 18.2)

    def test_endpoint_rejects_unsupported_position(self):
        with patch("app.get_available_players") as get_players:
            response = self.client.get(
                "/api/sleeper/available-players/league-1?position=WRB"
            )

        self.assertEqual(response.status_code, 400)
        get_players.assert_not_called()

    def test_endpoint_returns_available_players(self):
        result = {"league_id": "league-1", "players": []}
        with patch("app.get_available_players", return_value=result) as get_players:
            response = self.client.get(
                "/api/sleeper/available-players/league-1?q=smith&position=WR"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), result)
        get_players.assert_called_once_with(
            "league-1", query="smith", position="WR", limit=100
        )

    def test_endpoint_returns_trending_players(self):
        result = {"trend_type": "drop", "players": []}
        with patch("app.get_trending_players", return_value=result) as get_trending:
            response = self.client.get(
                "/api/sleeper/trending/drop?lookback_hours=72&limit=10"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), result)
        get_trending.assert_called_once_with("drop", 72, 10)

    def test_endpoint_rejects_invalid_trending_parameters(self):
        with patch("app.get_trending_players") as get_trending:
            response = self.client.get(
                "/api/sleeper/trending/add?lookback_hours=0"
            )

        self.assertEqual(response.status_code, 400)
        get_trending.assert_not_called()

    def test_trending_players_include_names_and_activity_count(self):
        trending = [{"player_id": "2", "count": 42}]
        with patch("sleeper_connection.requests.get") as request:
            request.return_value.status_code = 200
            request.return_value.json.return_value = trending
            with patch("sleeper_connection._load_players", return_value=self.player_directory):
                result = get_trending_players("add", lookback_hours=24, limit=25)

        self.assertEqual(result["trend_type"], "add")
        self.assertEqual(result["players"][0]["name"], "Free Agent Runner")
        self.assertEqual(result["players"][0]["count"], 42)
        request.assert_called_once_with(
            "https://api.sleeper.app/v1/players/nfl/trending/add",
            params={"lookback_hours": 24, "limit": 25},
            timeout=10,
        )


if __name__ == "__main__":
    unittest.main()
