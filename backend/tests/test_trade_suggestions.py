import unittest
from unittest.mock import patch

from trade_suggestions import (
    analyze_roster, generate_trade_suggestion, league_trade_settings,
    rank_target_positions, validate_suggestion_request, within_value_range,
)


def player(pid, position, value):
    return {"player_id": str(pid), "full_name": f"Player {pid}",
            "name": f"Player {pid}", "position": position, "value": value}


def fixture():
    # Each team has a strong starter plus spare depth the other team can use.
    yours = [player(1, "QB", 9000), player(2, "RB", 2000),
             player(3, "WR", 8000), player(4, "WR", 6000)]
    theirs = [player(5, "QB", 9000), player(6, "RB", 7000),
              player(7, "RB", 5000), player(8, "WR", 3500)]
    league = {
        "roster_positions": ["QB", "RB", "WR", "K", "DEF", "BN"],
        "scoring_settings": {"rec": 0.5},
        "settings": {"type": 0, "num_teams": 10}, "total_rosters": 10,
        "rosters": [{"roster_id": 1, "team_name": "Yours", "players": yours},
                    {"roster_id": 2, "team_name": "Theirs", "players": theirs}],
    }
    market = [{"player": {"sleeperId": p["player_id"], "name": p["name"],
                          "position": p["position"]}, "value": p["value"]}
              for p in yours + theirs]
    return league, market


class SuggestionTests(unittest.TestCase):
    def test_finds_mutually_helpful_trade_for_explicit_any_and_flex(self):
        for requested in ("RB", "ANY", "FLEX"):
            with self.subTest(requested=requested):
                league, market = fixture()
                result = generate_trade_suggestion(league, 1, 2, requested, market)
                self.assertEqual(result["status"], "ok")
                suggestion = result["suggestion"]
                trade = suggestion["evaluation"]
                self.assertEqual(suggestion["target_position"], "RB")
                self.assertGreater(suggestion["your_lineup_value_gain"], 0)
                self.assertGreater(suggestion["partner_lineup_value_gain"], 0)
                self.assertTrue(within_value_range(trade["give_total"], trade["receive_total"]))
                self.assertEqual(len(trade["give"]), 2)
                self.assertEqual(len(trade["receive"]), 2)
                self.assertEqual(len({p["player_id"] for p in trade["give"] + trade["receive"]}), 4)
                self.assertEqual(result["settings"]["ppr"], 0.5)

    def test_range_includes_boundaries_without_rounding_in_near_misses(self):
        for give, expected in [(9800, True), (9200, True), (9801, False),
                               (9199, False), (10000, False), (10100, False)]:
            with self.subTest(give=give):
                self.assertEqual(within_value_range(give, 10000), expected)

    def test_flex_and_superflex_assign_each_player_once(self):
        roster = [player(1, "QB", 9000), player(2, "QB", 8000),
                  player(3, "RB", 7000), player(4, "WR", 6000),
                  player(5, "TE", 5000)]
        result = analyze_roster(roster, ["QB", "RB", "FLEX", "SUPER_FLEX"])
        self.assertEqual(result["filled_slots"], 4)
        self.assertEqual(result["value"], 30000)
        ids = [s["player"]["player_id"] for s in result["starters"]]
        self.assertEqual(len(set(ids)), 4)
        self.assertEqual(result["depth"][0]["player_id"], "5")

    def test_need_ranking_compares_positions_to_their_own_market(self):
        analysis = analyze_roster([player(1, "QB", 2000), player(2, "TE", 1000)], ["QB", "TE"])
        market = {"QB": [1000, 2000, 3000, 4000], "TE": [100, 200, 300, 1000]}
        self.assertEqual(rank_target_positions(analysis, "ANY", market)[0], "QB")

    def test_kicker_defense_and_missing_values_cannot_enter_packages(self):
        league, market = fixture()
        for i, roster in enumerate(league["rosters"]):
            roster["players"] += [player(100 + i, "K", 10000),
                                  player(200 + i, "DEF", 10000),
                                  player(300 + i, "RB", 10000)]
        result = generate_trade_suggestion(league, 1, 2, "RB", market)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(result["warnings"]), 2)
        trade = result["suggestion"]["evaluation"]
        self.assertTrue(all(p["position"] in ("QB", "RB", "WR", "TE") for p in trade["give"] + trade["receive"]))
        self.assertTrue(all(not p["unranked"] for p in trade["give"] + trade["receive"]))

    def test_explicit_unavailable_position_returns_no_match(self):
        league, market = fixture()
        result = generate_trade_suggestion(league, 1, 2, "TE", market)
        self.assertEqual(result["status"], "no_match")
        self.assertIsNone(result["suggestion"])

    def test_value_advantage_alone_is_not_enough(self):
        league, market = fixture()
        # With every player required as a starter, one side's market-value
        # gain necessarily costs the other side starter value.
        league["roster_positions"] = ["QB", "RB", "WR", "FLEX"]
        result = generate_trade_suggestion(league, 1, 2, "ANY", market)
        self.assertEqual(result["status"], "no_match")

    def test_missing_market_data_is_not_reported_as_no_trade(self):
        league, _ = fixture()
        with self.assertRaises(RuntimeError):
            generate_trade_suggestion(league, 1, 2, "ANY", [])

    def test_search_limit_is_reported(self):
        league, market = fixture()
        with patch("trade_suggestions.MAX_LINEUP_CHECKS", 0):
            result = generate_trade_suggestion(league, 1, 2, "ANY", market)
        self.assertTrue(result["search_limited"])
        self.assertTrue(result["warnings"])

    def test_settings_mapping_and_unsupported_formats(self):
        league, _ = fixture()
        league["settings"]["type"] = 2
        league["roster_positions"].append("SUPER_FLEX")
        slots, settings = league_trade_settings(league)
        self.assertTrue(settings["is_dynasty"])
        self.assertEqual(settings["num_qbs"], 2)
        self.assertNotIn("K", slots)
        league["roster_positions"].append("IDP_FLEX")
        with self.assertRaises(ValueError):
            league_trade_settings(league)

    def test_invalid_requests_are_rejected(self):
        valid = {"league_id": "123", "your_roster_id": 1, "partner_roster_id": 2}
        for changes in ({"position": "K"}, {"position": "DEF"}, {"position": []},
                        {"partner_roster_id": 1}, {"your_roster_id": True},
                        {"league_id": ""}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_suggestion_request({**valid, **changes})
        self.assertEqual(validate_suggestion_request(valid), ("123", 1, 2, "ANY"))


if __name__ == "__main__":
    unittest.main()
