import copy
import json
import unittest
from refresh import ROOT, calculate
from membership import apply_request


class MembershipTests(unittest.TestCase):
    def setUp(self):
        from datetime import date, timedelta
        weeks = [f's_test-{i}' for i in range(10)]
        dates = {w: (date(2026,9,28)-timedelta(days=7*i)).isoformat() for i,w in enumerate(weeks)}
        self.state = {'last_week': weeks[0], 'week_end_dates': dates, 'members': {}}
        players = []
        for tag, start in [('LPGPRPRL8', 1), ('Q0LGPRQCY', 9), ('P0JGUCR8P', 9)]:
            self.state['members'][tag] = {'new': False, 'since': weeks[start], 'first_seen': weeks[0], 'estimated': True}
            history = [{'week': w, 'decks': 16 if i<=start else 0, 'points': 2500 if i<=start else 0, 'weight': 1} for i,w in enumerate(weeks)]
            players.append({'tag': '#'+tag, 'name': tag, 'history': history})
        self.data = {'weeks': weeks, 'players': players, 'asOf': '28.09.2026', 'source': 'Test', 'trend': [], 'currentActive': 3}

    def update(self, tag, kind, entered=None):
        return apply_request({'tag': tag, 'kind': kind, 'date': entered}, self.state, self.data)

    def test_date_overwrites_and_counts_zero_weeks(self):
        result, state = self.update('LPGPRPRL8', 'date', '2026-09-07')
        p = next(p for p in result['players'] if p['tag'] == '#LPGPRPRL8')
        self.assertEqual(p['ratedWeeks'], 3)
        self.assertAlmostEqual(p['participation'], 66.7)
        self.assertFalse(p['joinEstimated'])
        self.assertEqual(result['trend'], self.data['trend'])
        self.state, self.data = state, result
        result, _ = self.update('LPGPRPRL8', 'date', '2026-09-21')
        self.assertEqual(next(p for p in result['players'] if p['tag'] == '#LPGPRPRL8')['ratedWeeks'], 1)

    def test_longstanding_and_return_to_estimate(self):
        result, state = self.update('LPGPRPRL8', 'longstanding')
        self.assertEqual(next(p for p in result['players'] if p['tag'] == '#LPGPRPRL8')['ratedWeeks'], 10)
        self.state, self.data = state, result
        result, _ = self.update('LPGPRPRL8', 'unknown')
        self.assertEqual(next(p for p in result['players'] if p['tag'] == '#LPGPRPRL8')['ratedWeeks'], 2)

    def test_known_returning_members_keep_all_weeks(self):
        for tag in ('Q0LGPRQCY', 'P0JGUCR8P'):
            result, _ = self.update(tag, 'date', '2026-09-27')
            p = next(p for p in result['players'] if p['tag'] == '#'+tag)
            self.assertEqual(p['ratedWeeks'], 10)
            self.assertTrue(p['membershipNote'])

    def test_pending_member_is_persisted(self):
        result, state = self.update('PYLQGRJ', 'date', '2026-09-28')
        self.assertIn('PYLQGRJ', state['members'])
        # Newly joined on completion Monday: the just-ended war is excluded.
        result, _ = self.update('LPGPRPRL8', 'date', '2026-09-28')
        self.assertEqual(next(p for p in result['players'] if p['tag'] == '#LPGPRPRL8')['ratedWeeks'], 0)

    def test_invalid_input_rejected(self):
        for payload in ({'tag': '../bad', 'kind': 'date', 'date': '2026-09-21'},
                        {'tag': 'PYLQGRJ', 'kind': 'date', 'date': '2026-02-31'},
                        {'tag': 'PYLQGRJ', 'kind': 'other', 'date': None}):
            with self.assertRaises(ValueError):
                apply_request(payload, self.state, self.data)


if __name__ == '__main__':
    unittest.main()
