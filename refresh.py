#!/usr/bin/env python3
"""Refresh the static clan dashboard from the official Clash Royale API.

Usage: CLASH_ROYALE_API_TOKEN=... python3 refresh.py
The token belongs in a GitHub Actions repository secret, not in the repository.
"""
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'dist' / 'data.json'
STATE = ROOT / 'member-state.json'
CLAN = 'QY2CRJUQ'
WEIGHTS = [1, 1, 1, .9, .8, .7, .6, .5, .4, .3]
API = 'https://proxy.royaleapi.dev/v1'


def fetch_json(path, token):
    request = Request(API + path, headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'User-Agent': 'Austria-forever-clan-dashboard/1.0',
    })
    with urlopen(request, timeout=35) as response:
        if response.status != 200:
            raise ValueError(f'API request returned HTTP {response.status}')
        payload = response.read(2_000_001)
    if len(payload) > 2_000_000:
        raise ValueError('API response exceeds the expected 2 MB limit')
    return json.loads(payload)


def parse(log, roster):
    entries = log.get('items', [])
    members = roster.get('items', [])
    if len(entries) < 10 or not 1 <= len(members) <= 50:
        raise ValueError('API did not return ten completed races and a valid roster')
    entries = sorted(entries, key=lambda e: e['createdDate'], reverse=True)[:10]
    weeks = [f"s_{e['seasonId']}-{e['sectionIndex'] + 1}" for e in entries]
    if len(set(weeks)) != 10:
        raise ValueError('Duplicate war weeks in API log')
    rows_by_tag = {}
    for week, entry in zip(weeks, entries):
        matching = [s['clan'] for s in entry['standings']
                    if s['clan']['tag'].lstrip('#') == CLAN]
        if len(matching) != 1:
            raise ValueError(f'Clan not uniquely present in {week}')
        for player in matching[0]['participants']:
            tag = player['tag'].lstrip('#')
            row = rows_by_tag.setdefault(tag, {'clan_tag': CLAN, 'player_tag': tag,
                                               'player_name': player['name'],
                                               'player_is_current_member': 'false'})
            row[week+'_contribution'] = str(int(player['fame']) + int(player['repairPoints']))
            row[week+'_decks_used'] = str(int(player['decksUsed']))
    for member in members:
        tag = member['tag'].lstrip('#')
        row = rows_by_tag.setdefault(tag, {'clan_tag': CLAN, 'player_tag': tag,
                                           'player_name': member['name']})
        row['player_name'] = member['name']
        row['player_is_current_member'] = 'true'
    rows = list(rows_by_tag.values())
    if not all(r.get('player_tag') for r in rows):
        raise ValueError('Missing player tag in API result')
    for row in rows:
        for week in weeks:
            row.setdefault(week+'_contribution', '0')
            row.setdefault(week+'_decks_used', '0')
    current = [r for r in rows if r['player_is_current_member'] == 'true']
    return rows, current, weeks


def calculate(rows, current, weeks, state):
    former = state['members']
    members = {}
    players = []
    for row in current:
        tag = row['player_tag'].lstrip('#')
        history = [{'week': w, 'points': int(row[w+'_contribution'] or 0),
                    'decks': int(row[w+'_decks_used'] or 0), 'weight': WEIGHTS[i]}
                   for i, w in enumerate(weeks)]
        if any(h['decks'] < 0 or h['decks'] > 16 or h['points'] < 0 for h in history):
            raise ValueError(f'Implausible weekly values for {tag}')
        if tag in former:
            member = dict(former[tag])
            if member['new'] and member['since'] is None and weeks[0] != member['first_seen']:
                # The first complete CW after joining counts, even if the player used no decks.
                member['since'] = weeks[0]
        else:
            member = {'new': True, 'since': weeks[0] if history[0]['decks'] else None,
                      'first_seen': weeks[0]}
        members[tag] = member
        if not member['new']:
            rated = history
        elif member['since'] is None:
            rated = []
        elif member['since'] in weeks:
            rated = history[:weeks.index(member['since']) + 1]
        else:
            # This stay began before the oldest week still present in the export.
            rated = history
        denominator = sum(h['weight'] for h in rated)
        points = round(sum(h['points']*h['weight'] for h in rated)/denominator) if denominator else None
        participation = round(100*sum(h['decks']*h['weight'] for h in rated)/(16*denominator), 1) if denominator else None
        category = ('Elite' if points >= 2800 else 'Stark' if points >= 2300 else
                    'Solide' if points >= 1800 else 'Schwach' if points >= 1200 else 'Kritisch') if points is not None else 'Noch offen'
        players.append({'name': row['player_name'], 'tag': '#'+tag, 'new': member['new'],
                        'ratedWeeks': len(rated), 'points': points, 'participation': participation,
                        'lastDecks': history[0]['decks'], 'lastPoints': history[0]['points'],
                        'lastThree': sum(h['decks'] for h in history[:3]),
                        'category': category, 'history': history})
    players.sort(key=lambda p: (p['points'] is None, -(p['points'] or 0),
                                -(p['participation'] or 0), p['name'].casefold()))
    for i, p in enumerate(players):
        p['rank'] = i + 1 if p['points'] is not None else None
    trend = [{'week': w, 'weight': WEIGHTS[i],
              'points': sum(int(r[w+'_contribution'] or 0) for r in rows),
              'decks': sum(int(r[w+'_decks_used'] or 0) for r in rows),
              'active': sum(int(r[w+'_decks_used'] or 0) > 0 for r in rows)}
             for i, w in enumerate(weeks)]
    now = datetime.now(ZoneInfo('Europe/Vienna')).strftime('%d.%m.%Y')
    data = {'clan': 'Austria forever', 'clanTag': '#'+CLAN, 'asOf': now,
            'source': f'Clash Royale API vom {now}', 'weeks': weeks, 'players': players,
            'trend': trend, 'currentActive': sum(p['lastDecks'] > 0 for p in players)}
    return data, {'last_week': weeks[0], 'members': members}


def main():
    token = os.environ.get('CLASH_ROYALE_API_TOKEN', '')
    if not token:
        raise ValueError('CLASH_ROYALE_API_TOKEN is missing')
    state = json.loads(STATE.read_text(encoding='utf-8'))
    old = json.loads(DATA.read_text(encoding='utf-8'))
    clan_path = '/clans/' + quote('#'+CLAN, safe='')
    if '--verify' in sys.argv:
        rows, current, weeks = parse(
            fetch_json(clan_path + '/riverracelog?limit=10', token),
            fetch_json(clan_path + '/members?limit=50', token),
        )
        previous_weeks = {t['week']: t for t in old['trend']}
        shared = [w for w in weeks if w in previous_weeks]
        if len(shared) < 8:
            raise ValueError('Too few shared weeks to compare API and CSV')
        for week in shared:
            previous = previous_weeks[week]
            points = sum(int(r[week+'_contribution']) for r in rows)
            decks = sum(int(r[week+'_decks_used']) for r in rows)
            if (points, decks) != (previous['points'], previous['decks']):
                raise ValueError(f'{week}: API {points} points/{decks} decks; CSV '
                                 f"{previous['points']} points/{previous['decks']} decks")
        print(f'API matches CSV totals for {len(shared)} shared weeks; '
              f'{len(current)} current members')
        return
    for attempt in range(3):
        rows, current, weeks = parse(
            fetch_json(clan_path + '/riverracelog?limit=10', token),
            fetch_json(clan_path + '/members?limit=50', token),
        )
        if weeks[0] != state['last_week']:
            break
        if attempt < 2:
            print('Source still shows the previous CW; retrying in 10 minutes', flush=True)
            time.sleep(600)
    else:
        raise ValueError('No new completed CW in API log; existing site preserved')
    if len(weeks) < 2 or weeks[1] != state['last_week']:
        raise ValueError('More than one week changed or columns were reordered; manual review needed')
    data, next_state = calculate(rows, current, weeks, state)
    if data['trend'][1]['points'] != old['trend'][0]['points'] or data['trend'][1]['decks'] != old['trend'][0]['decks']:
        raise ValueError('Previous CW total changed unexpectedly; manual review needed')
    DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    STATE.write_text(json.dumps(next_state, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"Updated {data['asOf']}: {len(current)} members, {data['trend'][0]['points']} points, {data['trend'][0]['decks']} decks")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Update failed: {exc}', file=sys.stderr)
        sys.exit(1)
