import unittest

from trade_preferences import TradePreferences, parse_trade_preferences


class TradePreferencesTests(unittest.TestCase):
    def test_defaults_allow_every_package_size(self):
        preferences = parse_trade_preferences({})
        self.assertEqual(preferences.as_dict(), {
            "min_gain_percent": 4, "max_gain_percent": 12, "trade_style": "any",
        })
        self.assertEqual(set(preferences.formats), {
            (1, 1), (1, 2), (1, 3), (2, 1), (2, 2),
            (2, 3), (3, 1), (3, 2), (3, 3),
        })

    def test_styles_only_allow_the_requested_direction(self):
        # Compare the actual give/receive counts, not just the style names.
        expected = {
            "trade_up": {(2, 1), (3, 1), (3, 2)},
            "balanced": {(1, 1), (2, 2), (3, 3)},
            "add_depth": {(1, 2), (1, 3), (2, 3)},
            "trade_up_or_balanced": {(2, 1), (3, 1), (3, 2), (1, 1), (2, 2), (3, 3)},
            "add_depth_or_balanced": {(1, 2), (1, 3), (2, 3), (1, 1), (2, 2), (3, 3)},
        }
        for style, formats in expected.items():
            with self.subTest(style=style):
                result = parse_trade_preferences({"trade_style": style})
                self.assertEqual(set(result.formats), formats)
                self.assertEqual(len(result.formats), len(formats))

    def test_range_accepts_endpoints_and_exact_eight_point_gap(self):
        for low, high in ((1, 9), (4, 12), (27, 35), (1, 35)):
            with self.subTest(low=low, high=high):
                preferences = TradePreferences(low, high)
                self.assertTrue(preferences.accepts_value(10000 - low * 100, 10000))
                self.assertTrue(preferences.accepts_value(10000 - high * 100, 10000))

    def test_invalid_ranges_and_types_are_rejected(self):
        for low, high in ((0, 12), (4, 36), (12, 4), (4, 11),
                          (True, 12), (4, False), (4.5, 13), (4, 12.0),
                          ("4", 12), (None, 12), ([], 12), (4, float("nan"))):
            with self.subTest(low=low, high=high), self.assertRaises(ValueError):
                parse_trade_preferences({"min_gain_percent": low, "max_gain_percent": high})

    def test_invalid_style_or_request_is_rejected(self):
        for style in ("unknown", "TRADE_UP", ["trade_up", "add_depth"], None, True):
            with self.subTest(style=style), self.assertRaises(ValueError):
                parse_trade_preferences({"trade_style": style})
        for data in (None, [], "any"):
            with self.subTest(data=data), self.assertRaises(ValueError):
                parse_trade_preferences(data)

    def test_range_uses_unrounded_net_values(self):
        preferences = TradePreferences()
        for give, expected in ((9600, True), (8800, True), (9601, False),
                               (8799, False), (10000, False), (11000, False)):
            with self.subTest(give=give):
                self.assertEqual(preferences.accepts_value(give, 10000), expected)

    def test_required_cuts_can_move_a_trade_into_or_out_of_range(self):
        # The same exchange goes from 15% gross to 10% net with a 500-value cut.
        preferences = TradePreferences()
        self.assertFalse(preferences.accepts_value(8500, 10000))
        self.assertTrue(preferences.accepts_value(8500, 10000, drop_total=500))
        self.assertFalse(preferences.accepts_value(8500, 10000, drop_total=1200))

    def test_bad_totals_cannot_qualify_as_a_winning_trade(self):
        for invalid in (-1, float("nan"), float("inf"), None, "100", True):
            for field in range(3):
                totals = [9000, 10000, 0]
                totals[field] = invalid
                with self.subTest(invalid=invalid, field=field):
                    self.assertFalse(TradePreferences().accepts_value(*totals))
        self.assertFalse(TradePreferences().accepts_value(0, 0))


if __name__ == "__main__":
    unittest.main()
