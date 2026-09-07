'use strict';

const PROGOL_REAL_URL='https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-progol-live';

function progolContext(m){
  const h=m.context?.home||{}, a=m.context?.away||{};
  const hs=h.currentSeasonUsed?`${h.currentSeasonMatches||0} de temporada actual`:`sin muestra suficiente de temporada actual`;
  const as=a.currentSeasonUsed?`${a.currentSeasonMatches||0} de temporada actual`:`sin muestra suficiente de temporada actual`;
  return `${m.competition||''} · ${m.season||''}<br><small>Contexto: ${hs} (${m.home}) · ${as} (${m.away}) · historial del torneo: ${h.competitionMatches||0}/${a.competitionMatches||0}</small>`;
}

async function loadProgolReal(){
  const notice=$('#demoNotice');
  try{
    if(notice){notice.style.display='block';notice.className='notice';notice.textContent='Calculando Progol con la base real…';}
    const r=await fetch(PROGOL_REAL_URL,{cache:'no-store'});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'No se pudo calcular Progol');
    progolDemo=d;
    const allReal=d.status==='REAL_MODEL' && d.matches?.every(m=>m.model && m.coverage);
    if(allReal){
      if(notice) notice.style.display='none';
    }else if(notice){
      notice.style.display='block';
      notice.className='notice danger';
      notice.textContent=d.notice||'Hay partidos sin muestra suficiente.';
    }
    $('#progolBody').innerHTML=(d.matches||[]).map(m=>{
      if(!m.model) return `<tr><td>${m.n}</td><td><b>${m.home}</b><span class="subtle"> vs </span><b>${m.away}</b><br><small>${m.competition||''}</small></td><td colspan="3"><span class="badge-warn">Sin datos suficientes</span></td></tr>`;
      return `<tr><td>${m.n}</td><td><b>${m.home}</b><span class="subtle"> vs </span><b>${m.away}</b><br><small>${progolContext(m)}</small></td><td>${triplet(m.model)}</td><td>${triplet(m.public)}</td><td><span class="chip">${m.coverage.type}: ${m.coverage.picks.join('')}</span></td></tr>`;
    }).join('');
  }catch(e){
    if(notice){notice.style.display='block';notice.className='notice danger';notice.textContent=`No se pudo cargar el Progol real: ${e.message}`;}
  }
}

setTimeout(loadProgolReal,0);
$('#refreshBtn')?.addEventListener('click',()=>setTimeout(loadProgolReal,100));

(function loadFriendlyUi(){
  if(!document.querySelector('link[href="./ui-fixes.css"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./ui-fixes.css';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[src="./ui-fixes.js"]')){
    const script=document.createElement('script');
    script.src='./ui-fixes.js';
    document.body.appendChild(script);
  }
})();
