import copy
import unittest
from awards import award_player, freeze_awards
from roster_sync import current_snapshot

class AwardTests(unittest.TestCase):
    def setUp(self):
        self.player={'tag':'#TEST','name':'Test','role':'member','ratedWeeks':2,
                     'history':[{'week':'new','points':2000,'decks':10},{'week':'old','points':1000,'decks':5}]}
        self.dates={'new':'2026-10-12','old':'2026-10-05'}

    def test_exact_join_excludes_preentry_week(self):
        p=award_player(self.player,{'joinKind':'date','joinDate':'2026-10-05'},self.dates)
        self.assertEqual(p['ratedWeeks'],1)
        self.assertEqual(p['points'],2000)
        self.assertEqual(p['pointsPerGame'],200)

    def test_missing_games_do_not_create_efficiency(self):
        p=copy.deepcopy(self.player)
        for h in p['history']: h.update(points=0,decks=0)
        result=award_player(p,{},self.dates)
        self.assertIsNone(result['pointsPerGame'])
        self.assertEqual(result['participation'],0)

    def test_previous_week_preserves_frozen_values(self):
        snapshot={'weeks':['new','old'],'weekEndDates':self.dates,'players':[self.player]}
        prior={'week':'old','players':[{'tag':'#TEST','points':321,'ratedWeeks':1}]}
        result=freeze_awards(snapshot,[],prior)
        self.assertEqual(result['previous']['players'],prior['players'])
        self.assertEqual(result['players'][0]['points'],1500)

    def test_manual_correction_is_used_for_first_award_snapshot(self):
        snapshot={'weeks':['new','old'],'weekEndDates':self.dates,'players':[self.player]}
        result=freeze_awards(snapshot,[{'tag':'#TEST','joinKind':'date','joinDate':'2026-10-05'}])
        self.assertEqual(result['players'][0]['points'],2000)

    def test_daily_roster_update_preserves_awards(self):
        import json
        from refresh import ROOT
        old=json.loads((ROOT/'backend/fixture.json').read_text())
        old['awards']={'week':old['weeks'][0],'players':[{'tag':'#TEST','points':123}]}
        tag=old['players'][0]['tag']
        state={'last_week':old['weeks'][0],'week_end_dates':old['weekEndDates'],
               'members':{p['tag'].lstrip('#'):{'new':False,'since':p['ratingStart'],
               'first_seen':old['weeks'][0],'estimated':True} for p in old['players']}}
        result,_=current_snapshot(old,state,{},[],[{'tag':tag,'name':'Umbenannt','role':'elder'}],'2026-10-11T19:37:00+02:00')
        self.assertEqual(result['awards'],old['awards'])

if __name__=='__main__':
    unittest.main()
