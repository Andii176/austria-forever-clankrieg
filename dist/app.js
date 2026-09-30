const fmt=new Intl.NumberFormat('de-AT');
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,openTag=null;
function render(){
 const q=document.querySelector('#search').value.trim().toLocaleLowerCase('de');
 const sort=document.querySelector('#sort').value;
 const items=data.players.filter(p=>`${p.name} ${p.tag}`.toLocaleLowerCase('de').includes(q));
 if(sort==='activity')items.sort((a,b)=>(b.participation??-1)-(a.participation??-1)||a.rank-b.rank);
 if(sort==='last')items.sort((a,b)=>b.lastDecks-a.lastDecks||b.lastPoints-a.lastPoints);
 if(sort==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'de'));
 const body=document.querySelector('#rows');
 body.innerHTML=items.map(p=>{
  const expanded=openTag===p.tag;
  const main=`<tr class="player" data-tag="${escapeHTML(p.tag)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)}: Wochenverlauf ${expanded?'schließen':'öffnen'}" aria-expanded="${expanded}"><td>${p.rank??'–'}</td><td><span class="player-name">${escapeHTML(p.name)}</span><span class="tag">${escapeHTML(p.tag)}${p.joinEstimated?' · Wertungsbeginn geschätzt':''}</span></td><td class="numeric"><strong>${p.points===null?'–':fmt.format(p.points)}</strong></td><td class="numeric">${p.participation===null?'–':p.participation.toLocaleString('de-AT')+' %'}</td><td class="numeric">${p.lastThree}/${p.lastThreePossible??48}</td><td class="numeric">${p.lastDecks}/16</td><td><span class="pill ${p.category.toLocaleLowerCase('de').replace(' ','-')}">${escapeHTML(p.category)}</span></td></tr>`;
  const detail=expanded?`<tr class="detail"><td colspan="7"><div class="detail-title">${p.ratedWeeks} gewertete CW · ${p.ratingStart?'Beginn: '+escapeHTML(p.ratingStart.replace('s_','Saison ').replace('-',' · CW '))+' (geschätzt)':'Noch keine Teilnahme'} · neueste Woche zuerst</div><div class="week-grid">${p.history.map((h,i)=>`<div class="week ${i>=p.ratedWeeks?'excluded':''}"><b>${escapeHTML(h.week.replace('s_','Saison ').replace('-',' · CW '))}</b><strong>${fmt.format(h.points)} P.</strong><small>${h.decks}/16 Decks · ${i>=p.ratedWeeks?'Nicht gewertet':Math.round(h.weight*100)+' % Gewicht'}</small></div>`).join('')}</div></td></tr>`:'';
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
function reviewStatus(p){
 const recent=recentReview(p);
 if(p.ratedWeeks<1||p.points===null)return 'new';
 if(p.points<1200&&recent.decks/recent.possible<2/3)return 'risk';
 if(p.points<1800||p.lastDecks<12)return 'watch';
 return 'ok';
}
function reviewReason(p,status){
 const recent=recentReview(p);
 if(status==='new')return `Ersten abgeschlossenen CW abwarten`;
 const reasons=[];
 if(p.points<1200)reasons.push('Kritischer Langzeitwert');
 else if(p.points<1800)reasons.push('Schwacher Langzeitwert');
 if(recent.decks/recent.possible<2/3)reasons.push('Unter ⅔ Teilnahme in den gewerteten letzten CW');
 if(p.lastDecks<12)reasons.push(`Zuletzt ${p.lastDecks}/16 Decks`);
 if(p.points<1200&&recent.decks/recent.possible>=2/3)reasons.push('Zuletzt höhere Teilnahme – Entwicklung beobachten');
 return reasons.join(' · ');
}
function renderReview(){
 const groups=[{key:'risk',title:'Gefährdet',note:'Bei der nächsten Clanprüfung zuerst besprechen.'},{key:'watch',title:'Unter Beobachtung',note:'Verbesserung im nächsten CW prüfen.'},{key:'new',title:'Neu / noch offen',note:'Ein abgeschlossener CW zur Eingewöhnung.'}];
 document.querySelector('#review-groups').innerHTML=groups.map(g=>{
  const players=data.players.filter(p=>reviewStatus(p)===g.key).sort((a,b)=>recentReview(a).decks/recentReview(a).possible-recentReview(b).decks/recentReview(b).possible||(a.points??Infinity)-(b.points??Infinity)||a.name.localeCompare(b.name,'de'));
  return `<section class="review-group ${g.key}" aria-labelledby="${g.key}-title"><div class="review-heading"><h3 id="${g.key}-title">${g.title} <span>${players.length}</span></h3><p>${g.note}</p></div>${players.length?`<div class="review-cards">${players.map(p=>`<article class="review-card"><div class="review-player"><strong>${escapeHTML(p.name)}</strong><span class="tag">${escapeHTML(p.tag)}${p.joinEstimated?' · Wertungsbeginn geschätzt':''}</span></div><p class="review-reason">${escapeHTML(reviewReason(p,g.key))}</p><dl><div><dt>Gew. Punkte/CW</dt><dd>${p.points===null?'–':fmt.format(p.points)}</dd></div><div><dt>Bis zu 3 letzte CW</dt><dd>${recentReview(p).decks}/${recentReview(p).possible} Decks</dd></div><div><dt>Letzter CW</dt><dd>${p.lastDecks}/16 Decks</dd></div></dl><button type="button" class="show-player" data-tag="${escapeHTML(p.tag)}">Wochenverlauf ansehen</button></article>`).join('')}</div>`:'<p class="hint">Aktuell keine Spieler in dieser Gruppe.</p>'}</section>`;
 }).join('');
 document.querySelectorAll('.show-player').forEach(button=>button.addEventListener('click',()=>{
  document.querySelector('#search').value=button.dataset.tag;openTag=button.dataset.tag;setView(false);render();document.querySelector('#ranking-title').scrollIntoView({behavior:'smooth',block:'start'});document.querySelector('#rows .player')?.focus({preventScroll:true});
 }));
}
function setView(review){
 document.querySelector('#statistics-view').hidden=review;
 document.querySelector('#review-panel').hidden=!review;
 document.querySelector('#overview-view').setAttribute('aria-pressed',String(!review));
 document.querySelector('#review-view').setAttribute('aria-pressed',String(review));
}

async function start(){
 const response=await fetch('data.json');if(!response.ok)throw new Error('Daten nicht verfügbar');data=await response.json();
 document.querySelector('#as-of').textContent=`Stand ${data.asOf}`;
 const [now,previous]=data.trend;
 document.querySelector('#lead-points').textContent=fmt.format(now.points);
 const delta=(now.points/previous.points-1)*100;
 const deltaNode=document.querySelector('#lead-delta');deltaNode.textContent=`${delta>=0?'+':''}${delta.toLocaleString('de-AT',{maximumFractionDigits:1})} % zum vorherigen CW`;deltaNode.className=delta>=0?'positive':'negative';
 document.querySelector('#decks').textContent=fmt.format(now.decks);document.querySelector('#decks-delta').textContent=`${now.decks>=previous.decks?'+':''}${fmt.format(now.decks-previous.decks)} zur Vorwoche`;document.querySelector('#active').textContent=data.currentActive;document.querySelector('#active-note').textContent=`von ${data.players.length} aktuellen Mitgliedern`;document.querySelector('#efficiency').textContent=fmt.format(Math.round(now.points/now.decks));
 document.querySelector('#member-count').textContent=`· ${data.players.length}`;
 const totalPoints=data.trend.reduce((n,w)=>n+w.points,0),totalDecks=data.trend.reduce((n,w)=>n+w.decks,0);
 document.querySelector('#week-summary').innerHTML=`<div><span>10-Wochen-Summe</span><strong>${fmt.format(totalPoints)} <small>Punkte</small></strong></div><div><span>10-Wochen-Summe</span><strong>${fmt.format(totalDecks)} <small>Decks</small></strong></div><div><span>Durchschnitt pro CW</span><strong>${fmt.format(Math.round(totalPoints/10))} <small>Punkte</small></strong></div><div><span>Durchschnitt pro CW</span><strong>${fmt.format(Math.round(totalDecks/10))} <small>Decks</small></strong></div>`;
 const maxPoints=Math.max(...data.trend.map(w=>w.points)),maxDecks=Math.max(...data.trend.map(w=>w.decks));
 const change=(value,prior)=>{if(!prior)return '<span class="muted">–</span>';const pct=(value/prior-1)*100;return `<span class="${pct>=0?'positive':'negative'}">${pct>=0?'+':''}${pct.toLocaleString('de-AT',{maximumFractionDigits:1})} %</span>`};
 document.querySelector('#week-rows').innerHTML=data.trend.map((w,i)=>{const prior=data.trend[i+1];return `<div class="result-row ${i===0?'latest':''}" role="row"><div class="week-cell" role="cell"><strong>${escapeHTML(w.week.replace('s_','Saison ').replace('-',' · CW '))}</strong>${i===0?'<small>Aktuellster CW</small>':''}</div><div class="measure" role="cell"><strong>${fmt.format(w.points)}</strong><div class="track"><span class="points-fill" style="width:${(w.points/maxPoints*100).toFixed(1)}%"></span></div></div><div class="measure" role="cell"><strong>${fmt.format(w.decks)}</strong><div class="track"><span class="decks-fill" style="width:${(w.decks/maxDecks*100).toFixed(1)}%"></span></div></div><div class="change-cell" role="cell"><span>Punkte ${prior?change(w.points,prior.points):'–'}</span><span>Decks ${prior?change(w.decks,prior.decks):'–'}</span></div></div>`}).join('');
 renderReview();document.querySelector('#overview-view').addEventListener('click',()=>setView(false));document.querySelector('#review-view').addEventListener('click',()=>setView(true));
 document.querySelector('#search').addEventListener('input',render);document.querySelector('#sort').addEventListener('change',render);render();
}
start().catch(()=>{document.querySelector('#rows').innerHTML='<tr><td colspan="7">Die Statistik konnte gerade nicht geladen werden.</td></tr>'});
