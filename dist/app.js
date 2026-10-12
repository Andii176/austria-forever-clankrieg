const fmt=new Intl.NumberFormat('de-AT');
const memberNote=p=>(p.previousNames?.length?`<span class="membership-note">Früher: ${p.previousNames.map(escapeHTML).join(' → ')}</span>`:'')+(p.membershipNote?`<span class="membership-note">${escapeHTML(p.membershipNote)}</span>`:'');
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const joinDescription=p=>p.joinKind==='date'&&p.joinDate?(p.joinSource==='observed'?'Beitritt erkannt: ':'Eintritt: ')+p.joinDate.split('-').reverse().join('.'):p.joinKind==='longstanding'?'Länger als 10 Wochen dabei':'Eintritt unbekannt';
const clanAPI=String(window.CLAN_API??'').replace(/\/$/,'');
let data,openTag=null;
const ratingWeights=[1,1,1,.9,.8,.7,.6,.5,.4,.3];
const clanRoles={member:'Mitglied',elder:'Ältester',admin:'Ältester',coLeader:'Vize-Anführer',leader:'Anführer'};
function roleBadge(p){
 const label=clanRoles[p.role];
 return label?`<span class="clan-role role-${p.role}" aria-label="Clanrolle: ${label}">${label}</span>`:'';
}
function previousRating(p){
 const snapshot=data.previousWar;
 if(!snapshot||snapshot.weeks?.[0]!==data.weeks?.[1]||p.points===null)return null;
 const previous=snapshot.players.find(old=>old.tag===p.tag);
 // New members without a recorded previous stay have no comparable prior rating.
 if(!previous)return null;
 let count;
 if(p.joinKind==='date'&&!p.membershipNote){
  count=previous.history.filter(h=>p.joinDate<snapshot.weekEndDates[h.week]).length;
 }else if(p.joinKind==='longstanding'){
  count=previous.history.length;
 }else{
  count=Math.max(0,p.ratedWeeks-1);
  // A full rolling window may already have contained ten rated weeks last week.
  if(p.ratedWeeks===10&&previous.ratedWeeks>=10)count=10;
 }
 if(!count)return null;
 const rated=previous.history.slice(0,count);
 const denom=rated.reduce((sum,h,i)=>sum+ratingWeights[i],0);
 return {
  points:Math.round(rated.reduce((sum,h,i)=>sum+h.points*ratingWeights[i],0)/denom),
  participation:Math.round(1000*rated.reduce((sum,h,i)=>sum+h.decks*ratingWeights[i],0)/(16*denom))/10,
 };
}
function ratingDelta(p,metric){
 const previous=previousRating(p);
 if(!previous)return '<small class="rating-delta muted">Noch kein Vorwochenwert</small>';
 const value=metric==='points'?p.points-previous.points:Math.round((p.participation-previous.participation)*10)/10;
 const sign=value>0?'+':value<0?'−':'±';
 const arrow=value>0?'↑':value<0?'↓':'→';
 const number=Math.abs(value).toLocaleString('de-AT',{maximumFractionDigits:metric==='points'?0:1});
 const unit=metric==='points'?'P.':'%-Pkt.';
 const week=data.previousWar.weeks[0].replace('s_','Saison ').replace('-',' · CW ');
 return `<small class="rating-delta ${value>0?'positive':value<0?'negative':'muted'}" title="Vorwochenwertung: ${escapeHTML(week)} · ${previous[metric].toLocaleString('de-AT')} ${metric==='points'?'Punkte':'%'}">${arrow} ${sign}${number} ${unit} zur Vorwoche</small>`;
}
function pointsPerGame(p){
 const rated=p.history.slice(0,p.ratedWeeks);
 const points=rated.reduce((sum,h,i)=>sum+h.points*(h.weight??ratingWeights[i]),0);
 const decks=rated.reduce((sum,h,i)=>sum+h.decks*(h.weight??ratingWeights[i]),0);
 return decks>0?points/decks:null;
}
function awardOrder(players,metric){
 return players.filter(p=>p.ratedWeeks>0&&p[metric]!==null&&Number.isFinite(p[metric])).slice().sort((a,b)=>b[metric]-a[metric]||(b.points??0)-(a.points??0)||a.name.localeCompare(b.name,'de')||a.tag.localeCompare(b.tag));
}
function awardChanges(p,metric,previous,previousRank,currentRank){
 if(!previous||!previousRank)return '<span class="award-rank muted">Neu in der Wertung</span>';
 const rank=previousRank-currentRank;
 const rankText=rank>0?'↑ '+rank+(rank===1?' Platz':' Plätze'):rank<0?'↓ '+Math.abs(rank)+(rank===-1?' Platz':' Plätze'):'→ Rang unverändert';
 const value=p[metric]-previous[metric];
 const decimals=metric==='points'?0:1;
 const rounded=Math.round(value*10**decimals)/10**decimals;
 const number=Math.abs(rounded).toLocaleString('de-AT',{maximumFractionDigits:decimals});
 const unit=metric==='participation'?'%-Pkt.':'P.';
 const difference=(rounded>0?'↑ +':rounded<0?'↓ −':'→ ±')+number+' '+unit;
 return `<span class="award-rank ${rank>0?'positive':rank<0?'negative':'muted'}" title="Vorwoche: Platz ${previousRank}">${rankText}</span><span class="award-delta ${rounded>0?'positive':rounded<0?'negative':'muted'}" title="Wertänderung zur Vorwoche">${difference}</span>`;
}
function renderPodiums(){
 const snapshot=data.awards;
 const players=snapshot?.players??data.players.map(p=>({...p,pointsPerGame:pointsPerGame(p)}));
 const prior=snapshot?.previous;
 const currentNames=new Map(data.players.map(p=>[p.tag,p]));
 const groups=[
  {key:'overall',title:'Gesamtwertung',caption:'Gew. Punkte/CW',metric:'points',format:v=>fmt.format(v)+' P.'},
  {key:'attendance',title:'Teilnahmequote',caption:'Gew. Teilnahme',metric:'participation',format:v=>v.toLocaleString('de-AT',{maximumFractionDigits:1})+' %'},
  {key:'efficiency',title:'Punkte pro Spiel',caption:'Gew. Punkte / gespieltem Deck',metric:'pointsPerGame',format:v=>v.toLocaleString('de-AT',{maximumFractionDigits:1})+' P.'},
 ];
 const week=(snapshot?.week??data.weeks[0]).replace('s_','Saison ').replace('-',' · CW ');
 document.querySelector('#awards-week').textContent=week+' · Wochenwertung';
 document.querySelector('#podium-groups').innerHTML=groups.map(g=>{
  const ranked=awardOrder(players,g.metric).slice(0,10);
  const previous=awardOrder(prior?.players??[],g.metric);
  const previousRanks=new Map(previous.map((p,i)=>[p.tag,i+1]));
  const previousPlayers=new Map(previous.map(p=>[p.tag,p]));
  return `<article class="podium-category" aria-labelledby="podium-${g.key}"><div class="podium-heading"><span class="podium-trophy" aria-hidden="true">🏆</span><h3 id="podium-${g.key}">${g.title}</h3><p>${g.caption}</p></div>${ranked.length?`<ol class="podium-list">${ranked.map((p,i)=>{const identity=currentNames.get(p.tag)??p;return `<li class="podium-place place-${i+1} ${i>=3?'podium-runner':''}"><span class="podium-medal" aria-hidden="true">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span><span class="sr-only">Platz ${i+1}: </span><strong class="podium-name">${escapeHTML(identity.name)}${roleBadge(identity)}</strong><span class="podium-value">${g.format(p[g.metric])}</span><small>${p.ratedWeeks} CW gewertet</small><div class="award-changes">${prior?awardChanges(p,g.metric,previousPlayers.get(p.tag),previousRanks.get(p.tag),i+1):'<span class="muted">Noch kein Vorwochenvergleich</span>'}</div></li>`;}).join('')}</ol>`:'<p class="hint">Noch keine gewerteten Spieler.</p>'}</article>`;
 }).join('');
}

function render(){
 const q=document.querySelector('#search').value.trim().toLocaleLowerCase('de');
 const sort=document.querySelector('#sort').value;
 const items=data.players.filter(p=>`${p.name} ${p.tag} ${(p.previousNames??[]).join(" ")}`.toLocaleLowerCase('de').includes(q));
 if(sort==='activity')items.sort((a,b)=>(b.participation??-1)-(a.participation??-1)||a.rank-b.rank);
 if(sort==='last')items.sort((a,b)=>b.lastDecks-a.lastDecks||b.lastPoints-a.lastPoints);
 if(sort==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'de'));
 const body=document.querySelector('#rows');
 body.innerHTML=items.map(p=>{
  const expanded=openTag===p.tag;
  const main=`<tr class="player" data-tag="${escapeHTML(p.tag)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)}: Wochenverlauf ${expanded?'schließen':'öffnen'}" aria-expanded="${expanded}"><td>${p.rank??'–'}</td><td><span class="player-name">${escapeHTML(p.name)}</span>${roleBadge(p)}<span class="tag">${escapeHTML(p.tag)} · ${p.ratedWeeks} CW<span class="join-meta">${escapeHTML(joinDescription(p))}</span></span>${p.previousNames?.length?`<span class="membership-note">Früher: ${p.previousNames.map(escapeHTML).join(' → ')}</span>`:''}</td><td class="numeric" data-label="Gew. Punkte/CW"><strong>${p.points===null?'–':fmt.format(p.points)}</strong>${ratingDelta(p,'points')}</td><td class="numeric" data-label="Gew. Punkte pro Spiel">${pointsPerGame(p)===null?'–':pointsPerGame(p).toLocaleString('de-AT',{maximumFractionDigits:1})}</td><td class="numeric" data-label="Gew. Teilnahme">${p.participation===null?'–':p.participation.toLocaleString('de-AT',{timeZone:'Europe/Vienna'})+' %'}${ratingDelta(p,'participation')}</td><td class="numeric" data-label="Bis zu 3 letzte CW">${p.lastThree}/${p.lastThreePossible??48}</td><td class="numeric" data-label="Letzter CW">${p.lastDecks}/16</td><td><span class="pill ${p.category.toLocaleLowerCase('de').replace(' ','-')}">${escapeHTML(p.category)}</span></td></tr>`;
  const detail=expanded?`<tr class="detail"><td colspan="8"><div class="detail-title">${escapeHTML(joinDescription(p))}${p.membershipNote?` · ${escapeHTML(p.membershipNote)}`:''}<br>${p.ratedWeeks} gewertete CW · ${p.ratingStart?'Beginn: '+escapeHTML(p.ratingStart.replace('s_','Saison ').replace('-',' · CW '))+(p.joinEstimated?' (geschätzt)':''):'Noch keine Teilnahme'} · neueste Woche zuerst</div><div class="week-grid">${p.history.slice(0,p.ratedWeeks).map((h,i)=>`<div class="week ${i>=p.ratedWeeks?'excluded':''}"><b>${escapeHTML(h.week.replace('s_','Saison ').replace('-',' · CW '))}</b><strong>${fmt.format(h.points)} P.</strong><small>${h.decks}/16 Decks · ${i>=p.ratedWeeks?'Nicht gewertet':Math.round(h.weight*100)+' % Gewicht'}</small></div>`).join('')}</div></td></tr>`:'';
  return main+detail;
 }).join('');
 document.querySelector('#empty').hidden=items.length>0;
 body.querySelectorAll('tr.player').forEach(row=>{
  const toggle=()=>{openTag=openTag===row.dataset.tag?null:row.dataset.tag;render()};
  row.addEventListener('click',toggle);
  row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
 });
}
function recentReview(p){
 const weeks=Math.min(3,p.ratedWeeks);
 return {decks:p.history.slice(0,weeks).reduce((sum,h)=>sum+h.decks,0),possible:weeks*16};
}
function kickWeeks(p){
 if(p.ratedWeeks<2)return [];
 const weeks=data.weeks.slice(0,2);
 const history=p.history.slice(0,p.ratedWeeks);
 const latest=weeks.map(week=>history.find(h=>h.week===week));
 return latest.length===2&&latest.every(h=>h&&Number.isFinite(h.points)&&h.points<1600)?latest:[];
}
function reviewStatus(p){
 const recent=recentReview(p);
 if(p.ratedWeeks<1||p.points===null)return 'new';
 if(kickWeeks(p).length===2)return 'kick';
 if(p.points<1200&&recent.decks/recent.possible<2/3)return 'risk';
 if(p.points<1800||p.lastDecks<12)return 'watch';
 return 'ok';
}
function reviewReason(p,status){
 const recent=recentReview(p);
 if(status==='new')return `Ersten abgeschlossenen CW abwarten`;
 if(status==='kick')return 'Zwei abgeschlossene CW in Folge unter 1.600 Punkten: '+kickWeeks(p).map(h=>`${h.week.replace('s_','Saison ').replace('-',' · CW ')}: ${fmt.format(h.points)} P.`).join(' / ');
 const reasons=[];
 if(p.points<1200)reasons.push('Kritischer Langzeitwert');
 else if(p.points<1800)reasons.push('Schwacher Langzeitwert');
 if(recent.decks/recent.possible<2/3)reasons.push('Unter ⅔ Teilnahme in den gewerteten letzten CW');
 if(p.lastDecks<12)reasons.push(`Zuletzt ${p.lastDecks}/16 Decks`);
 if(p.points<1200&&recent.decks/recent.possible>=2/3)reasons.push('Zuletzt höhere Teilnahme – Entwicklung beobachten');
 return reasons.join(' · ');
}
function renderReview(){
 const groups=[{key:'kick',title:'Kick empfohlen · 2 CW unter 1.600 Punkten',note:'In den letzten zwei abgeschlossenen, gewerteten CW jeweils unter 1.600 Punkten. In der Regel ausschließen; Absprachen und entschuldigte Ausfälle vorher prüfen.'},{key:'risk',title:'Gefährdet',note:'Bei der nächsten Clanprüfung zuerst besprechen.'},{key:'watch',title:'Unter Beobachtung',note:'Verbesserung im nächsten CW prüfen.'},{key:'new',title:'Neu / noch offen',note:'Ein abgeschlossener CW zur Eingewöhnung.'}];
 document.querySelector('#review-groups').innerHTML=groups.map(g=>{
  const players=data.players.filter(p=>reviewStatus(p)===g.key).sort((a,b)=>{
   if(g.key==='kick')return kickWeeks(a).reduce((sum,h)=>sum+h.points,0)-kickWeeks(b).reduce((sum,h)=>sum+h.points,0)||a.name.localeCompare(b.name,'de');
   return recentReview(a).decks/recentReview(a).possible-recentReview(b).decks/recentReview(b).possible||(a.points??Infinity)-(b.points??Infinity)||a.name.localeCompare(b.name,'de');
  });
  return `<section class="review-group ${g.key}" aria-labelledby="${g.key}-title"><div class="review-heading"><h3 id="${g.key}-title">${g.title} <span>${players.length}</span></h3><p>${g.note}</p></div>${players.length?`<div class="review-cards">${players.map(p=>`<article class="review-card"><details class="review-player-details"><summary class="review-player"><strong>${escapeHTML(p.name)}</strong>${roleBadge(p)}<span class="tag">${escapeHTML(p.tag)} · ${p.ratedWeeks} CW gewertet</span><span class="history-toggle">Wochenverlauf öffnen / schließen</span></summary><div class="review-history"><p class="detail-title">${escapeHTML(joinDescription(p))} · neueste gewertete Woche zuerst</p>${memberNote(p)}${p.ratedWeeks?`<div class="week-grid">${p.history.slice(0,p.ratedWeeks).map(h=>`<div class="week ${g.key==='kick'&&kickWeeks(p).some(k=>k.week===h.week)?'low-week':''}"><b>${escapeHTML(h.week.replace('s_','Saison ').replace('-',' · CW '))}</b><strong>${fmt.format(h.points)} P.</strong><small>${h.decks}/16 Decks · ${Math.round(h.weight*100)} % Gewicht</small></div>`).join('')}</div>`:'<p class="hint">Noch kein gewerteter Clankrieg.</p>'}</div></details><p class="review-reason">${escapeHTML(reviewReason(p,g.key))}</p><dl><div><dt>Gew. Punkte/CW</dt><dd>${p.points===null?'–':fmt.format(p.points)}${ratingDelta(p,'points')}</dd></div><div><dt>Gew. Teilnahme</dt><dd>${p.participation===null?'–':p.participation.toLocaleString('de-AT')+' %'}${ratingDelta(p,'participation')}</dd></div><div><dt>Bis zu 3 letzte CW</dt><dd>${recentReview(p).decks}/${recentReview(p).possible} Decks</dd></div><div><dt>Letzter CW</dt><dd>${p.lastDecks}/16 Decks</dd></div></dl></article>`).join('')}</div>`:'<p class="hint">Aktuell keine Spieler in dieser Gruppe.</p>'}</section>`;
 }).join('');
}
function setView(view){
 const views={clan:['statistics-view','overview-view'],members:['members-panel','members-view'],review:['review-panel','review-view']};
 for(const [key,[panel,button]] of Object.entries(views)){
  document.querySelector('#'+panel).hidden=key!==view;
  document.querySelector('#'+button).setAttribute('aria-pressed',String(key===view));
 }
}

function nextScheduledUpdate(now=new Date()){
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vienna',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const first=Math.floor(now.getTime()/60000)*60000+60000;
 for(let t=first;t<=first+26*60*60000;t+=60000){
  const local=Object.fromEntries(clock.formatToParts(new Date(t)).map(p=>[p.type,p.value]));
  const hour=Number(local.hour),minute=Number(local.minute),day=local.weekday;
  const members=minute===37&&[0,6,13,19].includes(hour);
  const war=hour===12&&((day==='Mon'&&[10,30,50].includes(minute))||(['Thu','Fri','Sat','Sun'].includes(day)&&minute===15));
  if(war||members)return {date:new Date(t),label:war?'Clankrieg':'Mitglieder'};
 }
 return null;
}
function updateDateText(date){
 const zone={timeZone:'Europe/Vienna'};
 return date.toLocaleDateString('de-AT',{...zone,day:'2-digit',month:'2-digit',year:'numeric'})+' · '+date.toLocaleTimeString('de-AT',{...zone,hour:'2-digit',minute:'2-digit'});
}
function renderNextUpdate(){
 const next=nextScheduledUpdate();
 const element=document.querySelector('#next-update');
 element.textContent=next?updateDateText(next.date):'Noch nicht geplant';
 if(next)element.dateTime=next.date.toISOString();else element.removeAttribute('datetime');
 document.querySelector('#next-update-type').textContent=next?next.label+' · geplant':'Kein Termin verfügbar';
}

async function start(){
 renderNextUpdate();setInterval(renderNextUpdate,60000);
 const response=await fetch(clanAPI?clanAPI+'/api/data':'data.json',{cache:'no-store'});if(!response.ok)throw new Error('Daten nicht verfügbar');data=await response.json();
 const timestamps=[data.rosterAsOf,data.liveWar?.checkedAt,...(data.membershipRecords??[]).map(r=>r.updatedAt)].filter(t=>t&&Number.isFinite(Date.parse(t)));
 const updated=document.querySelector('#updated-at');
 if(timestamps.length){const date=new Date(Math.max(...timestamps.map(Date.parse)));updated.textContent=updateDateText(date);updated.dateTime=date.toISOString();}else{updated.textContent='Noch kein Datenstand';}

 if(data.liveWar){const w=data.liveWar;document.querySelector('#live-war').hidden=false;document.querySelector('#live-title').textContent=w.week.replace('s_','Saison ').replace('-',' · CW ')+' · '+w.status;document.querySelector('#live-summary').textContent=fmt.format(w.points)+' Punkte · '+fmt.format(w.decks)+' gespielte Decks';document.querySelector('#live-updated').textContent='Abgerufen: '+new Date(w.checkedAt).toLocaleString('de-AT',{timeZone:'Europe/Vienna'});document.querySelector('#live-players').innerHTML=w.players.map(p=>`<tr><td><strong>${escapeHTML(p.name)}</strong><span class="tag">${escapeHTML(p.tag)}${p.currentMember?'':' · inzwischen ausgeschieden'}</span></td><td>${fmt.format(p.points)}</td><td>${fmt.format(p.decks)}</td></tr>`).join('');}
 document.querySelector('#member-count').textContent=`· ${data.players.length}`;
 const totalPoints=data.trend.reduce((n,w)=>n+w.points,0),totalDecks=data.trend.reduce((n,w)=>n+w.decks,0);
 document.querySelector('#week-summary').innerHTML=`<div><span>10-Wochen-Summe</span><strong>${fmt.format(totalPoints)} <small>Punkte</small></strong></div><div><span>10-Wochen-Summe</span><strong>${fmt.format(totalDecks)} <small>Decks</small></strong></div><div><span>Durchschnitt pro CW</span><strong>${fmt.format(Math.round(totalPoints/10))} <small>Punkte</small></strong></div><div><span>Durchschnitt pro CW</span><strong>${fmt.format(Math.round(totalDecks/10))} <small>Decks</small></strong></div>`;
 const maxPoints=Math.max(...data.trend.map(w=>w.points)),maxDecks=Math.max(...data.trend.map(w=>w.decks));
 const change=(value,prior)=>{if(!prior)return '<span class="muted">–</span>';const pct=(value/prior-1)*100;return `<span class="${pct>=0?'positive':'negative'}">${pct>=0?'+':''}${pct.toLocaleString('de-AT',{maximumFractionDigits:1})} %</span>`};
 document.querySelector('#week-rows').innerHTML=data.trend.map((w,i)=>{const prior=data.trend[i+1];return `<div class="result-row ${i===0?'latest':''}" role="row"><div class="week-cell" role="cell"><strong>${escapeHTML(w.week.replace('s_','Saison ').replace('-',' · CW '))}</strong>${i===0?'<small>Aktuellster CW</small>':''}</div><div class="measure" role="cell"><strong>${fmt.format(w.points)}</strong><div class="track"><span class="points-fill" style="width:${(w.points/maxPoints*100).toFixed(1)}%"></span></div></div><div class="measure" role="cell"><strong>${fmt.format(w.decks)}</strong><div class="track"><span class="decks-fill" style="width:${(w.decks/maxDecks*100).toFixed(1)}%"></span></div></div><div class="change-cell" role="cell"><span>Punkte ${prior?change(w.points,prior.points):'–'}</span><span>Decks ${prior?change(w.decks,prior.decks):'–'}</span></div></div>`}).join('');
 renderReview();renderPodiums();document.querySelector('#overview-view').addEventListener('click',()=>setView('clan'));document.querySelector('#members-view').addEventListener('click',()=>setView('members'));document.querySelector('#review-view').addEventListener('click',()=>setView('review'));
 document.querySelector('#search').addEventListener('input',render);document.querySelector('#sort').addEventListener('change',render);render();
}
start().catch(()=>{document.querySelector('#rows').innerHTML='<tr><td colspan="8">Die Statistik konnte gerade nicht geladen werden.</td></tr>'});

