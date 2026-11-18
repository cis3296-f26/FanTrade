from copy import deepcopy
from itertools import product
import unittest

from trade_analysis import (
    SLOT_POSITIONS, analyze_roster, extract_valued_players_for_roster,
)


class TradeAnalysisTests(unittest.TestCase):
    def test_lineup_matches_exhaustive_assignment_for_overlapping_flex_slots(self):
        players = [
            {"player_id": "1", "position": "QB", "value": 90},
            {"player_id": "2", "position": "QB", "value": 80},
            {"player_id": "3", "position": "RB", "value": 70},
            {"player_id": "4", "position": "WR", "value": 60},
            {"player_id": "5", "position": "TE", "value": 50},
        ]
        original = deepcopy(players)
        for slots in (["QB", "FLEX", "REC_FLEX", "SUPER_FLEX"],
                      ["QB", "RB", "RB", "WRRB_FLEX"]):
            # A tiny exhaustive search gives us an independent correctness check.
            choices = [[None] + [p for p in players if p["position"] in SLOT_POSITIONS[slot]]
                       for slot in slots]
            best = (0, 0)
            for assignment in product(*choices):
                selected = [p for p in assignment if p is not None]
                if len({p["player_id"] for p in selected}) != len(selected):
                    continue
                best = max(best, (len(selected), sum(p["value"] for p in selected)))
            actual = analyze_roster(players, slots)
            self.assertEqual((actual["filled_slots"], actual["value"]), best)
            assigned = [s["player"]["player_id"] for s in actual["starters"] if s["player"]]
            self.assertEqual(len(assigned), len(set(assigned)))
        self.assertEqual(players, original)

    def test_valued_players_preserve_roster_eligibility_and_shared_lookup(self):
        roster = {"players": [
            {"player_id": "1", "position": "RB", "full_name": "Roster name"},
            {"player_id": "1", "position": "RB"},
            {"player_id": "2", "position": "K"},
            {"player_id": "3", "position": "DEF"},
            {"player_id": "4", "position": "WR"},
        ]}
        records = {
            "1": {"player_id": "1", "position": "WR", "value": 100, "unranked": False},
            "4": {"player_id": "4", "position": "WR", "value": 0, "unranked": True},
        }
        original = deepcopy(records)
        players = extract_valued_players_for_roster(roster, records.__getitem__)
        self.assertEqual(len(players), 1)
        self.assertEqual(players[0]["position"], "RB")
        self.assertEqual(players[0]["name"], "Roster name")
        # Changing this team's records must not change a shared value snapshot.
        players[0]["value"] = 200
        self.assertEqual(records, original)


if __name__ == "__main__":
    unittest.main()
