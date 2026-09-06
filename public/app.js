'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
let progolDemo = null;

function pct(v, digits = 1) { return `${(Number(v) * 100).toFixed(digits)}%`; }
function money(v) { return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:2 }).format(Number(v || 0)); }
function odds(v) { return Number(v).toFixed(2); }

async function api(url, options) {
  if (window.location.protocol === 'file:') {
    throw new Error('Vista local: el diseño funciona, pero inicia npm start para activar el motor y los datos.');
  }
  const response = await fetch(url, options);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Error de servidor');
  return json;
}

function setView(view) {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  const btn = $(`.nav-btn[data-view="${view}"]`);
  $('#pageTitle').textContent = btn?.textContent || 'Fútbol Quant';
  window.scrollTo({ top:0, behavior:'smooth' });
}

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

async function health() {
  try {
    const data = await api('/api/health');
    $('#healthDot').className = 'dot ok';
    $('#healthText').textContent = `${data.store.backend} · v${data.version}`;
  } catch {
    $('#healthDot').className = 'dot';
    $('#healthText').textContent = window.location.protocol === 'file:' ? 'Vista local · inicia npm start' : 'Sin conexión';
  }
}

function probBars(m) {
  const rows = [['L',m.home],['E',m.draw],['V',m.away]];
  return rows.map(([k,p]) => `<div class="bar-row"><b>${k}</b><div class="bar"><i style="width:${p*100}%"></i></div><span>${pct(p)}</span></div>`).join('');
}

$('#modelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const payload = {
    homeXg: Number(f.get('homeXg')), awayXg: Number(f.get('awayXg')),
    features: {
      home: { restDaysDelta:Number(f.get('homeRest')), injuryImpact:Number(f.get('homeInj')), travelFatigue:Number(f.get('homeTravel')), lineupStrengthDelta:Number(f.get('homeXi')) },
      away: { restDaysDelta:Number(f.get('awayRest')), injuryImpact:Number(f.get('awayInj')), travelFatigue:Number(f.get('awayTravel')), lineupStrengthDelta:Number(f.get('awayXi')) }
    }
  };
  try {
    const r = await api('/api/model/poisson', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
    $('#modelResult').innerHTML = `
      <div class="panel-title"><div><p class="eyebrow">RESULTADO</p><h3>Probabilidades modeladas</h3></div></div>
      ${probBars(r.markets)}
      <div class="result-grid" style="margin-top:16px">
        <div class="result-stat"><span>xG ajustado local</span><strong>${r.adjustedXg.home.toFixed(2)}</strong><small class="subtle">Δ ${r.adjustedXg.adjustments.home>=0?'+':''}${r.adjustedXg.adjustments.home.toFixed(2)}</small></div>
        <div class="result-stat"><span>xG ajustado visita</span><strong>${r.adjustedXg.away.toFixed(2)}</strong><small class="subtle">Δ ${r.adjustedXg.adjustments.away>=0?'+':''}${r.adjustedXg.adjustments.away.toFixed(2)}</small></div>
        <div class="result-stat"><span>Total xG</span><strong>${r.markets.expectedGoals.total.toFixed(2)}</strong><small class="subtle">Over 2.5 ${pct(r.markets.over25)}</small></div>
      </div>
      <h4 style="margin:18px 0 8px">Cuotas justas</h4>
      <div class="triplet"><span class="chip">L ${odds(r.fairOdds.L)}</span><span class="chip">E ${odds(r.fairOdds.E)}</span><span class="chip">V ${odds(r.fairOdds.V)}</span><span class="chip">BTTS Sí ${pct(r.markets.bttsYes)}</span></div>
      <p class="subtle" style="margin-top:14px">Este cálculo es un componente del ensemble, no el pronóstico final. Los pesos contextuales deben recalibrarse con backtesting.</p>`;
  } catch (err) { $('#modelResult').innerHTML = `<p class="danger-text">${err.message}</p>`; }
});

$('#riskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const payload = {
    bankroll:Number(f.get('bankroll')), decimalOdds:Number(f.get('decimalOdds')), modelProbability:Number(f.get('prob'))/100,
    kellyMultiplier:Number(f.get('kelly')), dataQuality:Number(f.get('quality'))/100, lineupConfidence:Number(f.get('lineup'))/100
  };
  try {
    const r = await api('/api/risk/stake', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
    $('#riskResult').innerHTML = `
      <div class="panel-title"><div><p class="eyebrow">DECISIÓN</p><h3 class="${r.bet?'good-text':'warn-text'}">${r.bet?'APUESTA CANDIDATA':'NO APOSTAR'}</h3></div></div>
      <div class="result-grid">
        <div class="result-stat"><span>Edge bruto</span><strong>${pct(r.edge)}</strong><small class="subtle">modelo − implícita sin quitar vig individual</small></div>
        <div class="result-stat"><span>EV por $1</span><strong>${pct(r.ev)}</strong><small class="subtle">valor esperado</small></div>
        <div class="result-stat"><span>Stake</span><strong>${money(r.stake)}</strong><small class="subtle">${pct(r.stakePct)} del bankroll</small></div>
      </div>
      <p class="subtle" style="margin-top:14px">Kelly completo: ${pct(r.fullKelly)}. El sistema aplica Kelly fraccionado, calidad de datos y tope máximo.</p>`;
  } catch (err) { $('#riskResult').innerHTML = `<p class="danger-text">${err.message}</p>`; }
});

function triplet(obj, bestKey) {
  return `<div class="triplet">${['L','E','V'].map(k=>`<span class="chip ${k===bestKey?'best':''}">${k} ${pct(obj[k])}</span>`).join('')}</div>`;
}

function bestKey(obj) { return ['L','E','V'].sort((a,b)=>obj[b]-obj[a])[0]; }

function renderProgol() {
  if (!progolDemo) return;
  $('#demoNotice').textContent = progolDemo.notice;
  $('#progolBody').innerHTML = progolDemo.matches.map(m => {
    const values = ['L','E','V'].map(k=>({k,ratio:m.model[k]/Math.max(m.public[k],.005)})).sort((a,b)=>b.ratio-a.ratio);
    const hot = values[0];
    return `<tr>
      <td>${m.n}</td><td><b>${m.home}</b><span class="subtle"> vs </span><b>${m.away}</b></td>
      <td>${triplet(m.model,bestKey(m.model))}</td><td>${triplet(m.public,bestKey(m.public))}</td>
      <td><span class="value-chip ${hot.ratio>1.12?'hot':''}">${hot.k} ×${hot.ratio.toFixed(2)}</span></td>
      <td><span class="chip">${m.coverage.type}: ${m.coverage.picks.join('')}</span><div class="subtle">cubre ${pct(m.coverage.coverage)}</div></td>
    </tr>`;
  }).join('');
}

async function loadProgol() {
  try { progolDemo = await api('/api/demo/progol'); renderProgol(); }
  catch (err) { $('#demoNotice').textContent = err.message; }
}

$('#optimizeBtn').addEventListener('click', async () => {
  if (!progolDemo) return;
  try {
    const r = await api('/api/progol/optimize', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ matches:progolDemo.matches, budget:Number($('#progolBudget').value), mode:$('#progolMode').value }) });
    $('#progolResult').innerHTML = `
      <div class="panel-title"><div><p class="eyebrow">PORTAFOLIO DE LÍNEAS</p><h3>${r.lines} líneas · ${money(r.spent)}</h3></div><span class="pill">${r.mode}</span></div>
      <div class="line-list">${r.selections.map(s=>`<div class="line-item"><b>#${s.rank}</b><span class="picks">${s.picks.join(' · ')}</span><small>P modelo ${pct(s.probabilityModel,3)}</small><small>Valor ×${s.valueRatio.toFixed(2)}</small></div>`).join('')}</div>
      <p class="subtle" style="margin-top:12px">“Popularidad” es un proxy multiplicativo. El premio real depende del pool, número de ganadores y reglas vigentes; no debe interpretarse como pago garantizado.</p>`;
  } catch (err) { $('#progolResult').innerHTML = `<p class="danger-text">${err.message}</p>`; }
});

$('#backtestBtn').addEventListener('click', async () => {
  try {
    const payload = JSON.parse($('#backtestInput').value);
    const r = await api('/api/metrics/backtest', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
    $('#backtestResult').innerHTML = `<b>Predicciones:</b> ${r.nPredictions} · <b>Brier:</b> ${r.brier?.toFixed(4) ?? '—'} · <b>Log loss:</b> ${r.logLoss?.toFixed(4) ?? '—'} · <b>ROI:</b> ${r.roi==null?'—':pct(r.roi)} · <b>Acierto apuestas:</b> ${r.hitRate==null?'—':pct(r.hitRate)}`;
  } catch (err) { $('#backtestResult').innerHTML = `<span class="danger-text">${err.message}</span>`; }
});

async function providers() {
  try {
    const p = await api('/api/providers/status');
    const rows = [
      ['API-Football', p.apiFootball, 'partidos, stats, lesiones, jugadores, alineaciones'],
      ['The Odds API', p.oddsApi, 'cuotas y mercados multi-bookmaker'],
      ['Supabase', p.supabase, 'persistencia de snapshots y backtesting'],
      ['Progol oficial', false, 'porcentajes: integración manual/adapter pendiente']
    ];
    $('#providerStatus').innerHTML = rows.map(([name,on,desc])=>`<div class="provider-row"><div><b>${name}</b><div class="subtle">${desc}</div></div><span class="status ${on?'on':'off'}">${on?'Conectado':'Configurar'}</span></div>`).join('');
  } catch (err) { $('#providerStatus').innerHTML = `<span class="danger-text">${err.message}</span>`; }
}

$('#refreshBtn').addEventListener('click', () => { health(); loadProgol(); providers(); });

health(); loadProgol(); providers();
