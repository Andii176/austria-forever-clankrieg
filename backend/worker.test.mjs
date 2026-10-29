import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MembershipStore,overlay,validate,analytics} from './worker.mjs';
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
test('analytics counts daily visitors, ignores rapid reloads and persists across instances',async()=>{
 const ctx=context();
 const request=(ip='192.0.2.1')=>new Request('https://internal/analytics',{method:'POST',headers:{'CF-Connecting-IP':ip,'User-Agent':'Browser'}});
 const count=async(time,ip)=>await (await analytics(ctx,request(ip),new Date(time))).json();
 let data=await count('2026-10-29T12:00:00Z');
 assert.deepEqual(data.today,{date:'2026-10-29',views:1,visitors:1});
 data=await count('2026-10-29T12:00:02Z');assert.equal(data.today.views,1);
 data=await count('2026-10-29T12:01:00Z');assert.equal(data.today.views,2);assert.equal(data.today.visitors,1);
 data=await count('2026-10-29T12:02:00Z','192.0.2.2');assert.equal(data.today.visitors,2);
 data=await count('2026-10-30T12:00:00Z');assert.equal(data.today.visitors,1);assert.equal(data.views7,4);
 const restored=new MembershipStore(ctx,{});
 const read=await(await restored.fetch(new Request('https://internal/analytics'))).json();assert.ok(read.startedAt);
 const stored=JSON.stringify([...(await ctx.storage.list({prefix:''}))]);
 assert.ok(!stored.includes('192.0.2.'));assert.ok(!stored.includes('Browser'));
 await analytics(ctx,new Request('https://internal/analytics'),new Date('2027-02-01T12:00:00Z'));
 assert.equal((await ctx.storage.list({prefix:'visitor:'})).size,0);
 assert.equal((await ctx.storage.list({prefix:'analytics-day:'})).size,0);
});
test('analytics rejects foreign writes and respects DNT and GPC',async()=>{
 const forwarded=[];
 const env={ALLOWED_ORIGIN:'https://andii176.github.io',MEMBERSHIPS:{idFromName:n=>n,get:()=>({fetch:async r=>{forwarded.push(r);return new Response('{}');}})}};
 const send=headers=>worker.fetch(new Request('https://worker/api/analytics',{method:'POST',headers}),env);
 assert.equal((await send({Origin:'https://other.example'})).status,403);assert.equal(forwarded.length,0);
 for(const option of [{DNT:'1'},{'Sec-GPC':'1'},{}])await send({Origin:env.ALLOWED_ORIGIN,'CF-Connecting-IP':'192.0.2.1','User-Agent':'Browser',...option});
 assert.deepEqual(forwarded.map(r=>r.method),['GET','GET','POST']);
});
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
test('automatic detection is visible and later manual correction replaces its source',()=>{
 const automatic=overlay(snapshot,[{tag:'#LPGPRPRL8',kind:'date',date:'2026-09-21',version:1,source:'observed',detectedAt:'2026-09-21T09:37:00+02:00'}]);
 assert.equal(person(automatic,'LPGPRPRL8').joinSource,'observed');
 assert.equal(automatic.membershipRecords.find(r=>r.tag==='#LPGPRPRL8').joinDetectedAt,'2026-09-21T09:37:00+02:00');
 const manual=overlay(snapshot,[{tag:'#LPGPRPRL8',kind:'date',date:'2026-09-14',version:2,source:'manual',detectedAt:null}]);
 assert.equal(person(manual,'LPGPRPRL8').joinSource,'manual');
});

