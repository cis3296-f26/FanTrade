from unittest.mock import patch
import unittest

from app import app
from fancalc_connection import build_player_value_lookup
from test_trade_search import varied_fixture
from test_trade_suggestions import fixture, player
from trade_preferences import TradePreferences
from trade_search import LeagueTradeContext, build_packages, prepare_team, team_packages
from trade_suggestions import find_compatible_trade_partners, _generate_from_context


def league_with_partners():
    league, market = fixture()
    for roster_id in range(3, 7):
        players = [player(roster_id * 10 + i, pos, value) for i, (pos, value) in enumerate(
            [('QB', 6000), ('RB', 3100), ('RB', 3200), ('WR', 2500)])]
        league['rosters'].append({'roster_id': roster_id, 'players': players})
        market.extend({'player': {'sleeperId': p['player_id'], 'position': p['position'], 'name': p['name']},
                       'value': p['value']} for p in players)
    return league, market


class PartnerSearchTests(unittest.TestCase):
    def test_explicit_position_never_falls_back_to_any(self):
        league, market = fixture()
        with patch('trade_suggestions._generate_from_context', wraps=_generate_from_context) as generate:
            result = find_compatible_trade_partners(league, 1, market, 'TE')
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(generate.call_args.args[3], 'TE')
        partner = result['partners'][0]
        self.assertEqual(partner['verification_status'], 'no_match')
        self.assertFalse(partner['has_direct_trade'])
        self.assertIsNone(partner['suggestion_result'])

    def test_verified_result_respects_style_range_and_actual_target(self):
        league, market = varied_fixture()
        preferences = TradePreferences(1, 35, 'add_depth')
        result = find_compatible_trade_partners(league, 1, market, 'RB', preferences)
        self.assertEqual(result['preferences'], preferences.as_dict())
        partner = result['partners'][0]
        self.assertEqual(partner['verification_status'], 'ready')
        suggestion = partner['suggestion_result']['suggestion']
        trade = suggestion['evaluation']
        self.assertLess(len(trade['give']), len(trade['receive']))
        self.assertEqual(partner['target_position'], suggestion['target_position'])
        self.assertEqual(partner['target_position'], 'RB')
        self.assertEqual(partner['direct_trade_preview']['advantage_percent'], suggestion['net_advantage_percent'])
        self.assertTrue(preferences.accepts_value(trade['give_total'], trade['receive_total'],
                                                 suggestion['roster_moves']['you']['drop_value']))

    def test_any_autofills_the_target_of_the_verified_trade(self):
        league, market = fixture()
        # A heuristic suggestion can differ from the actual successful package.
        with patch('trade_suggestions.calculate_pair_compatibility', return_value={
                'score': 50, 'tier': 'Moderate Match', 'primary_axis': 'Target TE',
                'give_position': 'WR', 'target_position': 'TE', 'reasons': []}):
            result = find_compatible_trade_partners(league, 1, market)
        partner = result['partners'][0]
        self.assertTrue(partner['has_direct_trade'])
        self.assertEqual(partner['target_position'], 'RB')
        self.assertEqual(partner['direct_trade_preview']['target_position'], 'RB')

    def test_pages_keep_order_and_bound_total_search_work(self):
        league, market = league_with_partners()
        with patch('trade_suggestions.MAX_PARTNER_CANDIDATE_PAIRS', 21), \
                patch('trade_suggestions.MAX_PARTNER_LINEUP_CHECKS', 9):
            first = find_compatible_trade_partners(league, 1, market)
            second = find_compatible_trade_partners(league, 1, market, verification_offset=3)
        self.assertEqual([p['roster_id'] for p in first['partners']],
                         [p['roster_id'] for p in second['partners']])
        self.assertEqual(first['verification']['next_offset'], 3)
        self.assertIsNone(second['verification']['next_offset'])
        self.assertEqual(first['verification']['checked_count'], 3)
        self.assertEqual(second['verification']['checked_count'], 2)
        self.assertTrue(all(p['verification_status'] == 'not_checked' for p in first['partners'][3:]))
        self.assertTrue(all(p['verification_status'] == 'not_checked' for p in second['partners'][:3]))
        for result in (first, second):
            self.assertLessEqual(result['verification']['candidates_considered'], 21)
            self.assertLessEqual(result['verification']['candidates_checked'], 9)

    def test_limited_search_is_distinct_from_no_match(self):
        league, market = fixture()
        with patch('trade_suggestions.MAX_PARTNER_LINEUP_CHECKS', 0):
            result = find_compatible_trade_partners(league, 1, market, 'RB')
        partner = result['partners'][0]
        self.assertEqual(partner['verification_status'], 'search_limited')
        self.assertFalse(partner['has_direct_trade'])

    def test_scan_builds_one_lookup_and_prepares_each_roster_once(self):
        league, market = league_with_partners()
        with patch('trade_search.build_player_value_lookup', wraps=build_player_value_lookup) as lookup, \
                patch('trade_search.prepare_team', wraps=prepare_team) as prepare:
            find_compatible_trade_partners(league, 1, market)
        self.assertEqual(lookup.call_count, 1)
        self.assertEqual(prepare.call_count, len(league['rosters']))
        self.assertEqual(len({call.args[0]['roster_id'] for call in prepare.call_args_list}), len(league['rosters']))

    def test_context_reuses_packages_and_shared_need_ranking(self):
        league, market = fixture()
        context = LeagueTradeContext(league, market)
        team = context.team(1)
        self.assertIs(team, context.team(1))
        with patch('trade_search.build_packages', wraps=build_packages) as build:
            first = team_packages(team, [1, 2, 3])
            second = team_packages(team, [1, 2])
        self.assertIs(first[2], second[2])
        self.assertEqual(build.call_count, 1)
        self.assertEqual(context.targets(team, 'ANY')[0], 'RB')
        self.assertEqual(team['needs']['RB']['status'], 'need')
        self.assertEqual(context.targets(team, 'QB'), ['QB'])
        self.assertNotIn('QB', context.targets(team, 'FLEX'))

    def test_unavailable_data_does_not_become_no_match(self):
        league, market = fixture()
        # Overlapping ownership makes this pair invalid, not a completed search.
        league['rosters'][1]['players'].append(league['rosters'][0]['players'][0])
        result = find_compatible_trade_partners(league, 1, market)
        self.assertEqual(result['partners'][0]['verification_status'], 'unavailable')
        self.assertIn('overlapping', result['partners'][0]['verification_message'])
        with self.assertRaises(RuntimeError):
            find_compatible_trade_partners(league, 1, [])


class PartnerPreferencesApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.url = '/api/trade-suggestions/compatible-partners'
        self.payload = {'league_id': '123', 'your_roster_id': 1}

    def test_invalid_preferences_and_pages_do_not_fetch_rosters(self):
        for fields in ({'position': 'K'}, {'position': []}, {'min_gain_percent': 0},
                       {'max_gain_percent': 9}, {'trade_style': ['trade_up', 'add_depth']},
                       {'verification_offset': True}, {'verification_offset': -1},
                       {'verification_offset': 14}, {'verification_offset': '3'}):
            with self.subTest(fields=fields), patch('app.get_league_rosters') as fetch:
                response = self.client.post(self.url, json={**self.payload, **fields})
                self.assertEqual(response.status_code, 400)
                fetch.assert_not_called()

    def test_endpoint_loads_values_once_and_passes_preferences_and_page(self):
        league, market = league_with_partners()
        fields = {'min_gain_percent': 1, 'max_gain_percent': 35, 'trade_style': 'balanced',
                  'verification_offset': 3, 'position': 'RB'}
        with patch('app.get_league_rosters', return_value=league), \
                patch('fancalc_connection.fetch_fancalc_values', return_value=market) as fetch:
            response = self.client.post(self.url, json={**self.payload, **fields})
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result['preferences'], TradePreferences(1, 35, 'balanced').as_dict())
        self.assertEqual(result['verification']['offset'], 3)
        self.assertEqual(result['target_position'], 'RB')
        fetch.assert_called_once_with(is_dynasty=False, num_qbs=1, num_teams=10, ppr=0.5)


if __name__ == '__main__':
    unittest.main()
