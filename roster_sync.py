#!/usr/bin/env python3
"""Poll the current roster hourly; record only newly observed members."""
import json
import os
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from refresh import ROOT, DATA, STATE, CLAN, WEIGHTS, fetch_json, parse, calculate

TRACKER = ROOT/'roster-state.json'
SERVICE = 'https://austria-forever-memberships.andreas-99f.workers.dev'
ORIGIN = 'https://andii176.github.io'


def service(path, payload=None):
    request = Request(SERVICE+path, data=json.dumps(payload).encode() if payload is not None else None,
        method='PUT' if payload is not None else 'GET',
        headers={'Origin': ORIGIN, 'Content-Type': 'application/json', 'User-Agent': 'Austria-forever-roster/1.0'})
    with urlopen(request, timeout=35) as response:
        return json.load(response)


def plan_roster(tracker, roster, records, observed_at):
    """Initial roster is a baseline; returning members keep their original entry."""
    tracker = json.loads(json.dumps(tracker))
    seen = tracker.setdefault('seen', {})
    initial = not tracker.get('initialized', False)
    by_tag = {r['tag'].lstrip('#'): r for r in records}
    additions = []
    for member in roster:
        tag = member['tag'].lstrip('#')
        if tag not in seen:
            seen[tag] = {'name': member['name'], 'firstDetected': None if initial else observed_at,
                         'baseline': initial}
            record = by_tag.get(tag, {})
            if not initial and record.get('version', 0) == 0 and record.get('joinKind', 'unknown') == 'unknown':
                additions.append({'tag': tag, 'kind': 'date', 'date': observed_at[:10], 'version': 0,
                                  'source': 'observed', 'detectedAt': observed_at})
        seen[tag]['name'] = member['name']
        seen[tag]['lastDetected'] = observed_at
    tracker.update(initialized=True, checkedAt=observed_at,
                   currentTags=sorted(m['tag'].lstrip('#') for m in roster))
    return tracker, additions


def current_snapshot(old, state, tracker, api_rows, roster, observed_at):
    archive = tracker.setdefault('history', {})
    for p in old['players']:
        archive[p['tag'].lstrip('#')] = {h['week']: {'points': h['points'], 'decks': h['decks']} for h in p['history']}
    api_by_tag = {r['player_tag']: r for r in api_rows}
    rows = []
    for member in roster:
        tag = member['tag'].lstrip('#')
        row = {'player_tag': tag, 'player_name': member['name']}
        api_row = api_by_tag.get(tag, {})
        history = archive.setdefault(tag, {})
        for w in old['weeks']:
            if w+'_contribution' in api_row:
                history[w] = {'points': int(api_row[w+'_contribution']), 'decks': int(api_row[w+'_decks_used'])}
            h = history.get(w, {'points': 0, 'decks': 0})
            row[w+'_contribution'] = str(h['points'])
            row[w+'_decks_used'] = str(h['decks'])
        archive[tag] = {w: history[w] for w in old['weeks'] if w in history}
        rows.append(row)
    result, next_state = calculate(rows, rows, old['weeks'], state)
    # Retain all tracked starts across absences, including members without a manual record.
    for tag, member in state['members'].items():
        next_state['members'].setdefault(tag, member)
    for key in ('asOf', 'source', 'trend'):
        result[key] = old[key]
    result['rosterAsOf'] = observed_at
    result['currentActive'] = sum(p['lastDecks'] > 0 for p in result['players'])
    return result, next_state


def main():
    token = os.environ.get('CLASH_ROYALE_API_TOKEN')
    if not token:
        raise ValueError('CLASH_ROYALE_API_TOKEN fehlt')
    old = json.loads(DATA.read_text())
    state = json.loads(STATE.read_text())
    tracker = json.loads(TRACKER.read_text()) if TRACKER.exists() else {}
    clan_path = '/clans/'+quote('#'+CLAN, safe='')
    roster_payload = fetch_json(clan_path+'/members?limit=50', token)
    roster = roster_payload.get('items', [])
    if not 1 <= len(roster) <= 50 or len({m['tag'] for m in roster}) != len(roster):
        raise ValueError('Kein gültiger Mitgliederstand; bisherige Seite bleibt erhalten')
    log = fetch_json(clan_path+'/riverracelog?limit=10', token)
    api_rows, _, _ = parse(log, roster_payload)
    observed_at = datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds')
    records = service('/api/data')['membershipRecords']
    next_tracker, additions = plan_roster(tracker, roster, records, observed_at)
    for payload in additions:
        try:
            service('/api/memberships', payload)
        except HTTPError as error:
            if error.code != 409:
                raise
            # A concurrent manual edit takes priority. Never overwrite it automatically.
            print('Eintritt wurde zwischenzeitlich bearbeitet; manuelle Angabe bleibt erhalten')
    result, next_state = current_snapshot(old, state, next_tracker, api_rows, roster, observed_at)
    try:
        race = fetch_json(clan_path+'/currentriverrace', token)
        clan = race.get('clan', {})
        participants = clan.get('participants', [])
        print('Laufender CW: '+json.dumps({'fields': list(race), 'seasonId': race.get('seasonId'),
              'sectionIndex': race.get('sectionIndex'), 'periodIndex': race.get('periodIndex'),
              'periodType': race.get('periodType'), 'participants': len(participants),
              'points': sum(p.get('fame', 0)+p.get('repairPoints', 0) for p in participants),
              'decks': sum(p.get('decksUsed', 0) for p in participants)}, ensure_ascii=False))
    except (HTTPError, ValueError, OSError) as error:
        print('Laufender CW derzeit nicht abrufbar: '+type(error).__name__)
    for path, value in ((DATA, result), (STATE, next_state), (TRACKER, next_tracker)):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2 if path != DATA else None)+'\n')
    print(f'Mitglieder geprüft: {len(roster)}; neue Eintrittsangaben: {len(additions)}; {observed_at}')


if __name__ == '__main__':
    main()
