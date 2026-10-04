import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MembershipStore,overlay,validate} from './worker.mjs';
const snapshot=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url)));
const person=(data,tag)=>data.players.find(p=>p.tag==='#'+tag);
test('anonymous date edits include later zero weeks and retain clan totals',()=>{
 const result=overlay(snapshot,[{tag:'#LPGPRPRL8',kind:'date',date:'2026-09-07',version:1}]);
 assert.equal(person(result,'LPGPRPRL8').ratedWeeks,3);
 assert.equal(person(result,'LPGPRPRL8').participation,66.7);
 assert.deepEqual(result.trend,snapshot.trend);
});
test('overwriting a date changes the rating, and estimates can be restored',()=>{
 assert.equal(person(overlay(snapshot,[{tag:'#LPGPRPRL8',kind:'date',date:'2026-09-21',version:2}]),'LPGPRPRL8').ratedWeeks,1);
 assert.equal(person(overlay(snapshot,[{tag:'#LPGPRPRL8',kind:'unknown',date:null,version:3}]),'LPGPRPRL8').ratedWeeks,2);
});
test('two known returning members retain all rated weeks',()=>{
 for(const tag of ['Q0LGPRQCY','P0JGUCR8P'])assert.equal(person(overlay(snapshot,[{tag:'#'+tag,kind:'date',date:'2026-09-27',version:1}]),tag).ratedWeeks,10);
});
test('invalid dates, tags, and future dates rejected',()=>{
 for(const payload of [{tag:'../../../bad',kind:'date',date:'2026-09-21',version:0},{tag:'PYLQGRJ',kind:'date',date:'2026-02-31',version:0},{tag:'PYLQGRJ',kind:'date',date:'2099-01-01',version:0}])assert.throws(()=>validate(payload));
});
function context(){
 const map=new Map();let queue=Promise.resolve();
 const storage={get:async k=>structuredClone(map.get(k)),put:async items=>{for(const [k,v]of Object.entries(items))map.set(k,structuredClone(v));},list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),setAlarm:async()=>{},delete:async k=>map.delete(k)};
 storage.transaction=fn=>{const promise=queue.then(()=>fn(storage));queue=promise.catch(()=>{});return promise;};
 return {storage};
}
test('no login required; saves are persistent and conflicting edits are rejected',async()=>{
 const ctx=context(),store=new MembershipStore(ctx,{});
 const put=(version,date)=>store.fetch(new Request('https://internal/api/memberships',{method:'PUT',body:JSON.stringify({tag:'LPGPRPRL8',kind:'date',date,version}),headers:{'CF-Connecting-IP':'127.0.0.1'}}));
 assert.equal((await put(0,'2026-09-07')).status,200);
 const responses=await Promise.all([put(1,'2026-09-21'),put(1,'2026-09-14')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const restored=new MembershipStore(ctx,{}),records=await (await restored.fetch(new Request('https://internal/api/memberships'))).json();
 assert.equal(records[0].version,2);assert.equal(records[0].changes.length,2);
});
test('cross origin writes are blocked and allowed origin preflight works',async()=>{
 const env={ALLOWED_ORIGIN:'https://andii176.github.io',MEMBERSHIPS:{idFromName:()=>'',get:()=>({})}};
 assert.equal((await worker.fetch(new Request('https://worker/api/memberships',{method:'PUT',headers:{Origin:'https://bad.example'}}),env)).status,403);
 const response=await worker.fetch(new Request('https://worker/api/memberships',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGIN}}),env);
 assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
});
