'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let progolDemo = null;
let dataSummary = [];
let liveTimer = null;
let bootstrapRunning = false;

function pct(v, d=1){ return `${(Number(v)*100).toFixed(d)}%`; }
function money(v){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(v||0)); }
function fmtDate(v){ if(!v)return '—'; return new Date(v).toLocaleDateString('es-MX',{year:'numeric',month:'short',day:'numeric'}); }
function outcomeName(v){ return v==='L'?'Local':v==='E'?'Empate':v==='V'?'Visitante':'—'; }

async function api(url, options={}){
  const r = await fetch(url, options);
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'Error de servidor');
  return j;
}

function setView(view){
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  const b=$(`.nav-btn[data-view="${view}"]`);
  $('#pageTitle').textContent=b?.textContent||'Fútbol Quant';
  if(view==='history') loadHistory();
  if(view==='data') loadDataSummary(false);
  if(view==='overview') loadLiveMatches();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

async function health(){
  try{
    const d=await api('/api/health');
    $('#healthDot').className='dot ok';
    $('#healthText').textContent=`Base persistente · v${d.version}`;
    $('#appVersion').textContent=`v${d.version}`;
  }catch{
    $('#healthDot').className='dot';
    $('#healthText').textContent='Sin conexión';
  }
}

function renderDataSummary(rows){
  dataSummary=rows||[];
  const total=dataSummary.reduce((s,r)=>s+Number(r.finished||0),0);
  $('#totalMatches').textContent=total.toLocaleString('es-MX');
  $('#totalLeagues').textContent=dataSummary.length;
  const names={liga_mx:'Liga MX',laliga:'LaLiga',serie_a:'Serie A',premier_league:'Premier League'};
  $('#dataSummary').innerHTML=dataSummary.length?dataSummary.map(r=>`
    <div class="history-item">
      <b>${names[r.league_key]||r.competition||r.league_key}</b>
      <small>${Number(r.finished||0).toLocaleString('es-MX')} partidos · ${fmtDate(r.from)} a ${fmtDate(r.to)}</small>
      <span class="badge-ok">Listo</span>
    </div>`).join(''):'<div class="empty">La base todavía está vacía. Sin historial no se habilitan las ligas ni los equipos del pronóstico.</div>';
  const league=$('#leagueSelect');
  const current=league.value;
  league.innerHTML='<option value="">Selecciona…</option>'+dataSummary.map(r=>`<option value="${r.league_key}">${names[r.league_key]||r.competition}</option>`).join('');
  if(dataSummary.some(r=>r.league_key===current)) league.value=current;
  const missing=['liga_mx','premier_league','laliga','serie_a'].filter(k=>!dataSummary.some(r=>r.league_key===k));
  $('#bootstrapStatus').textContent=missing.length
    ? `Base parcial: ${total.toLocaleString('es-MX')} partidos. Faltan: ${missing.map(k=>names[k]).join(', ')}.`
    : `Base lista: ${total.toLocaleString('es-MX')} partidos en las 4 ligas principales.`;
}

async function loadDataSummary(autoBootstrap=true){
  try{
    const rows=await api('/api/data/summary');
    renderDataSummary(rows);
    const have=new Set((rows||[]).map(r=>r.league_key));
    const missingEurope=['premier_league','laliga','serie_a'].some(k=>!have.has(k));
    if(autoBootstrap && missingEurope && !bootstrapRunning) await bootstrapData();
  }catch(e){
    $('#dataSummary').innerHTML=`<div class="simple-note">No se pudo leer la base: ${e.message}</div>`;
    $('#bootstrapStatus').textContent=`Error de conexión con la base: ${e.message}`;
  }
}

async function bootstrapData(){
  if(bootstrapRunning) return;
  bootstrapRunning=true;
  const btn=$('#bootstrapBtn');
  if(btn){btn.disabled=true;btn.textContent='Cargando otras ligas…';}
  $('#bootstrapStatus').textContent='Descargando y guardando Premier League, LaLiga y Serie A. Puede tardar un poco…';
  try{
    const r=await api('/api/data/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'europe'})});
    $('#bootstrapStatus').innerHTML=`<span class="badge-ok">Carga terminada.</span> Base con ${Number(r.total_rows||0).toLocaleString('es-MX')} registros.`;
    const rows=await api('/api/data/summary');
    renderDataSummary(rows);
  }catch(e){
    $('#bootstrapStatus').innerHTML=`<span class="badge-warn">No se pudo completar:</span> ${e.message}`;
  }finally{
    bootstrapRunning=false;
    if(btn){btn.disabled=false;btn.textContent='Cargar / actualizar otras ligas';}
  }
}
$('#bootstrapBtn').addEventListener('click',bootstrapData);

$('#leagueSelect').addEventListener('change',async(e)=>{
  const league=e.target.value;
  $('#homeSelect').innerHTML='<option value="">Cargando…</option>';
  $('#awaySelect').innerHTML='<option value="">Cargando…</option>';
  if(!league){
    $('#homeSelect').innerHTML='<option value="">Selecciona…</option>';
    $('#awaySelect').innerHTML='<option value="">Selecciona…</option>';
    return;
  }
  try{
    const teams=await api(`/api/data/teams/${encodeURIComponent(league)}`);
    const opts='<option value="">Selecciona…</option>'+teams.map(t=>`<option>${t}</option>`).join('');
    $('#homeSelect').innerHTML=opts; $('#awaySelect').innerHTML=opts;
  }catch(e){ $('#homeSelect').innerHTML='<option value="">Error</option>'; $('#awaySelect').innerHTML='<option value="">Error</option>'; }
});

function probCards(p){
  const vals=[['Gana local',p.L],['Empate',p.E],['Gana visitante',p.V]];
  const best=Math.max(...vals.map(x=>x[1]));
  return `<div class="prob-grid">${vals.map(([n,v])=>`<div class="prob-card ${v===best?'best':''}"><span>${n}</span><strong>${pct(v)}</strong></div>`).join('')}</div>`;
}

$('#predictForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const league=$('#leagueSelect').value, home=$('#homeSelect').value, away=$('#awaySelect').value;
  $('#predictResult').innerHTML='<div class="empty">Calculando con el historial…</div>';
  try{
    const r=await api('/api/predict/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league,home,away})});
    const p=r.probabilities; const best=Math.max(p.L,p.E,p.V);
    $('#betProb').value=(best*100).toFixed(1);
    $('#predictResult').innerHTML=`
      <div class="panel-title"><div><p class="eyebrow">RESULTADO</p><h3>${home} vs ${away}</h3></div><span class="pill">${r.sample.league} partidos de liga</span></div>
      ${probCards(p)}
      <div class="payoff-grid">
        <div><span>Goles esperados local</span><strong>${Number(r.goals.home).toFixed(2)}</strong></div>
        <div><span>Goles esperados visitante</span><strong>${Number(r.goals.away).toFixed(2)}</strong></div>
        <div><span>Más de 2.5 goles</span><strong>${pct(r.over25)}</strong></div>
      </div>
      <p class="simple-note" style="margin-top:12px">Base usada: ${r.sample.home} partidos recientes del local en casa y ${r.sample.away} del visitante fuera. ${r.methodology}</p>
      <p class="simple-note" style="margin-top:10px"><b>Guardado para auditoría:</b> ${r.auditId?'sí':'no'}. Resultado más probable: ${outcomeName(r.predictedOutcome)}. Cuando termine el partido se registra el marcador real y podremos comparar si acertó.</p>`;
  }catch(err){ $('#predictResult').innerHTML=`<div class="simple-note">${err.message}</div>`; }
});

$('#betForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const probability=Number($('#betProb').value)/100;
  const amount=Number($('#betAmount').value);
  const return100=Number($('#houseReturn100').value);
  const multiplier=return100/100;
  const totalReturn=amount*multiplier;
  const netProfit=totalReturn-amount;
  const implied=1/multiplier;
  const edge=probability-implied;
  const ev=probability*netProfit-(1-probability)*amount;
  let verdict='Pago poco atractivo para esta probabilidad';
  let cls='badge-warn';
  if(edge>=0.05){verdict='El pago parece favorable frente a nuestra probabilidad';cls='badge-ok';}
  else if(edge>=0.02){verdict='Hay una ventaja pequeña; requiere cautela';cls='badge-warn';}
  $('#betResult').innerHTML=`
    <div class="panel-title"><div><p class="eyebrow">SIMULACIÓN</p><h3 class="${cls}">${verdict}</h3></div></div>
    <div class="payoff-grid">
      <div><span>Si apuestas</span><strong>${money(amount)}</strong></div>
      <div><span>Recibirías si ganas</span><strong>${money(totalReturn)}</strong></div>
      <div><span>Ganancia neta</span><strong>${money(netProfit)}</strong></div>
    </div>
    <div class="prob-grid">
      <div class="prob-card"><span>Probabilidad FQ</span><strong>${pct(probability)}</strong></div>
      <div class="prob-card"><span>Probabilidad mínima del pago</span><strong>${pct(implied)}</strong></div>
      <div class="prob-card ${edge>0?'best':''}"><span>Diferencia</span><strong>${edge>=0?'+':''}${pct(edge)}</strong></div>
    </div>
    <p class="simple-note">Valor esperado aproximado por esta apuesta: ${money(ev)}. Es una estimación matemática, no una garantía.</p>`;
});

function triplet(obj){return `<div class="triplet">${['L','E','V'].map(k=>`<span class="chip">${k} ${pct(obj[k])}</span>`).join('')}</div>`;}

async function loadProgol(){
  try{
    progolDemo=await api('/api/demo/progol');
    $('#demoNotice').textContent='Este Progol todavía usa datos de demostración para algunos partidos. No usarlo como recomendación real hasta que esos encuentros estén enlazados al historial.';
    $('#progolBody').innerHTML=progolDemo.matches.map(m=>`<tr><td>${m.n}</td><td><b>${m.home}</b><span class="subtle"> vs </span><b>${m.away}</b></td><td>${triplet(m.model)}</td><td>${triplet(m.public)}</td><td><span class="chip">${m.coverage.type}: ${m.coverage.picks.join('')}</span></td></tr>`).join('');
  }catch(e){$('#demoNotice').textContent=e.message;}
}

$('#optimizeBtn').addEventListener('click',async()=>{
  const btn=$('#optimizeBtn');
  if(!progolDemo){$('#progolResult').innerHTML='<div class="simple-note">Aún no se cargó la quiniela.</div>';return;}
  btn.disabled=true; btn.textContent='Armando combinaciones…';
  $('#progolResult').innerHTML='<div class="empty">Calculando las mejores combinaciones para tu presupuesto…</div>';
  try{
    const r=await api('/api/progol/optimize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({matches:progolDemo.matches,budget:Number($('#progolBudget').value),mode:$('#progolMode').value})});
    $('#progolResult').innerHTML=`<h3>${r.lines} combinaciones · ${money(r.spent)}</h3><p class="simple-note">Cada renglón es una quiniela completa de 9 resultados. Puedes usar una o varias según tu presupuesto.</p><div class="line-list">${r.selections.map(s=>`<div class="line-item"><b>#${s.rank}</b><span class="picks">${s.picks.join(' · ')}</span><small>Probabilidad conjunta ${pct(s.probabilityModel,3)}</small></div>`).join('')}</div><p class="simple-note" style="margin-top:12px">El premio de Progol no puede calcularse por adelantado: depende de la bolsa y de cuántos ganadores haya.</p>`;
    $('#progolResult').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    $('#progolResult').innerHTML=`<div class="simple-note"><b>No se pudieron armar las combinaciones.</b><br>${e.message}</div>`;
    $('#progolResult').scrollIntoView({behavior:'smooth',block:'start'});
  }finally{btn.disabled=false;btn.textContent='Armar combinaciones';}
});

async function settlePrediction(id){
  const hg=Number($(`#hg-${id}`).value), ag=Number($(`#ag-${id}`).value);
  if(!Number.isFinite(hg)||!Number.isFinite(ag)){alert('Ingresa el marcador final');return;}
  try{
    await api(`/api/history/predictions-audit/${id}/result`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({homeGoals:hg,awayGoals:ag})});
    await loadHistory();
  }catch(e){alert(e.message);}
}

async function loadHistory(){
  try{
    const rows=await api('/api/history/predictions-audit?limit=30');
    $('#historyList').innerHTML=rows.length?rows.map(r=>{
      const p={L:Number(r.p_home),E:Number(r.p_draw),V:Number(r.p_away)};
      const final=r.status==='final';
      const verdict=final?(r.correct?'<span class="badge-ok">Acertó</span>':'<span class="badge-warn">Falló</span>'):'<span class="chip">Pendiente</span>';
      const result=final?`Resultado real: <b>${r.home_goals}-${r.away_goals}</b> · ${outcomeName(r.actual_outcome)}`:`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px"><small>Cuando termine:</small><input id="hg-${r.id}" type="number" min="0" placeholder="Local" style="width:70px"><span>-</span><input id="ag-${r.id}" type="number" min="0" placeholder="Visit." style="width:70px"><button class="ghost settle-btn" data-id="${r.id}" type="button">Guardar resultado</button></div>`;
      return `<div class="history-item"><small>${new Date(r.created_at).toLocaleString('es-MX')}</small><div><b>${r.home_team} vs ${r.away_team}</b><br><small>FQ: L ${pct(p.L)} · E ${pct(p.E)} · V ${pct(p.V)} · Pronóstico mayor: ${outcomeName(r.predicted_outcome)}</small><br><small>${result}</small></div>${verdict}</div>`;
    }).join(''):'<div class="empty">Aún no hay pronósticos auditables. Calcula uno en Pronóstico y aparecerá aquí.</div>';
    $$('.settle-btn').forEach(b=>b.addEventListener('click',()=>settlePrediction(b.dataset.id)));
  }catch(e){$('#historyList').innerHTML=`<div class="simple-note">${e.message}</div>`;}
}
$('#loadHistoryBtn').addEventListener('click',loadHistory);

async function loadLiveDetail(fixtureId){
  $('#liveDetail').innerHTML='<div class="empty">Actualizando partido…</div>';
  try{
    const r=await api(`/api/live/match/${fixtureId}`);
    let market='<div class="simple-note">La fuente no entregó porcentajes 1X2 en vivo para este partido.</div>';
    if(r.market?.consensus){
      market=`${probCards(r.market.consensus)}<p class="simple-note" style="margin-top:10px">Estos son porcentajes implícitos del mercado en vivo, normalizados para quitar el margen de la casa.</p>`;
    }
    $('#liveDetail').innerHTML=`<div class="panel-title"><div><p class="eyebrow">EN VIVO · ${r.minute??'—'}'</p><h3>${r.home} ${r.score?.home??0} - ${r.score?.away??0} ${r.away}</h3></div><span class="pill">${r.status||'LIVE'}</span></div>${market}<p class="simple-note" style="margin-top:10px">Cada lectura se guarda en Supabase para construir después la evolución del mercado.</p>`;
    $('#liveDetail').dataset.fixtureId=fixtureId;
  }catch(e){ $('#liveDetail').innerHTML=`<div class="simple-note">${e.message}</div>`; }
}

async function loadLiveMatches(){
  const box=$('#liveMatches');
  try{
    const r=await api('/api/live/matches');
    if(!r.enabled){
      box.innerHTML=`<div class="simple-note"><b>Seguimiento en vivo aún no conectado.</b><br>${r.reason||'Falta configurar la fuente de datos en vivo.'}</div>`;
      return;
    }
    if(!r.matches?.length){
      box.innerHTML='<div class="empty">No hay partidos en vivo reportados por la fuente en este momento.</div>';
      return;
    }
    box.innerHTML=r.matches.map(m=>`<button class="history-item live-match" data-fixture="${m.fixtureId}" style="width:100%;text-align:left"><div><b>${m.home} ${m.homeGoals??0} - ${m.awayGoals??0} ${m.away}</b><br><small>${m.league||''} · ${m.minute??'—'}' · ${m.status||''}</small></div><span class="badge-ok">Abrir</span></button>`).join('');
    $$('.live-match').forEach(b=>b.addEventListener('click',()=>loadLiveDetail(b.dataset.fixture)));
  }catch(e){
    box.innerHTML=`<div class="simple-note"><b>No se pudo consultar el seguimiento en vivo.</b><br>${e.message}</div>`;
  }
}
$('#reloadLiveBtn').addEventListener('click',loadLiveMatches);

function startLiveTimer(){
  if(liveTimer) clearInterval(liveTimer);
  liveTimer=setInterval(()=>{
    if($('#view-overview').classList.contains('active')){
      loadLiveMatches();
      const id=$('#liveDetail').dataset.fixtureId;
      if(id) loadLiveDetail(id);
    }
  },30000);
}

$('#refreshBtn').addEventListener('click',()=>{health();loadDataSummary(false);loadProgol();loadLiveMatches();});

health();
loadDataSummary(true);
loadProgol();
loadLiveMatches();
startLiveTimer();
