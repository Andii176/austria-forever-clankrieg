#!/usr/bin/env python3
"""Refresh a separate current-CW snapshot without changing completed-war rankings."""
import json
import os
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo
from refresh import DATA, CLAN, fetch_json


def snapshot(race, log, roster, checked_at):
    latest=max(log['items'], key=lambda e:e['createdDate'])
    section=int(race['sectionIndex'])
    season=int(latest['seasonId'])+(section<int(latest['sectionIndex']))
    clan=race['clan']
    kind='Zwischenstand'
    # After the Monday rollover, retain the final completed CW rather than showing training.
    if race.get('periodType')=='training':
        clan=next(s['clan'] for s in latest['standings'] if s['clan']['tag'].lstrip('#')==CLAN)
        section=int(latest['sectionIndex']);season=int(latest['seasonId']);kind='Abgeschlossen'
    if clan['tag'].lstrip('#')!=CLAN:
        raise ValueError('Unexpected clan in current race')
    current={m['tag'] for m in roster['items']}
    players=[{'tag':p['tag'],'name':p['name'],'points':int(p.get('fame',0))+int(p.get('repairPoints',0)),
              'decks':int(p.get('decksUsed',0)), 'decksToday':int(p.get('decksUsedToday',0)),
              'currentMember':p['tag'] in current} for p in clan.get('participants',[])]
    if any(p['points']<0 or p['decks']<0 for p in players):
        raise ValueError('Invalid live race values')
    players.sort(key=lambda p:(-p['points'],-p['decks'],p['name']))
    return {'week':f's_{season}-{section+1}','status':kind,'checkedAt':checked_at,
            'points':sum(p['points'] for p in players),'decks':sum(p['decks'] for p in players),
            'players':players}


def main():
    token=os.environ['CLASH_ROYALE_API_TOKEN']
    path='/clans/'+quote('#'+CLAN,safe='')
    race=fetch_json(path+'/currentriverrace',token)
    log=fetch_json(path+'/riverracelog?limit=10',token)
    roster=fetch_json(path+'/members?limit=50',token)
    live=snapshot(race,log,roster,datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds'))
    data=json.loads(DATA.read_text());data['liveWar']=live
    DATA.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f"{live['week']}: {live['status']}, {live['points']} Punkte, {live['decks']} Decks")


if __name__=='__main__':main()
