const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const special=new Set(['#Q0LGPRQCY','#P0JGUCR8P']);
export function validate(input,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna'}).format(new Date())){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['tag','kind','date','version'].includes(k)))throw Error('Ungültige Angaben.');
 const tag=String(input.tag??'').trim().toUpperCase().replace(/^#/,'');
 if(!/^[0289PYLQGRJCUV]{3,15}$/.test(tag))throw Error('Ungültiger Spielertag.');
 if(!['date','longstanding','unknown'].includes(input.kind))throw Error('Ungültige Eintrittsangabe.');
 const date=input.kind==='date'?input.date:null;
 if(input.kind==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<'2016-01-01'||date>today))throw Error('Ungültiges Eintrittsdatum.');
 if(!Number.isSafeInteger(input.version)||input.version<0)throw Error('Bitte die Seite neu laden.');
 return {tag:'#'+tag,kind:input.kind,date,version:input.version};
}
export function overlay(snapshot,stored){
 const data=structuredClone(snapshot),records=new Map((data.membershipRecords??data.players).map(p=>[p.tag,{...p,version:0}]));
 for(const r of stored)records.set(r.tag,{...records.get(r.tag),...r,joinKind:r.kind,joinDate:r.date,name:records.get(r.tag)?.name??r.tag});
 for(const p of data.players){
  const record=records.get(p.tag);if(!record)continue;
  p.joinKind=record.joinKind??'unknown';p.joinDate=record.joinDate??null;
  if(special.has(p.tag))continue;
  let count=p.ratedWeeks;
  if(p.joinKind==='longstanding')count=p.history.length;
  else if(p.joinKind==='date'){
   if(!data.weekEndDates)throw Error('Kalenderdaten fehlen.');
   count=p.history.filter(h=>p.joinDate<data.weekEndDates[h.week]).length;
  }else if(record.version>0){
   count=0;for(let i=0;i<p.history.length;i++)if(p.history[i].decks||p.history[i].points)count=i+1;
  }
  const rated=p.history.slice(0,count),denom=rated.reduce((n,h)=>n+h.weight,0);
  p.ratedWeeks=count;p.ratingStart=rated.at(-1)?.week??null;p.joinEstimated=p.joinKind==='unknown';
  p.points=denom?Math.floor(rated.reduce((n,h)=>n+h.points*h.weight,0)/denom+.5):null;
  p.participation=denom?Math.round(1000*rated.reduce((n,h)=>n+h.decks*h.weight,0)/(16*denom))/10:null;
  p.lastThree=rated.slice(0,3).reduce((n,h)=>n+h.decks,0);p.lastThreePossible=16*Math.min(3,count);
  p.category=p.points===null?'Noch offen':p.points>=2800?'Elite':p.points>=2300?'Stark':p.points>=1800?'Solide':p.points>=1200?'Schwach':'Kritisch';
 }
 data.players.sort((a,b)=>(a.points===null)-(b.points===null)||(b.points??0)-(a.points??0)||(b.participation??0)-(a.participation??0)||a.name.localeCompare(b.name,'de'));
 data.players.forEach((p,i)=>p.rank=p.points===null?null:i+1);
 data.membershipRecords=[...records.values()].map(r=>({tag:r.tag,name:r.name,joinKind:r.joinKind??'unknown',joinDate:r.joinDate??null,version:r.version??0,updatedAt:r.updatedAt??null,membershipNote:r.membershipNote??'',changes:r.changes??[]}));
 return data;
}
async function readSmall(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Keine Angaben übermittelt.');
 let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw Error('Angaben sind zu lang.');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export class MembershipStore{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  try{
   const url=new URL(request.url);
   if(request.method==='GET')return json([...(await this.ctx.storage.list({prefix:'member:'})).values()]);
   if(request.method!=='PUT')return json({error:'Nicht unterstützt.'},405);
   const input=validate(await readSmall(request));
   const ip=request.headers.get('CF-Connecting-IP')??'unknown';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
   const ipKey='rate:'+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const now=Date.now();
   const outcome=await this.ctx.storage.transaction(async tx=>{
    const current=await tx.get('member:'+input.tag);
    if((current?.version??0)!==input.version)return {status:409,error:'Dieser Eintritt wurde inzwischen geändert. Bitte neu laden und prüfen.'};
    const bucket=await tx.get(ipKey);
    if(bucket&&bucket.until>now&&bucket.count>=120)return {status:429,error:'Zu viele Änderungen. Bitte später erneut versuchen.'};
    const count=bucket&&bucket.until>now?bucket.count+1:1,updatedAt=new Date().toISOString();
    const next={tag:input.tag,kind:input.kind,date:input.date,version:input.version+1,updatedAt,
     changes:[...(current?.changes??[]),{kind:current?.kind??null,date:current?.date??null,changedAt:updatedAt}].slice(-20)};
    await tx.put({[ipKey]:{count,until:bucket&&bucket.until>now?bucket.until:now+3600000},['member:'+input.tag]:next});
    return {status:200,record:next};
   });
   if(outcome.error)return json({error:outcome.error},outcome.status);
   // Remove expired throttling records regularly; no IP address is retained.
   await this.ctx.storage.setAlarm(now+3600000);
   return json({saved:true,record:outcome.record});
  }catch(error){return json({error:error.message},400);}
 }
 async alarm(){for(const [key,value] of await this.ctx.storage.list({prefix:'rate:'}))if(value.until<=Date.now())await this.ctx.storage.delete(key);}
}
export default{
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN;
  if(origin&&origin!==allowed)return json({error:'Nicht erlaubte Seite.'},403);
  const cors={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
  const wrap=response=>{const headers=new Headers(response.headers);for(const [key,value] of Object.entries(cors))headers.set(key,value);return new Response(response.body,{status:response.status,headers});};
  if(request.method==='OPTIONS')return wrap(new Response(null,{status:204}));
  const path=new URL(request.url).pathname;
  const store=env.MEMBERSHIPS.get(env.MEMBERSHIPS.idFromName('austria-forever'));
  if(path==='/api/memberships'&&request.method==='PUT'){
   if(origin!==allowed)return wrap(json({error:'Bitte das Formular auf der Clanwebseite verwenden.'},403));
   return wrap(await store.fetch(request));
  }
  if(path==='/api/data'&&request.method==='GET'){
   try{
    const [base,records]=await Promise.all([fetch(env.SNAPSHOT_URL,{cache:'no-store'}),store.fetch(new Request('https://internal/records'))]);
    if(!base.ok||!records.ok)throw Error('Daten nicht verfügbar.');
    return wrap(json(overlay(await base.json(),await records.json())));
   }catch{return wrap(json({error:'Statistik kann gerade nicht geladen werden.'},503));}
  }
  return wrap(json({error:'Nicht gefunden.'},404));
 }
};
