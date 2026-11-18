from copy import deepcopy
from unittest.mock import patch
import unittest

from trade_analysis import analyze_roster
from trade_preferences import TradePreferences
from trade_search import (
    build_packages, prepare_team, qualifying_target, search_packages,
    simulate_exchange, shortlist_packages,
)
from trade_suggestions import generate_trade_suggestion


def player(pid, pos, value):
    return {'player_id': str(pid), 'position': pos, 'value': value,
            'name': f'Player {pid}', 'unranked': False}


def varied_fixture():
    # Both rosters have solid starters and spare players at different positions.
    positions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'TE', 'TE']
    yours = [player(i + 1, pos, value) for i, (pos, value) in enumerate(zip(
        positions, [9000, 8000, 1000, 5000, 1000, 3000, 100, 200]))]
    theirs = [player(i + 21, pos, value) for i, (pos, value) in enumerate(zip(
        positions, [9000, 6000, 5500, 4500, 4000, 3000, 100, 200]))]
    league = {'roster_positions': ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'],
              'settings': {'type': 0, 'num_teams': 10}, 'scoring_settings': {'rec': 1},
              'rosters': [{'roster_id': 1, 'players': yours}, {'roster_id': 2, 'players': theirs}]}
    market = [{'player': {'sleeperId': p['player_id'], 'position': p['position'], 'name': p['name']},
               'value': p['value']} for p in yours + theirs]
    return league, market


class TradeSearchTests(unittest.TestCase):
    def test_every_format_can_produce_a_valid_trade(self):
        for give_count in range(1, 4):
            for receive_count in range(1, 4):
                with self.subTest(give=give_count, receive=receive_count):
                    league, market = varied_fixture()
                    # Isolate one legal format at a time, so a good 2-for-2 cannot
                    # hide a broken 1-for-3 or another less common package size.
                    with patch.dict('trade_preferences.TRADE_FORMATS', {'any': ((give_count, receive_count),)}):
                        result = generate_trade_suggestion(league, 1, 2, 'ANY', market, TradePreferences(1, 35))
                    self.assertEqual(result['status'], 'ok')
                    suggestion = result['suggestion']
                    evaluation = suggestion['evaluation']
                    self.assertEqual(len(evaluation['give']), give_count)
                    self.assertEqual(len(evaluation['receive']), receive_count)
                    moves = suggestion['roster_moves']
                    self.assertEqual(moves['you']['required_drops'], max(0, receive_count - give_count))
                    self.assertEqual(moves['partner']['required_drops'], max(0, give_count - receive_count))
                    self.assertTrue(TradePreferences(1, 35).accepts_value(
                        evaluation['give_total'], evaluation['receive_total'], moves['you']['drop_value']))
                    self.assertEqual(len({p['player_id'] for p in evaluation['give'] + evaluation['receive']}),
                                     give_count + receive_count)
                    after = [p for p in league['rosters'][0]['players']
                             if p['player_id'] not in {q['player_id'] for q in evaluation['give'] + moves['you']['suggested_drops']}]
                    lineup = analyze_roster(after + evaluation['receive'], ['QB', 'RB', 'WR', 'TE', 'FLEX'])
                    incoming_ids = {p['player_id'] for p in evaluation['receive']}
                    incoming_starters = sum(bool(s['player'] and s['player']['player_id'] in incoming_ids)
                                            for s in lineup['starters'])
                    self.assertGreaterEqual(incoming_starters, receive_count - 1 if receive_count > give_count else 1)
                    self.assertEqual(lineup['filled_slots'], 5)

    def test_add_depth_requires_one_of_two_or_two_of_three_incoming_starters(self):
        old = analyze_roster([player(1, 'RB', 9000), player(2, 'WR', 5000)], ['RB', 'WR'])
        incoming = [player(3, 'RB', 6000), player(4, 'WR', 4000), player(5, 'TE', 100)]
        two = build_packages(incoming[:2], [2])[2][0]
        three = build_packages(incoming, [3])[3][0]
        one_starting = analyze_roster([incoming[0], player(2, 'WR', 5000)] + incoming[1:], ['RB', 'WR'])
        two_starting = analyze_roster(incoming, ['RB', 'WR'])
        self.assertEqual(qualifying_target(old, one_starting, two, ['RB'], 1), 'RB')
        self.assertIsNone(qualifying_target(old, one_starting, three, ['RB'], 1))
        self.assertEqual(qualifying_target(old, two_starting, three, ['RB'], 1), 'RB')
        self.assertEqual(qualifying_target(old, two_starting, three, ['WR'], 2), 'WR')
        self.assertIsNone(qualifying_target(old, two_starting, three, ['QB'], 1))
        self.assertLess(two_starting['value'], old['value'])

    def test_cuts_use_open_slots_and_protect_the_only_quarterback(self):
        players = [player(1, 'QB', 100), player(2, 'RB', 9000), player(3, 'RB', 500)]
        incoming = [player(4, 'RB', 7000), player(5, 'WR', 3000)]
        records = {p['player_id']: p for p in players}
        roster = {'roster_id': 1, 'players': players}
        give = build_packages([players[1]], [1])[1][0]
        receive = build_packages(incoming, [2])[2][0]
        for capacity, expected in ((3, 1), (4, 0)):
            team = prepare_team(roster, records.__getitem__, ['QB', 'RB'], capacity)
            original = deepcopy(team)
            result = simulate_exchange(team, give, receive, ['QB', 'RB'])
            self.assertEqual(result['required_drops'], expected)
            self.assertEqual([p['player_id'] for p in result['suggested_drops']], ['3'] if expected else [])
            self.assertEqual(team, original)
            self.assertEqual(result['lineup']['filled_slots'], 2)

    def test_unknown_players_count_toward_capacity_but_are_not_free_cuts(self):
        roster = {'roster_id': 1, 'players': [player(1, 'QB', 100), player(2, 'RB', 9000),
                                              player(3, 'WR', 0), player(4, 'K', 0)]}
        records = {p['player_id']: p for p in roster['players']}
        team = prepare_team(roster, records.__getitem__, ['QB', 'RB'], 4)
        self.assertEqual(team['occupied'], 4)
        self.assertEqual(team['missing'], 1)
        give = build_packages([records['2']], [1])[1][0]
        receive = build_packages([player(5, 'RB', 7000), player(6, 'WR', 3000)], [2])[2][0]
        self.assertIsNone(simulate_exchange(team, give, receive, ['QB', 'RB']))

    def test_ir_and_taxi_players_use_separate_space_and_do_not_enter_packages(self):
        roster = {'roster_id': 1, 'players': [player(1, 'QB', 100), player(2, 'RB', 9000), player(3, 'WR', 8000)],
                  'reserve': ['2'], 'taxi': ['3']}
        records = {p['player_id']: p for p in roster['players']}
        team = prepare_team(roster, records.__getitem__, ['QB'], 1)
        self.assertEqual(team['occupied'], 1)
        self.assertEqual([p['player_id'] for p in team['players']], ['1'])

    def test_value_join_keeps_trades_whose_cuts_reduce_gross_advantage(self):
        players = [player(1, 'QB', 100), player(2, 'RB', 8500), player(3, 'WR', 500)]
        incoming = [player(4, 'RB', 7000), player(5, 'WR', 3000)]
        records = {p['player_id']: p for p in players + incoming}
        yours = prepare_team({'roster_id': 1, 'players': players}, records.__getitem__, ['QB', 'RB'], 3)
        theirs = prepare_team({'roster_id': 2, 'players': incoming}, records.__getitem__, ['QB', 'RB'], 3)
        with patch.dict('trade_preferences.TRADE_FORMATS', {'any': ((1, 2),)}):
            candidates, _, _ = shortlist_packages(yours, theirs, TradePreferences(), ['RB'], 100, 100)
        self.assertIn((frozenset(['2']), frozenset(['4', '5'])), [(g.ids, r.ids) for g, r in candidates])
        result, _ = search_packages(yours, theirs, ['QB', 'RB'], TradePreferences(trade_style='add_depth'), ['RB'], 100, 100)
        self.assertIsNotNone(result)
        self.assertEqual(result['your_after']['drop_value'], 500)
        self.assertLess(result['gains'][0], 0)

    def test_large_rosters_respect_both_search_budgets(self):
        yours = [player(i + 1, ('QB', 'RB', 'WR', 'TE')[i % 4], 1000 + i * 100) for i in range(30)]
        theirs = [player(i + 101, ('QB', 'RB', 'WR', 'TE')[i % 4], 1050 + i * 100) for i in range(30)]
        records = {p['player_id']: p for p in yours + theirs}
        slots = ['QB', 'RB', 'WR', 'FLEX']
        teams = [prepare_team({'roster_id': i, 'players': p}, records.__getitem__, slots, 30)
                 for i, p in enumerate((yours, theirs))]
        candidates, considered, limited = shortlist_packages(*teams, TradePreferences(1, 35), list(('QB', 'RB', 'WR', 'TE')), 90, 18)
        self.assertLessEqual(considered, 90)
        self.assertLessEqual(len(candidates), 18)
        self.assertTrue(limited)
        self.assertEqual({(len(g.players), len(r.players)) for g, r in candidates},
                         set(TradePreferences().formats))


if __name__ == '__main__':
    unittest.main()
