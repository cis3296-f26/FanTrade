import unittest
from unittest.mock import patch

from app import app
from test_trade_suggestions import fixture, player
from trade_suggestions import (
    analyze_team_positional_needs,
    calculate_pair_compatibility,
    find_compatible_trade_partners,
    league_trade_settings,
    validate_compatible_partners_request,
)


class CompatiblePartnersUnitTests(unittest.TestCase):
    def test_validate_request_success(self):
        lid, yid, pos = validate_compatible_partners_request({"league_id": "12345", "your_roster_id": 1})
        self.assertEqual(lid, "12345")
        self.assertEqual(yid, 1)
        self.assertEqual(pos, "ANY")

        # Explicit position parsing
        _, _, pos_rb = validate_compatible_partners_request({"league_id": "12345", "your_roster_id": 1, "position": "rb"})
        self.assertEqual(pos_rb, "RB")

        # Unsupported position fallback
        _, _, pos_fallback = validate_compatible_partners_request({"league_id": "12345", "your_roster_id": 1, "position": "KICKER"})
        self.assertEqual(pos_fallback, "ANY")

    def test_validate_request_rejects_invalid_inputs(self):
        for bad in (
            None,
            {},
            {"league_id": "abc", "your_roster_id": 1},
            {"league_id": "123", "your_roster_id": -1},
            {"league_id": "123", "your_roster_id": "xyz"},
            {"league_id": "123", "your_roster_id": True},
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    validate_compatible_partners_request(bad)

    def test_analyze_team_positional_needs_detects_surplus_and_need(self):
        # Team with 5 WRs (surplus) and 1 low-value RB (need)
        players = [
            player(1, "QB", 8000),
            player(2, "RB", 1200),
            player(3, "WR", 9000),
            player(4, "WR", 7500),
            player(5, "WR", 5500),
            player(6, "WR", 4000),
            player(7, "WR", 3000),
        ]
        slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]
        analysis = analyze_team_positional_needs(players, slots)

        self.assertIn("WR", analysis)
        self.assertIn("RB", analysis)
        # WR has multiple startable bench players
        self.assertEqual(analysis["WR"]["status"], "surplus")
        self.assertGreaterEqual(analysis["WR"]["surplus_score"], 50)
        self.assertGreaterEqual(analysis["WR"]["quality_bench_count"], 2)

        # RB only has 1 player for 2 RB slots
        self.assertEqual(analysis["RB"]["status"], "need")
        self.assertGreaterEqual(analysis["RB"]["need_score"], 80)

    def test_dropoff_calculation(self):
        # RB1 is elite (9000), RB2 is weak (1000)
        players = [
            player(1, "QB", 7000),
            player(2, "RB", 9000),
            player(3, "RB", 1000),
            player(4, "WR", 6000),
            player(5, "WR", 5000),
        ]
        slots = ["QB", "RB", "RB", "WR", "WR"]
        analysis = analyze_team_positional_needs(players, slots)
        rb_dropoff = analysis["RB"]["within_starter_dropoff"]
        self.assertEqual(rb_dropoff, 8000)

    def test_pair_compatibility_ranks_complementary_needs_higher(self):
        slots = ["QB", "RB", "WR", "TE"]
        # Team A: Surplus WR, Needs RB
        team_a_players = [
            player(1, "QB", 8000),
            player(2, "RB", 1500),
            player(3, "WR", 9000),
            player(4, "WR", 7000),
            player(5, "TE", 4000),
        ]
        # Team B: Surplus RB, Needs WR
        team_b_players = [
            player(6, "QB", 8000),
            player(7, "RB", 8500),
            player(8, "RB", 6500),
            player(9, "WR", 1200),
            player(10, "TE", 4000),
        ]
        # Team C: Also Surplus WR, Needs RB (Competitor, not trade partner)
        team_c_players = [
            player(11, "QB", 8000),
            player(12, "RB", 1400),
            player(13, "WR", 8800),
            player(14, "WR", 6800),
            player(15, "TE", 4000),
        ]

        needs_a = analyze_team_positional_needs(team_a_players, slots)
        needs_b = analyze_team_positional_needs(team_b_players, slots)
        needs_c = analyze_team_positional_needs(team_c_players, slots)

        match_b = calculate_pair_compatibility(needs_a, needs_b)
        match_c = calculate_pair_compatibility(needs_a, needs_c)

        self.assertGreater(match_b["score"], match_c["score"])
        self.assertIn("Trade your WR depth for their RB depth", match_b["primary_axis"])
        self.assertEqual(match_b["target_position"], "RB")

    def test_find_compatible_trade_partners_full(self):
        league, market = fixture()
        # Add a 3rd team with matching WR needs to compare
        t3 = [player(9, "QB", 9000), player(10, "RB", 1800), player(11, "WR", 8200), player(12, "WR", 6500)]
        league["rosters"].append({"roster_id": 3, "team_name": "Team 3", "players": t3})
        market.extend([{"player": {"sleeperId": p["player_id"], "name": p["name"], "position": p["position"]}, "value": p["value"]} for p in t3])

        result = find_compatible_trade_partners(league, 1, market)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["your_roster_id"], 1)
        self.assertIn("WR", result["your_analysis"]["surplus_positions"])
        self.assertIn("RB", result["your_analysis"]["need_positions"])

        partners = result["partners"]
        self.assertEqual(len(partners), 2)
        # Partner 2 (Theirs) should rank #1 because of mutual WR/RB synergy
        top_partner = partners[0]
        self.assertEqual(top_partner["roster_id"], 2)
        self.assertGreater(top_partner["compatibility_score"], partners[1]["compatibility_score"])
        self.assertTrue(top_partner["has_direct_trade"])
        self.assertIsNotNone(top_partner["direct_trade_preview"])
        self.assertEqual(top_partner["direct_trade_preview"]["trade_type"], "2-for-2")
        self.assertEqual(top_partner["direct_trade_preview"]["give_count"], 2)
        self.assertEqual(top_partner["direct_trade_preview"]["receive_count"], 2)

    def test_all_partners_verified_for_direct_trades(self):
        # Verify that teams outside the top 3 still get direct trade checks
        league, market = fixture()
        # Add 3 extra teams (total 5 teams, so 4 partners for team 1)
        for r_id in (3, 4, 5):
            t = [
                player(r_id * 10 + 1, "QB", 6000),
                player(r_id * 10 + 2, "RB", 3100),
                player(r_id * 10 + 3, "RB", 3200),
                player(r_id * 10 + 4, "WR", 2500),
            ]
            league["rosters"].append({"roster_id": r_id, "team_name": f"Team {r_id}", "players": t})
            market.extend([
                {"player": {"sleeperId": p["player_id"], "name": p["name"], "position": p["position"]}, "value": p["value"]}
                for p in t
            ])

        result = find_compatible_trade_partners(league, 1, market)
        partners = result["partners"]
        self.assertEqual(len(partners), 4)
        # Any partner with an achievable trade package should have has_direct_trade verified
        verified = [p for p in partners if p["has_direct_trade"]]
        self.assertGreater(len(verified), 0)

    def test_calculate_pair_compatibility_dynamic_position(self):
        slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]
        # User: Surplus WR (5 WRs), Weak RB
        user_p = [
            player(1, "QB", 8000),
            player(2, "RB", 1500),
            player(3, "WR", 9000),
            player(4, "WR", 7500),
            player(5, "WR", 6000),
            player(6, "WR", 4500),
            player(7, "TE", 4000),
        ]
        # Partner RB: Surplus RB (5 RBs), Weak WR
        partner_rb_p = [
            player(10, "QB", 7000),
            player(11, "RB", 9000),
            player(12, "RB", 7500),
            player(13, "RB", 6000),
            player(14, "RB", 4500),
            player(15, "WR", 2000),
            player(16, "TE", 4000),
        ]
        # Partner QB: Surplus QB (3 QBs), Weak WR
        partner_qb_p = [
            player(20, "QB", 9500),
            player(21, "QB", 8500),
            player(22, "QB", 6000),
            player(23, "RB", 2000),
            player(24, "WR", 2000),
            player(25, "TE", 4000),
        ]

        u_needs = analyze_team_positional_needs(user_p, slots)
        rb_needs = analyze_team_positional_needs(partner_rb_p, slots)
        qb_needs = analyze_team_positional_needs(partner_qb_p, slots)

        # When filtering by RB: partner_rb should beat partner_qb
        comp_rb_for_rb = calculate_pair_compatibility(u_needs, rb_needs, requested_position="RB")
        comp_qb_for_rb = calculate_pair_compatibility(u_needs, qb_needs, requested_position="RB")
        self.assertGreater(comp_rb_for_rb["score"], comp_qb_for_rb["score"])
        self.assertEqual(comp_rb_for_rb["target_position"], "RB")

        # When filtering by QB: partner_qb should beat partner_rb
        comp_qb_for_qb = calculate_pair_compatibility(u_needs, qb_needs, requested_position="QB")
        comp_rb_for_qb = calculate_pair_compatibility(u_needs, rb_needs, requested_position="QB")
        self.assertGreater(comp_qb_for_qb["score"], comp_rb_for_qb["score"])
        self.assertEqual(comp_qb_for_qb["target_position"], "QB")


class CompatiblePartnersApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.payload = {"league_id": "123", "your_roster_id": 1}

    def test_api_endpoint_success(self):
        league, market = fixture()
        with patch("app.get_league_rosters", return_value=league), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=market):
            response = self.client.post("/api/trade-suggestions/compatible-partners", json=self.payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["your_roster_id"], 1)
        self.assertEqual(len(data["partners"]), 1)
        self.assertEqual(data["partners"][0]["roster_id"], 2)

    def test_api_endpoint_with_position(self):
        league, market = fixture()
        with patch("app.get_league_rosters", return_value=league), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=market):
            response = self.client.post(
                "/api/trade-suggestions/compatible-partners",
                json={"league_id": "123", "your_roster_id": 1, "position": "WR"},
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["target_position"], "WR")

    def test_api_endpoint_invalid_input(self):
        response = self.client.post("/api/trade-suggestions/compatible-partners", json={"league_id": "invalid"})
        self.assertEqual(response.status_code, 400)

    def test_api_endpoint_foreign_team(self):
        league, market = fixture()
        with patch("app.get_league_rosters", return_value=league), \
             patch("fancalc_connection.fetch_fancalc_values", return_value=market):
            response = self.client.post(
                "/api/trade-suggestions/compatible-partners",
                json={"league_id": "123", "your_roster_id": 999},
            )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
