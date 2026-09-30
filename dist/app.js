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
  const main=`<tr class="player" data-tag="${escapeHTML(p.tag)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)}: Wochenverlauf ${expanded?'schließen':'öffnen'}" aria-expanded="${expanded}"><td>${p.rank??'–'}</td><td><span class="player-name">${escapeHTML(p.name)}</span><span class="tag">${escapeHTML(p.tag)}${p.new?' · Neu/Rejoin':''}</span></td><td class="numeric"><strong>${p.points===null?'–':fmt.format(p.points)}</strong></td><td class="numeric">${p.participation===null?'–':p.participation.toLocaleString('de-AT')+' %'}</td><td class="numeric">${p.lastThree}/48</td><td class="numeric">${p.lastDecks}/16</td><td><span class="pill ${p.category.toLocaleLowerCase('de').replace(' ','-')}">${escapeHTML(p.category)}</span></td></tr>`;
  const detail=expanded?`<tr class="detail"><td colspan="7"><div class="detail-title">${p.ratedWeeks} gewertete CW · Punkte und Decks je Woche, neueste zuerst</div><div class="week-grid">${p.history.map((h,i)=>`<div class="week"><b>${escapeHTML(h.week.replace('s_','Saison ').replace('-',' · CW '))}</b><strong>${fmt.format(h.points)} P.</strong><small>${h.decks}/16 Decks · ${Math.round(h.weight*100)} %</small></div>`).join('')}</div></td></tr>`:'';
  return main+detail;
 }).join('');
 document.querySelector('#empty').hidden=items.length>0;
 body.querySelectorAll('tr.player').forEach(row=>{
  const toggle=()=>{openTag=openTag===row.dataset.tag?null:row.dataset.tag;render()};
  row.addEventListener('click',toggle);
  row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
 });
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
 document.querySelector('#search').addEventListener('input',render);document.querySelector('#sort').addEventListener('change',render);render();
}
start().catch(()=>{document.querySelector('#rows').innerHTML='<tr><td colspan="7">Die Statistik konnte gerade nicht geladen werden.</td></tr>'});
