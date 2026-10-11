"""Completed-war award snapshots, independent of daily roster and live-war updates."""
import math

WEIGHTS = [1, 1, 1, .9, .8, .7, .6, .5, .4, .3]


def award_player(player, record, end_dates):
    history = player['history']
    count = player['ratedWeeks']
    kind = record.get('joinKind', player.get('joinKind', 'unknown'))
    special = bool(player.get('membershipNote') or record.get('membershipNote'))
    if kind == 'longstanding':
        count = len(history)
    elif kind == 'date' and not special:
        count = sum(record.get('joinDate', player.get('joinDate')) < end_dates[h['week']] for h in history)
    elif kind == 'unknown' and record.get('version', 0) > 0 and not special:
        count = max((i + 1 for i, h in enumerate(history) if h['points'] or h['decks']), default=0)
    rated = history[:count]
    denom = sum(WEIGHTS[i] for i, _ in enumerate(rated))
    points = sum(h['points'] * WEIGHTS[i] for i, h in enumerate(rated))
    decks = sum(h['decks'] * WEIGHTS[i] for i, h in enumerate(rated))
    return {'tag': player['tag'], 'name': player.get('name', player['tag']),
            'role': player.get('role'), 'ratedWeeks': count,
            'points': math.floor(points / denom + .5) if denom else None,
            'participation': math.floor(1000 * decks / (16 * denom) + .5) / 10 if denom else None,
            'pointsPerGame': points / decks if decks else None}


def freeze_awards(snapshot, records, previous=None):
    by_tag = {r['tag']: r for r in records}
    players = [award_player(p, by_tag.get(p['tag'], {}), snapshot['weekEndDates']) for p in snapshot['players']]
    week = snapshot['weeks'][0]
    prior = None
    if previous and previous['week'] == snapshot['weeks'][1]:
        prior = {'week': previous['week'], 'players': previous['players']}
    elif snapshot.get('previousWar', {}).get('weeks', [None])[0] == snapshot['weeks'][1]:
        old = snapshot['previousWar']
        current = {p['tag']: p for p in snapshot['players']}
        effective = {p['tag']: p for p in players}
        prior_players = []
        for old_player in old['players']:
            p = current.get(old_player['tag'])
            record = by_tag.get(old_player['tag'], {})
            candidate = dict(old_player, name=p['name'] if p else record.get('name', old_player['tag']),
                             role=p.get('role') if p else None,
                             membershipNote=p.get('membershipNote', '') if p else record.get('membershipNote', ''))
            if p:
                count = max(0, effective[p['tag']]['ratedWeeks'] - 1)
                if effective[p['tag']]['ratedWeeks'] == 10 and old_player['ratedWeeks'] >= 10:
                    count = 10
                candidate['ratedWeeks'] = count
            prior_players.append(award_player(candidate, record, old['weekEndDates']))
        prior = {'week': old['weeks'][0], 'players': prior_players}
    return {'week': week, 'players': players, 'previous': prior}
