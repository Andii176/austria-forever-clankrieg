#!/usr/bin/env python3
"""Apply a validated membership request, then recalculate the saved snapshot."""
import json
import os
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo
from urllib.request import Request, urlopen
from refresh import ROOT, STATE, DATA, calculate


def apply_request(payload, state, old):
    if set(payload) != {'tag', 'kind', 'date'}:
        raise ValueError('Ungültige Felder')
    tag = str(payload['tag']).upper().lstrip('#')
    if not re.fullmatch(r'[0289PYLQGRJCUV]{3,15}', tag):
        raise ValueError('Ungültiger Spielertag')
    kind = payload['kind']
    if kind not in ('date', 'longstanding', 'unknown'):
        raise ValueError('Ungültiger Eintrittstyp')
    entered = payload['date']
    if kind == 'date':
        if not isinstance(entered, str) or date.fromisoformat(entered).isoformat() != entered:
            raise ValueError('Datum muss JJJJ-MM-TT sein')
        if not date(2016, 1, 1) <= date.fromisoformat(entered) <= datetime.now(ZoneInfo('Europe/Vienna')).date():
            raise ValueError('Datum liegt außerhalb des erlaubten Bereichs')
    elif entered is not None:
        raise ValueError('Für diesen Typ ist kein Datum erlaubt')
    member = state['members'].setdefault(tag, {'new': True, 'since': None,
        'first_seen': state['last_week'], 'estimated': True})
    member['join_kind'] = kind
    member['join_date'] = entered
    member['estimated'] = kind == 'unknown'
    if kind == 'unknown':
        player = next((p for p in old['players'] if p['tag'] == '#'+tag), None)
        member['since'] = next((h['week'] for h in reversed(player['history'])
                                if h['decks'] or h['points']), None) if player else None
    rows = []
    for p in old['players']:
        row = {'player_tag': p['tag'].lstrip('#'), 'player_name': p['name']}
        for h in p['history']:
            row[h['week']+'_contribution'] = str(h['points'])
            row[h['week']+'_decks_used'] = str(h['decks'])
        rows.append(row)
    result, next_state = calculate(rows, rows, old['weeks'], state)
    for key in ('asOf', 'source', 'trend', 'currentActive'):
        result[key] = old[key]
    return result, next_state


def github(path, method='GET', payload=None):
    request = Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+path,
        headers={'Authorization': 'Bearer '+os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json', 'User-Agent': 'clan-membership'},
        data=json.dumps(payload).encode() if payload is not None else None, method=method)
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    event = json.loads(open(os.environ['GITHUB_EVENT_PATH']).read())
    issue = event['issue']
    # Recheck the current issue so a later edit cannot change the reviewed author or data.
    issue = github('/issues/'+str(int(issue['number'])))
    if issue.get('pull_request') or issue['author_association'] not in ('OWNER', 'COLLABORATOR'):
        raise ValueError('Nur Repository-Verantwortliche dürfen Eintrittsdaten speichern')
    if not issue['title'].startswith('[Clanbeitritt] '):
        raise ValueError('Kein Clanbeitritt-Eintrag')
    body = issue.get('body') or ''
    match = re.fullmatch(r'CLAN_MEMBERSHIP_V1\n(\{[^\n]{1,500}\})\s*', body)
    if not match:
        raise ValueError('Ungültiger Eintrag; bitte das Formular auf der Clanwebseite verwenden')
    state = json.loads(STATE.read_text()); old = json.loads(DATA.read_text())
    result, next_state = apply_request(json.loads(match[1]), state, old)
    DATA.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    STATE.write_text(json.dumps(next_state, ensure_ascii=False, indent=2)+'\n')
    print('Eintritt gespeichert und Statistik neu berechnet')


if __name__ == '__main__':
    if '--complete' in __import__('sys').argv:
        event = json.loads(open(os.environ['GITHUB_EVENT_PATH']).read())
        number = str(int(event['issue']['number']))
        github('/issues/'+number+'/comments', 'POST', {'body': 'Eintrittsdaten gespeichert. Die aktualisierte Clanwebseite wurde veröffentlicht.'})
        github('/issues/'+number, 'PATCH', {'state': 'closed'})
    else:
        main()
