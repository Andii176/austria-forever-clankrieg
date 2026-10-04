import copy
import json
import unittest
from roster_sync import plan_roster, current_snapshot
from refresh import ROOT

A={'tag':'#LPGPRPRL8','name':'mourise'}
B={'tag':'#PYLQGRJ','name':'Neu'}


class RosterTests(unittest.TestCase):
    def test_rename_keeps_membership_and_old_names(self):
        old=json.loads((ROOT/'backend/fixture.json').read_text())
        tag=A['tag'].lstrip('#')
        state={'last_week':old['weeks'][0],'week_end_dates':old['weekEndDates'], 'members':{
            tag:{'name':'mourise','new':False,'since':old['weeks'][-1],
                 'first_seen':old['weeks'][-1],'estimated':False,'join_kind':'longstanding'}}}
        tracker={}
        result, state=current_snapshot(old,state,tracker,[],[dict(A,name='Neuer Name')],'2026-10-05T01:37:00+02:00')
        self.assertEqual(result['players'][0]['previousNames'],['mourise'])
        self.assertEqual(result['players'][0]['ratedWeeks'],10)
        self.assertFalse(state['members'][tag]['new'])
        result, state=current_snapshot(result,state,tracker,[],[dict(A,name='Neuer Name')],'2026-10-05T02:37:00+02:00')
        self.assertEqual(result['players'][0]['previousNames'],['mourise'])
        result, state=current_snapshot(result,state,tracker,[],[A],'2026-10-05T03:37:00+02:00')
        self.assertEqual(result['players'][0]['previousNames'],['Neuer Name'])

    def test_initial_members_are_not_assigned_new_join_dates(self):
        tracker, requests=plan_roster({},[A],[],'2026-10-05T00:30:00+02:00')
        self.assertEqual(requests,[])
        self.assertTrue(tracker['seen']['LPGPRPRL8']['baseline'])
        self.assertIsNone(tracker['seen']['LPGPRPRL8']['firstDetected'])

    def test_new_member_gets_vienna_date_and_is_saved_once(self):
        baseline,_=plan_roster({},[A],[],'2026-10-04T23:30:00+02:00')
        tracker,requests=plan_roster(baseline,[A,B],[],'2026-10-05T00:37:00+02:00')
        self.assertEqual(requests[0]['date'],'2026-10-05')
        self.assertEqual(requests[0]['source'],'observed')
        self.assertEqual(requests[0]['detectedAt'],'2026-10-05T00:37:00+02:00')
        _,repeat=plan_roster(tracker,[A,B],[],'2026-10-05T01:37:00+02:00')
        self.assertEqual(repeat,[])

    def test_manual_preentry_takes_priority(self):
        tracker,_=plan_roster({},[A],[],'2026-10-05T00:30:00+02:00')
        for record in ({'tag':B['tag'],'joinKind':'date','version':1},
                       {'tag':B['tag'],'joinKind':'unknown','version':2},
                       {'tag':B['tag'],'joinKind':'longstanding','version':0}):
            _,requests=plan_roster(tracker,[A,B],[record],'2026-10-05T01:37:00+02:00')
            self.assertEqual(requests,[])

    def test_returning_member_keeps_original_detection(self):
        tracker,_=plan_roster({},[A],[],'2026-10-05T00:30:00+02:00')
        tracker,_=plan_roster(tracker,[A,B],[],'2026-10-05T01:37:00+02:00')
        tracker,_=plan_roster(tracker,[A],[],'2026-10-05T02:37:00+02:00')
        tracker,requests=plan_roster(tracker,[A,B],[],'2026-10-06T02:37:00+02:00')
        self.assertEqual(requests,[])
        self.assertEqual(tracker['seen']['PYLQGRJ']['firstDetected'],'2026-10-05T01:37:00+02:00')

    def test_roster_changes_preserve_clan_totals_and_returning_history(self):
        old=json.loads((ROOT/'backend/fixture.json').read_text())
        dates=old['weekEndDates'];members={p['tag'].lstrip('#'):{'new':False,'since':p['ratingStart'],'first_seen':old['weeks'][0],'estimated':True} for p in old['players']}
        state={'last_week':old['weeks'][0],'week_end_dates':dates,'members':members}
        tracker={}
        result,state=current_snapshot(old,state,tracker,[],[A],'2026-10-05T00:37:00+02:00')
        self.assertEqual(result['trend'],old['trend'])
        result,state=current_snapshot(result,state,tracker,[],[A,B],'2026-10-05T01:37:00+02:00')
        self.assertEqual(len(result['players']),2)
        self.assertEqual(next(p for p in result['players'] if p['tag']==B['tag'])['ratedWeeks'],0)
        returning={'tag':'#Q0LGPRQCY','name':'Reinigungslord2'}
        result,_=current_snapshot(result,state,tracker,[],[A,returning],'2026-10-05T02:37:00+02:00')
        before=next(p for p in old['players'] if p['tag']==returning['tag'])
        after=next(p for p in result['players'] if p['tag']==returning['tag'])
        self.assertEqual(after['history'],before['history'])
        self.assertEqual(after['ratedWeeks'],10)


if __name__=='__main__':
    unittest.main()
