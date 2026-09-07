'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const PROGOL_REAL_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-progol-live';
let progolDemo = null;
let dataSummary = [];
let activeRequest = new Map();

function pct(v,d=1){ return `${(Number(v)*100).toFixed(d)}%`; }
function money(v){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(v||0)); }
function fmtDate(v){ if(!v)return '—'; return new Date(v).toLocaleDateString('es-MX',{year:'numeric',month:'short',day:'numeric'}); }
function outcomeName(v){ return v==='L'?'Local':v==='E'?'Empate':v==='V'?'Visitante':'—'; }

async function api(url,options={},timeoutMs=12000,key=null){
  if(key && activeRequest.has(key)) activeRequest.get(key).abort();
  const controller=new AbortController();
  if(key) activeRequest.set(key,controller);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:controller.signal,cache:options.cache||'no-store'});
    const text=await r.text();
    let j={};
    try{j=text?JSON.parse(text):{};}catch{throw new Error(`Respuesta inválida del servidor (${r.status})`);}
    if(!r.ok)throw new Error(j.error||`Error HTTP ${r.status}`);
    return j;
  }catch(e){
    if(e.name==='AbortError') throw new Error('La consulta tardó demasiado. Intenta de nuevo.');
    throw e;
  }finally{
    clearTimeout(timer);
    if(key && activeRequest.get(key)===controller) activeRequest.delete(key);
  }
}

function setView(view){
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  const b=$(`.nav-btn[data-view="${view}"]`);
  $('#pageTitle').textContent=b?.textContent||'Fútbol Quant';
  window.scrollTo({top:0,behavior:'auto'});
  if(view==='history') loadHistory();
  if(view==='data') loadDataSummary();
  if(view==='progol') loadProgol();
  if(view==='overview') loadLiveMatches();
}
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

async function health(){
  try{
    const d=await api('/api/health',{},8000,'health');
    $('#healthDot').className='dot ok';
    $('#healthText').textContent=`Base persistente · v${d.version}`;
    $('#appVersion').textContent=`v${d.version}`;
  }catch(e){
    $('#healthDot').className='dot';
    $('#healthText').textContent='Sin conexión';
  }
}

function renderDataSummary(rows){
  dataSummary=Array.isArray(rows)?rows:[];
  const total=dataSummary.reduce((s,r)=>s+Number(r.finished||0),0);
  $('#totalMatches').textContent=total.toLocaleString('es-MX');
  $('#totalLeagues').textContent=dataSummary.length.toLocaleString('es-MX');
  const names={liga_mx:'Liga MX',laliga:'LaLiga',serie_a:'Serie A',premier_league:'Premier League',bundesliga:'Bundesliga',primeira_liga:'Primeira Liga',mls:'MLS',argentina_primera:'Argentina Primera',uefa_champions_league:'UEFA Champions League',uefa_europa_league:'UEFA Europa League',uefa_conference_league:'UEFA Conference League',concacaf_champions_cup:'CONCACAF Champions Cup',leagues_cup:'Leagues Cup',copa_libertadores:'Copa Libertadores',copa_sudamericana:'Copa Sudamericana'};
  const sorted=[...dataSummary].sort((a,b)=>String(names[a.league_key]||a.competition||a.league_key).localeCompare(String(names[b.league_key]||b.competition||b.league_key),'es'));
  $('#dataSummary').innerHTML=sorted.length?sorted.map(r=>`<div class="history-item"><div><b>${names[r.league_key]||r.competition||r.league_key}</b><br><small>${Number(r.finished||0).toLocaleString('es-MX')} partidos · ${fmtDate(r.from)} a ${fmtDate(r.to)}</small></div><span class="badge-ok">Listo</span></div>`).join(''):'<div class="empty">No se pudo leer historial todavía.</div>';
  const league=$('#leagueSelect');
  const current=league.value;
  league.innerHTML='<option value="">Selecciona competición…</option>'+sorted.map(r=>`<option value="${r.league_key}">${names[r.league_key]||r.competition||r.league_key}</option>`).join('');
  if(sorted.some(r=>r.league_key===current))league.value=current;
  $('#bootstrapStatus').textContent=sorted.length?`Base disponible: ${total.toLocaleString('es-MX')} partidos en ${sorted.length} competiciones.`:'La base no respondió.';
}

async function loadDataSummary(){
  try{renderDataSummary(await api('/api/data/summary',{},12000,'summary'));}
  catch(e){
    $('#dataSummary').innerHTML=`<div class="simple-note">No se pudo leer la base: ${e.message}</div>`;
    $('#bootstrapStatus').textContent=`Error: ${e.message}`;
  }
}

async function bootstrapData(){
  const btn=$('#bootstrapBtn');
  if(btn){btn.disabled=true;btn.textContent='Actualizando…';}
  $('#bootstrapStatus').textContent='Comprobando la base histórica…';
  try{
    const r=await api('/api/data/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'all'})},15000,'bootstrap');
    $('#bootstrapStatus').textContent=`Base comprobada: ${Number(r.total_rows||0).toLocaleString('es-MX')} registros en ${Number(r.competitions||0)} competiciones.`;
    await loadDataSummary();
  }catch(e){$('#bootstrapStatus').textContent=`No se pudo actualizar: ${e.message}`;}
  finally{if(btn){btn.disabled=false;btn.textContent='Cargar / actualizar historial';}}
}
$('#bootstrapBtn')?.addEventListener('click',bootstrapData);

$('#leagueSelect')?.addEventListener('change',async(e)=>{
  const league=e.target.value;
  $('#homeSelect').innerHTML='<option value="">Selecciona…</option>';
  $('#awaySelect').innerHTML='<option value="">Selecciona…</option>';
  if(!league)return;
  $('#homeSelect').innerHTML='<option value="">Cargando equipos…</option>';
  $('#awaySelect').innerHTML='<option value="">Cargando equipos…</option>';
  try{
    const teams=await api(`/api/data/teams/${encodeURIComponent(league)}`,{},12000,'teams');
    const opts='<option value="">Selecciona…</option>'+teams.map(t=>`<option>${t}</option>`).join('');
    $('#homeSelect').innerHTML=opts; $('#awaySelect').innerHTML=opts;
  }catch(e){
    $('#homeSelect').innerHTML='<option value="">Error al cargar</option>';
    $('#awaySelect').innerHTML='<option value="">Error al cargar</option>';
  }
});

function probCards(p){
  const vals=[['Gana local',p.L],['Empate',p.E],['Gana visitante',p.V]],best=Math.max(...vals.map(x=>x[1]));
  return `<div class="prob-grid">${vals.map(([n,v])=>`<div class="prob-card ${v===best?'best':''}"><span>${n}</span><strong>${pct(v)}</strong></div>`).join('')}</div>`;
}

$('#predictForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const league=$('#leagueSelect').value,home=$('#homeSelect').value,away=$('#awaySelect').value;
  if(!league||!home||!away||home===away){$('#predictResult').innerHTML='<div class="simple-note">Selecciona competición, local y visitante distintos.</div>';return;}
  $('#predictResult').innerHTML='<div class="empty">Calculando con el historial real…</div>';
  try{
    const r=await api('/api/predict/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league,home,away})},25000,'predict');
    const p=r.probabilities,best=Math.max(p.L,p.E,p.V); $('#betProb').value=(best*100).toFixed(1);
    $('#predictResult').innerHTML=`<div class="panel-title"><div><p class="eyebrow">RESULTADO</p><h3>${home} vs ${away}</h3></div><span class="pill">${r.sample?.league||0} de base</span></div>${probCards(p)}<div class="payoff-grid"><div><span>Goles esperados local</span><strong>${Number(r.goals.home).toFixed(2)}</strong></div><div><span>Goles esperados visitante</span><strong>${Number(r.goals.away).toFixed(2)}</strong></div><div><span>Más de 2.5 goles</span><strong>${pct(r.over25)}</strong></div></div><p class="simple-note" style="margin-top:12px">${r.methodology||''}</p><p class="simple-note" style="margin-top:10px"><b>Guardado para auditoría:</b> ${r.auditId?'sí':'no'}. Resultado con mayor probabilidad: ${outcomeName(r.predictedOutcome)}.</p>`;
  }catch(err){$('#predictResult').innerHTML=`<div class="simple-note">${err.message}</div>`;}
});

$('#betForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const p=Number($('#betProb').value)/100,amount=Number($('#betAmount').value),ret=Number($('#houseReturn100').value),mult=ret/100,total=amount*mult,profit=total-amount,min=1/mult,edge=p-min;
  $('#betResult').innerHTML=`<div class="panel-title"><div><p class="eyebrow">LECTURA SIMPLE</p><h3>${edge>0?'El pago supera el mínimo matemático':'El pago queda corto para nuestra probabilidad'}</h3></div></div><div class="payoff-grid"><div><span>Arriesgas</span><strong>${money(amount)}</strong></div><div><span>Si ganas recibes</span><strong>${money(total)}</strong></div><div><span>Ganancia neta</span><strong>${money(profit)}</strong></div></div><p class="simple-note">FQ estima ${pct(p)}. Ese pago exige aproximadamente ${pct(min)} para quedar tablas a largo plazo.</p>`;
});

function triplet(obj){return `<div class="triplet">${['L','E','V'].map(k=>`<span class="chip">${k} ${pct(obj[k])}</span>`).join('')}</div>`;}

async function loadProgol(){
  const notice=$('#demoNotice');
  if(notice){notice.style.display='block';notice.className='notice';notice.textContent='Calculando con la base real…';}
  try{
    const d=await api(PROGOL_REAL_URL,{},15000,'progol');
    progolDemo=d;
    const allReal=d.status==='REAL_MODEL'&&d.matches?.every(m=>m.model&&m.coverage);
    if(notice){if(allReal)notice.style.display='none';else{notice.style.display='block';notice.className='notice danger';notice.textContent=d.notice||'Hay partidos sin datos suficientes.';}}
    $('#progolBody').innerHTML=(d.matches||[]).map(m=>m.model?`<tr><td>${m.n}</td><td><b>${m.home}</b><span class="subtle"> vs </span><b>${m.away}</b><br><small>${m.competition||''} · ${m.season||''}</small></td><td>${triplet(m.model)}</td><td>${triplet(m.public)}</td><td><span class="chip">${m.coverage.type}: ${m.coverage.picks.join('')}</span></td></tr>`:`<tr><td>${m.n}</td><td>${m.home} vs ${m.away}</td><td colspan="3"><span class="badge-warn">Sin datos suficientes</span></td></tr>`).join('');
  }catch(e){if(notice){notice.style.display='block';notice.className='notice danger';notice.textContent=`No se pudo cargar Progol: ${e.message}`;}}
}

$('#optimizeBtn')?.addEventListener('click',async()=>{
  const out=$('#progolResult');
  if(!progolDemo){out.innerHTML='<div class="simple-note">Primero carga la quiniela.</div>';return;}
  try{
    const r=await api('/api/progol/optimize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({matches:progolDemo.matches,budget:Number($('#progolBudget').value),mode:$('#progolMode').value,lineCost:15})},12000,'optimize');
    out.innerHTML=`<h3>${r.lines} combinaciones · ${money(r.spent)}</h3><div class="line-list">${r.selections.map(s=>`<div class="line-item"><b>#${s.rank}</b><span>${s.picks.join(' · ')}</span><small>${pct(s.probabilityModel,3)}</small></div>`).join('')}</div>`;
  }catch(e){out.innerHTML=`<div class="simple-note">${e.message}</div>`;}
});

async function settlePrediction(id){
  const h=$(`#hg-${id}`),a=$(`#ag-${id}`),hv=h?.value?.trim()||'',av=a?.value?.trim()||'';
  if(hv===''||av===''){alert('Ingresa ambos marcadores finales');return;}
  try{await api(`/api/history/predictions-audit/${encodeURIComponent(id)}/result`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({homeGoals:Number(hv),awayGoals:Number(av)})},12000,'settle');await loadHistory();}
  catch(e){alert(e.message);}
}

async function loadHistory(){
  try{
    const rows=await api('/api/history/predictions-audit?limit=30',{},12000,'history');
    $('#historyList').innerHTML=rows.length?rows.map(r=>{const final=r.status==='final',winner=final?outcomeName(r.actual_outcome):'Pendiente',verdict=final?(r.correct?'Acertó':'No acertó'):'Pendiente';return `<div class="history-item"><small>${new Date(r.created_at).toLocaleString('es-MX')}</small><div><b>${r.home_team} vs ${r.away_team}</b><br><small>FQ: L ${pct(r.p_home)} · E ${pct(r.p_draw)} · V ${pct(r.p_away)} · Lectura: ${outcomeName(r.predicted_outcome)}</small><br>${final?`<small>Marcador: ${r.home_goals}-${r.away_goals} · Ganó: ${winner} · ${verdict}</small>`:`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px"><input id="hg-${r.id}" type="number" min="0" placeholder="Local" style="width:70px"><span>-</span><input id="ag-${r.id}" type="number" min="0" placeholder="Visit." style="width:70px"><button class="ghost settle-btn" data-id="${r.id}" type="button">Registrar marcador final</button></div>`}</div><span class="${final&&r.correct?'badge-ok':'chip'}">${verdict}</span></div>`;}).join(''):'<div class="empty">Aún no hay pronósticos.</div>';
    $$('.settle-btn').forEach(b=>b.addEventListener('click',()=>settlePrediction(b.dataset.id)));
  }catch(e){$('#historyList').innerHTML=`<div class="simple-note">${e.message}</div>`;}
}
$('#loadHistoryBtn')?.addEventListener('click',loadHistory);

async function loadLiveDetail(id){
  $('#liveDetail').innerHTML='<div class="empty">Actualizando partido…</div>';
  try{
    const r=await api(`/api/live/match/${id}`,{},10000,'live-detail');
    const market=r.market?.consensus?probCards(r.market.consensus):'<div class="simple-note">Sin porcentajes 1X2 en vivo disponibles.</div>';
    $('#liveDetail').innerHTML=`<div class="panel-title"><div><p class="eyebrow">EN VIVO · ${r.minute??'—'}'</p><h3>${r.home} ${r.score?.home??0} - ${r.score?.away??0} ${r.away}</h3></div></div>${market}`;
  }catch(e){$('#liveDetail').innerHTML=`<div class="simple-note">${e.message}</div>`;}
}

async function loadLiveMatches(){
  const box=$('#liveMatches');
  if(!box)return;
  box.innerHTML='<div class="empty">Consultando partidos en vivo…</div>';
  try{
    const r=await api('/api/live/matches',{},8000,'live');
    if(!r.enabled){box.innerHTML=`<div class="simple-note"><b>Seguimiento en vivo aún no conectado.</b><br>${r.reason||''}</div>`;return;}
    if(!r.matches?.length){box.innerHTML='<div class="empty">No hay partidos en vivo reportados ahora.</div>';return;}
    box.innerHTML=r.matches.map(m=>`<button class="history-item live-match" data-fixture="${m.fixtureId}" style="width:100%;text-align:left"><div><b>${m.home} ${m.homeGoals??0} - ${m.awayGoals??0} ${m.away}</b><br><small>${m.league||''} · ${m.minute??'—'}'</small></div><span class="badge-ok">Abrir</span></button>`).join('');
    $$('.live-match').forEach(b=>b.addEventListener('click',()=>loadLiveDetail(b.dataset.fixture)));
  }catch(e){box.innerHTML=`<div class="simple-note">${e.message}</div>`;}
}
$('#reloadLiveBtn')?.addEventListener('click',loadLiveMatches);

$('#refreshBtn')?.addEventListener('click',()=>{
  health();
  loadDataSummary();
  const active=$('.view.active')?.id||'';
  if(active==='view-progol')loadProgol();
  if(active==='view-history')loadHistory();
  if(active==='view-overview')loadLiveMatches();
});

// Inicio ligero: solo dos consultas. No hay timers ni refrescos automáticos continuos.
health();
loadDataSummary();
setTimeout(loadLiveMatches,250);
