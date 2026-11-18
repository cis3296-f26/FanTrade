"""Build and check bounded trade packages without additional network requests."""

from bisect import bisect_left, bisect_right
from collections import Counter
from dataclasses import dataclass
from heapq import heappush, heapreplace
from itertools import combinations

import math

from fancalc_connection import build_player_value_lookup
from trade_analysis import (
    POSITIONS, SLOT_POSITIONS, analyze_roster, analyze_team_positional_needs,
    extract_valued_players_for_roster, league_trade_settings, rank_target_positions,
)


class LeagueTradeContext:
    """Reuse one value snapshot and lazily prepare each roster during a request."""

    def __init__(self, league, fc_data):
        self.slots, self.settings = league_trade_settings(league)
        self.capacity = len(league["roster_positions"])
        self.rosters = {str(r["roster_id"]): r for r in league.get("rosters", [])}
        directory = {str(p["player_id"]): p for r in self.rosters.values() for p in r.get("players", [])}
        self.lookup = build_player_value_lookup(fc_data, directory)
        self.teams = {}
        self.market = {position: [] for position in POSITIONS}
        for item in fc_data:
            position = (item.get("player") or {}).get("position")
            value = item.get("value")
            if (position in self.market and isinstance(value, (int, float))
                    and not isinstance(value, bool) and math.isfinite(value) and value > 0):
                self.market[position].append(value)
        for values in self.market.values():
            values.sort()

    def team(self, roster_id):
        """Prepare a team's lineup and needs once, even across several previews."""
        key = str(roster_id)
        if key not in self.rosters:
            raise ValueError("Both teams must belong to the selected league.")
        if key not in self.teams:
            team = prepare_team(self.rosters[key], self.lookup, self.slots, self.capacity)
            team["needs"] = analyze_team_positional_needs(team["players"], self.slots, lineup=team["lineup"])
            self.teams[key] = team
        return self.teams[key]

    def targets(self, team, requested):
        """Use the same needs shown in recommendations to prioritize generation."""
        ranked = rank_target_positions(team["lineup"], requested, self.market)
        eligible = {position for slot in self.slots for position in SLOT_POSITIONS[slot]}
        # Market percentiles break ties between equally severe positional needs.
        return sorted((p for p in ranked if p in eligible),
                      key=lambda p: (-team["needs"][p]["need_score"], ranked.index(p)))


@dataclass(frozen=True)
class Package:
    """Keep package totals and IDs ready for cheap comparisons."""

    players: tuple
    ids: frozenset
    total: float
    positions: frozenset


def build_packages(players, sizes):
    """Build each permitted package once, sorted by its market value."""
    return {
        size: sorted((Package(tuple(group), frozenset(p['player_id'] for p in group),
                              sum(p['value'] for p in group),
                              frozenset(p['position'] for p in group))
                      for group in combinations(players, size)),
                     key=lambda package: (package.total, tuple(sorted(package.ids))))
        for size in sorted(set(sizes))
    }


def team_packages(team, sizes):
    """Share package construction across previews for the same team."""
    cache = team.setdefault("packages", {})
    missing = set(sizes) - cache.keys()
    if missing:
        cache.update(build_packages(team["players"], missing))
    return cache


def prepare_team(roster, lookup, slots, capacity):
    """Keep roster occupancy separate from the players we can safely value."""
    reserved = {str(pid) for pid in (roster.get('reserve') or []) + (roster.get('taxi') or [])}
    active = {str(p['player_id']): p for p in roster.get('players', [])
              if str(p['player_id']) not in reserved}
    players = extract_valued_players_for_roster({'players': list(active.values())}, lookup)
    if len(players) > 30:
        raise ValueError('Suggestions currently support up to 30 valued offensive players per team.')
    if not players:
        raise RuntimeError('Not enough player valuation data is available for these teams.')
    # Missing values still occupy roster space; they are never treated as free cuts.
    missing = sum(p.get('position') in POSITIONS for p in active.values()) - len(players)
    return {
        'roster_id': roster['roster_id'], 'team_name': roster.get('team_name', 'A team'),
        'players': players, 'active_ids': set(active), 'occupied': len(active),
        'capacity': capacity, 'missing': missing, 'lineup': analyze_roster(players, slots),
    }


def required_drops(team, give_count, receive_count):
    """Use existing openings before requiring any cuts."""
    return max(0, team['occupied'] - give_count + receive_count - team['capacity'])


def preserves_coverage(before, after):
    """A value gain must not leave a previously filled starting slot empty."""
    old = Counter(s['slot'] for s in before['starters'] if s['player'])
    new = Counter(s['slot'] for s in after['starters'] if s['player'])
    return all(new[slot] >= count for slot, count in old.items())


def simulate_exchange(team, give, receive, slots):
    """Make room with the weakest remaining bench players, protecting starters."""
    players = [p for p in team['players'] if p['player_id'] not in give.ids] + list(receive.players)
    lineup = analyze_roster(players, slots)
    if not preserves_coverage(team['lineup'], lineup):
        return None
    needed = required_drops(team, len(give.players), len(receive.players))
    # Incoming players stay in the proposed trade. Only existing, valued reserves
    # on the active roster can be suggested as cuts; K, DEF, IR, and taxi stay out.
    expendable = sorted((p for p in lineup['depth'] if p['player_id'] not in receive.ids),
                        key=lambda p: (p['value'], p['player_id']))
    if len(expendable) < needed:
        return None
    drops = expendable[:needed]
    # Every cut comes from this optimal lineup's bench, so the same starting
    # assignment remains available and its value cannot change after these cuts.
    dropped_ids = {p['player_id'] for p in drops}
    lineup = {**lineup, 'depth': [p for p in lineup['depth'] if p['player_id'] not in dropped_ids]}
    return {
        'lineup': lineup, 'required_drops': needed, 'suggested_drops': drops,
        'drop_value': sum(p['value'] for p in drops),
        'open_slots_before': max(0, team['capacity'] - team['occupied']),
        'roster_size_after': team['occupied'] - len(give.players) + len(receive.players) - needed,
        'roster_capacity': team['capacity'],
    }


def qualifying_target(before, after, receive, targets, give_count):
    """Require usable starters, with the agreed smaller threshold for depth trades."""
    incoming = [s['player'] for s in after['starters']
                if s['player'] and s['player']['player_id'] in receive.ids]
    adding_depth = len(receive.players) > give_count
    required = len(receive.players) - 1 if adding_depth else 1
    if len(incoming) < required:
        return None
    for position in targets:
        if not any(p['position'] == position for p in incoming):
            continue
        if adding_depth:
            return position
        old = sorted((s['player']['value'] for s in before['starters']
                      if s['player'] and s['player']['position'] == position), reverse=True)
        new = sorted((s['player'] for s in after['starters']
                      if s['player'] and s['player']['position'] == position),
                     key=lambda p: -p['value'])
        # Match positional starter ranks so a stronger RB2 counts as an upgrade,
        # even if a different part of the lineup loses value in the exchange.
        if any(p['player_id'] in receive.ids and p['value'] > (old[i] if i < len(old) else 0)
               for i, p in enumerate(new)):
            return position
    return None


def shortlist_packages(yours, theirs, preferences, targets, pair_budget, lineup_budget):
    """Join value intervals and retain small, separate shortlists for each format."""
    formats = preferences.formats
    give_packages = team_packages(yours, [g for g, _ in formats])
    receive_packages = team_packages(theirs, [r for _, r in formats])
    lists, considered, limited = [], 0, False
    spare = {p['player_id'] for p in yours['lineup']['depth']}
    partner_spare = {p['player_id'] for p in theirs['lineup']['depth']}
    for format_index, (give_count, receive_count) in enumerate(formats):
        # Split both budgets across formats so a large 3-for-3 pool cannot use
        # all the work before smaller trades get considered.
        pair_limit = pair_budget // len(formats) + (format_index < pair_budget % len(formats))
        keep = lineup_budget // len(formats) + (format_index < lineup_budget % len(formats))
        receives = [p for p in receive_packages[receive_count] if p.positions.intersection(targets)]
        totals = [p.total for p in receives]
        intervals, ends, possible = [], [], 0
        cuts = required_drops(yours, give_count, receive_count)
        for give in give_packages[give_count]:
            # Cuts can reduce a gross gain into the requested range. Use a safe
            # upper bound here and check the actual cuts after rebuilding lineups.
            remaining = sorted((p['value'] for p in yours['players'] if p['player_id'] not in give.ids), reverse=True)
            drop_bound = sum(remaining[:cuts])
            low = give.total * 100 / (100 - preferences.min_gain_percent)
            high = (give.total + drop_bound) * 100 / (100 - preferences.max_gain_percent)
            start = bisect_left(totals, low - 1e-7)
            stop = bisect_right(totals, high + 1e-7)
            if stop > start:
                intervals.append((give, start))
                possible += stop - start
                ends.append(possible)
        if possible > pair_limit or min(possible, pair_limit) > keep:
            limited = True
        count = min(possible, pair_limit)
        if not count or not keep:
            continue
        heap = []
        for index in range(count):
            # Evenly sample the joined intervals when the pair budget is reached.
            # This visits the full value range without materializing its cross product.
            offset = index * possible // count
            interval = bisect_right(ends, offset)
            give, start = intervals[interval]
            previous = ends[interval - 1] if interval else 0
            receive = receives[start + offset - previous]
            considered += 1
            target_rank = next(i for i, pos in enumerate(targets) if pos in receive.positions)
            incoming_value = max(p['value'] for p in receive.players if p['position'] == targets[target_rank])
            rank = (-target_rank, len(give.ids & spare) + len(receive.ids & partner_spare), incoming_value)
            entry = (rank, -index, give, receive)
            if len(heap) < keep:
                heappush(heap, entry)
            elif entry[:2] > heap[0][:2]:
                heapreplace(heap, entry)
        lists.append(sorted(heap, key=lambda item: item[:2], reverse=True))
    return [(entry[2], entry[3]) for group in lists for entry in group], considered, limited


def search_packages(yours, theirs, slots, preferences, targets, pair_budget, lineup_budget):
    """Return the best qualifying exchange within explicit CPU and memory limits."""
    candidates, considered, limited = shortlist_packages(
        yours, theirs, preferences, targets, pair_budget, lineup_budget,
    )
    best = None
    for give, receive in candidates:
        your_after = simulate_exchange(yours, give, receive, slots)
        if your_after is None or not preferences.accepts_value(give.total, receive.total, your_after['drop_value']):
            continue
        target = qualifying_target(yours['lineup'], your_after['lineup'], receive, targets, len(give.players))
        if target is None:
            continue
        partner_after = simulate_exchange(theirs, receive, give, slots)
        if partner_after is None:
            continue
        gains = [your_after['lineup']['value'] - yours['lineup']['value'],
                 partner_after['lineup']['value'] - theirs['lineup']['value']]
        if len(receive.players) <= len(give.players) and gains[0] < 0:
            continue
        # Opponent losses are permitted. Their benefit remains a ranking factor,
        # while the selected team's target and lineup impact take priority.
        rank = (-targets.index(target), gains[0] / max(1, yours['lineup']['value']),
                gains[1] / max(1, theirs['lineup']['value']),
                -your_after['drop_value'], -len(give.players) - len(receive.players))
        if best is None or rank > best['rank']:
            best = {'rank': rank, 'give': give, 'receive': receive, 'target': target,
                    'gains': gains, 'your_after': your_after, 'partner_after': partner_after}
    return best, {'candidates_considered': considered, 'candidates_checked': len(candidates),
                  'search_limited': limited}
