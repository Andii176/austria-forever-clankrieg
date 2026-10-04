import unittest
from live_war import snapshot
from refresh import CLAN

class LiveTests(unittest.TestCase):
    def inputs(self):
        clan={'tag':'#'+CLAN,'participants':[{'tag':'#AAA','name':'Current','fame':100,'repairPoints':5,'decksUsed':2},{'tag':'#BBB','name':'Former','fame':200,'decksUsed':3}]}
        return {'sectionIndex':3,'periodType':'colosseum','clan':clan}, {'items':[{'createdDate':'20260928T100000.000Z','seasonId':136,'sectionIndex':2,'standings':[{'clan':clan}]}]}, {'items':[{'tag':'#AAA'}]}
    def test_live_fourth_week_and_former_participants(self):
        result=snapshot(*self.inputs(),'2026-10-05T00:00:00+02:00')
        self.assertEqual(result['week'],'s_136-4');self.assertEqual(result['points'],305);self.assertEqual(result['decks'],5)
        self.assertFalse(result['players'][0]['currentMember']);self.assertEqual(result['status'],'Zwischenstand')
    def test_monday_rollover_shows_completed_cw(self):
        race,log,roster=self.inputs();race.update(sectionIndex=0,periodType='training');log['items'][0]['sectionIndex']=3
        result=snapshot(race,log,roster,'2026-10-05T12:15:00+02:00')
        self.assertEqual(result['week'],'s_136-4');self.assertEqual(result['status'],'Abgeschlossen')
    def test_first_week_of_new_season(self):
        race,log,roster=self.inputs();race.update(sectionIndex=0,periodType='warDay');log['items'][0]['sectionIndex']=3
        self.assertEqual(snapshot(race,log,roster,'2026-10-08T12:15:00+02:00')['week'],'s_137-1')

if __name__=='__main__':unittest.main()
