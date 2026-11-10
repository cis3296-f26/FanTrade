import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch

from sleeper_connection import get_league_rosters


class LeagueTradeSettingsTests(unittest.TestCase):
    def test_roster_response_keeps_settings_and_unfilled_slots(self):
        # Empty starter entries shouldn't erase the league's lineup requirements.
        league = {
            "name": "Test League", "season": "2026",
            "roster_positions": ["QB", "RB", "WR", "FLEX", "SUPER_FLEX", "BN"],
            "scoring_settings": {"rec": 0.5, "pass_td": 6},
            "settings": {"type": 2, "num_teams": 10},
        }
        responses = [
            Mock(status_code=200, json=Mock(return_value=league)),
            Mock(status_code=200, json=Mock(return_value=[])),
            Mock(status_code=200, json=Mock(return_value=[
                {"roster_id": 1, "players": [], "starters": ["0"] * 5},
            ])),
        ]
        # Stub every external data source so this test runs without API access.
        with ExitStack() as stack:
            stack.enter_context(patch("sleeper_connection.requests.get", side_effect=responses))
            stack.enter_context(patch("sleeper_connection.get_current_nfl_state", return_value={"season": "2026", "week": 1}))
            for loader in ("_load_weekly_projections", "_load_weekly_stats", "_load_weekly_matchups", "_load_players"):
                stack.enter_context(patch(f"sleeper_connection.{loader}", return_value={}))
            result = get_league_rosters("test-league")

        self.assertEqual(result["roster_positions"], league["roster_positions"])
        self.assertEqual(result["scoring_settings"], {"rec": 0.5, "pass_td": 6})
        self.assertEqual(result["settings"], {"type": 2, "num_teams": 10})
        self.assertEqual(result["total_rosters"], 1)
        self.assertEqual(result["rosters"][0]["players"], [])


if __name__ == "__main__":
    unittest.main()
