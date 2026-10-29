/* Aggregate reporting only: no cookies, storage IDs, player identities or referrers. */
(()=>{
 const status=document.querySelector('#visitor-status'),metrics=document.querySelector('#visitor-metrics');
 if(!status||!metrics)return;
 const api=String(window.CLAN_API??'').replace(/\/$/,'');
 const number=new Intl.NumberFormat('de-AT');
 async function refresh(count=false){
  if(!api){status.textContent='Besucherstatistik ist noch nicht aktiviert.';return;}
  try{
   const optedOut=navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true;
   const response=await fetch(api+'/api/analytics',{method:count&&!optedOut?'POST':'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(response.status===404){status.textContent='Besucherstatistik vorbereitet – die Aktivierung des Zählers steht noch aus.';return;}
   if(!response.ok)throw Error();
   const data=await response.json();
   if(!data.today||!Array.isArray(data.days))throw Error();
   const date=value=>new Date(value+'T12:00:00Z').toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',timeZone:'Europe/Vienna'});
   status.textContent=data.startedAt?'Erfassung seit '+new Date(data.startedAt+'T12:00:00Z').toLocaleDateString('de-AT',{timeZone:'Europe/Vienna'})+' · Tageswechsel um Mitternacht in Österreich.':'Noch keine Besuche erfasst.';
   metrics.hidden=false;
   metrics.innerHTML='<div class="visitor-cards">'+[
    ['Besucher heute (geschätzt)',data.today.visitors],['Aufrufe heute',data.today.views],['Aufrufe · 7 Tage',data.views7],['Aufrufe · 30 Tage',data.views30]
   ].map(([label,value])=>'<div class="visitor-card"><span>'+label+'</span><strong>'+number.format(value)+'</strong></div>').join('')+'</div><h3>Die letzten 7 Tage</h3><table class="visitor-days"><thead><tr><th>Tag</th><th>Besucher*</th><th>Aufrufe</th></tr></thead><tbody>'+data.days.slice(0,7).map(d=>'<tr><td>'+date(d.date)+'</td><td>'+number.format(d.visitors)+'</td><td>'+number.format(d.views)+'</td></tr>').join('')+'</tbody></table><p class="hint">* Pro Tag geschätzt. Die Tageswerte sind keine eindeutigen Personen über mehrere Tage. Sehr schnelle Neuladungen innerhalb von 10 Sekunden zählen nicht erneut.</p>';
  }catch{status.textContent='Besucherstatistik ist gerade nicht erreichbar. Bitte später erneut versuchen.';}
 }
 // One event per visible page load; opening the menu only reads statistics.
 let sent=false;
 function track(){if(!sent&&document.visibilityState==='visible'){sent=true;void refresh(true);}}
 document.addEventListener('visibilitychange',track);track();
 document.querySelector('#visitors-view')?.addEventListener('click',()=>void refresh());
})();
