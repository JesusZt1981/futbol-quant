'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let progolDemo = null;
let dataSummary = [];

function pct(v, d=1){ return `${(Number(v)*100).toFixed(d)}%`; }
function money(v){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(v||0)); }
function fmtDate(v){ if(!v)return '—'; return new Date(v).toLocaleDateString('es-MX',{year:'numeric',month:'short',day:'numeric'}); }

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
  if(view==='data') loadDataSummary();
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
    </div>`).join(''):'<div class="empty">La base todavía está vacía.</div>';
  const league=$('#leagueSelect');
  const current=league.value;
  league.innerHTML='<option value="">Selecciona…</option>'+dataSummary.map(r=>`<option value="${r.league_key}">${names[r.league_key]||r.competition}</option>`).join('');
  if(dataSummary.some(r=>r.league_key===current)) league.value=current;
}

async function loadDataSummary(autoBootstrap=true){
  try{
    let rows=await api('/api/data/summary');
    renderDataSummary(rows);
    const total=(rows||[]).reduce((s,r)=>s+Number(r.finished||0),0);
    if(autoBootstrap && total===0){
      $('#bootstrapStatus').textContent='La base está vacía. Iniciando carga histórica automática…';
      await bootstrapData();
    }
  }catch(e){ $('#dataSummary').innerHTML=`<div class="simple-note">${e.message}</div>`; }
}

async function bootstrapData(){
  const btn=$('#bootstrapBtn');
  if(btn){btn.disabled=true;btn.textContent='Cargando historial…';}
  $('#bootstrapStatus').textContent='Descargando y guardando resultados reales. Puede tardar unos segundos…';
  try{
    const r=await api('/api/data/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'all'})});
    $('#bootstrapStatus').innerHTML=`<span class="badge-ok">Carga terminada.</span> Base con ${Number(r.total_rows||0).toLocaleString('es-MX')} registros.`;
    const rows=await api('/api/data/summary');
    renderDataSummary(rows);
  }catch(e){
    $('#bootstrapStatus').innerHTML=`<span class="badge-warn">No se pudo completar:</span> ${e.message}`;
  }finally{if(btn){btn.disabled=false;btn.textContent='Cargar / actualizar historial';}}
}
$('#bootstrapBtn').addEventListener('click',bootstrapData);

$('#leagueSelect').addEventListener('change',async(e)=>{
  const league=e.target.value;
  $('#homeSelect').innerHTML='<option value="">Cargando…</option>';
  $('#awaySelect').innerHTML='<option value="">Cargando…</option>';
  if(!league)return;
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
      <p class="simple-note" style="margin-top:10px">El resultado con mayor porcentaje no significa apuesta recomendada. Para eso hay que compararlo con lo que pague la casa.</p>`;
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
      <div class="prob-card"><span>Probabilidad mínima que exige ese pago</span><strong>${pct(implied)}</strong></div>
      <div class="prob-card ${edge>0?'best':''}"><span>Diferencia</span><strong>${edge>=0?'+':''}${pct(edge)}</strong></div>
    </div>
    <p class="simple-note">Valor esperado aproximado por esta apuesta: ${money(ev)}. Es una estimación matemática, no una garantía de ganancia.</p>`;
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
  if(!progolDemo)return;
  try{
    const r=await api('/api/progol/optimize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({matches:progolDemo.matches,budget:Number($('#progolBudget').value),mode:$('#progolMode').value})});
    $('#progolResult').innerHTML=`<h3>${r.lines} combinaciones · ${money(r.spent)}</h3><div class="line-list">${r.selections.map(s=>`<div class="line-item"><b>#${s.rank}</b><span class="picks">${s.picks.join(' · ')}</span><small>Probabilidad conjunta ${pct(s.probabilityModel,3)}</small></div>`).join('')}</div><p class="simple-note" style="margin-top:12px">El premio de Progol no puede calcularse por adelantado: depende de la bolsa y de cuántos ganadores haya.</p>`;
  }catch(e){$('#progolResult').innerHTML=`<div class="simple-note">${e.message}</div>`;}
});

async function loadHistory(){
  try{
    const rows=await api('/api/history/historical_predictions?limit=30');
    $('#historyList').innerHTML=rows.length?rows.map(r=>{
      const o=r.output||{}, p=o.probabilities||{};
      return `<div class="history-item"><small>${new Date(r.created_at).toLocaleString('es-MX')}</small><div><b>${o.home||'—'} vs ${o.away||'—'}</b><br><small>L ${p.L?pct(p.L):'—'} · E ${p.E?pct(p.E):'—'} · V ${p.V?pct(p.V):'—'}</small></div><span class="badge-ok">Guardado</span></div>`;
    }).join(''):'<div class="empty">Aún no hay pronósticos guardados.</div>';
  }catch(e){$('#historyList').innerHTML=`<div class="simple-note">${e.message}</div>`;}
}
$('#loadHistoryBtn').addEventListener('click',loadHistory);

$('#refreshBtn').addEventListener('click',()=>{health();loadDataSummary(false);loadProgol();});

health();
loadDataSummary(true);
loadProgol();
