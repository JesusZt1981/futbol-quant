'use strict';

let predTeams=[];

function predPct(v){return v==null?'—':`${v}%`}
function predNum(v){return v==null?'—':v}

function predFillCompetitions(){
  const sel=$('#predCompetition');
  if(!sel||!state.catalog?.length)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Todas</option>'+state.catalog.map(x=>`<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}

async function predLoadCatalog(){
  if(predTeams.length){predRenderTeams();predFillCompetitions();return;}
  $('#predStatus').textContent='Cargando equipos…';
  try{
    const d=await perfApi({action:'catalog'});
    predTeams=d.teams||[];
    predRenderTeams();
    predFillCompetitions();
    $('#predStatus').textContent=`${predTeams.length} equipos disponibles.`;
  }catch(e){$('#predStatus').textContent=`Error: ${e.message}`}
}

function predRenderTeams(){
  const opts='<option value="">Selecciona…</option>'+predTeams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${t.matches})</option>`).join('');
  $('#predHome').innerHTML=opts;
  $('#predAway').innerHTML=opts;
  const gala=predTeams.find(t=>t.name==='Galatasaray');
  const barca=predTeams.find(t=>t.name==='Barcelona');
  if(gala)$('#predHome').value=gala.id;
  if(barca)$('#predAway').value=barca.id;
  const ucl=state.catalog?.find(x=>x.key==='uefa_champions_league');
  if(ucl)$('#predCompetition').value=ucl.key;
}

function predMetric(label,h,a){
  const f=v=>v==null?'—':v;
  return `<tr><td>${esc(label)}</td><td><b>${esc(f(h))}</b></td><td>${esc(f(a))}</td></tr>`;
}

async function runPrediction(){
  const home=$('#predHome').value, away=$('#predAway').value;
  if(!home||!away)return $('#predStatus').textContent='Selecciona equipo local y visitante.';
  if(home===away)return $('#predStatus').textContent='Los equipos deben ser diferentes.';
  $('#predStatus').textContent='Calculando pronóstico experimental…';
  $('#predResult').classList.add('hidden');
  try{
    const d=await perfApi({action:'predict',home_team_id:home,away_team_id:away,competition_key:$('#predCompetition').value||null,limit:Number($('#predLimit').value)});
    if(!d.ok)throw new Error(d.error||'No se pudo calcular');
    const p=d.prediction||{},eh=d.evidence?.home||{},ea=d.evidence?.away||{};
    $('#predMatchTitle').textContent=`${d.home?.name||'Local'} vs ${d.away?.name||'Visitante'}`;
    $('#predWarning').textContent=d.warning?`⚠️ ${d.warning}`:'Muestra suficiente para cálculo preliminar.';
    $('#predCards').innerHTML=`
      <article class="card mini"><span>${esc(d.home?.name||'Local')} gana</span><strong>${predPct(p.home_win_pct)}</strong></article>
      <article class="card mini"><span>Empate</span><strong>${predPct(p.draw_pct)}</strong></article>
      <article class="card mini"><span>${esc(d.away?.name||'Visitante')} gana</span><strong>${predPct(p.away_win_pct)}</strong></article>
      <article class="card mini"><span>Ambos marcan</span><strong>${predPct(p.btts_yes_pct)}</strong></article>
      <article class="card mini"><span>Más de 2.5 goles</span><strong>${predPct(p.over_2_5_pct)}</strong></article>
      <article class="card mini"><span>Marcador más probable</span><strong>${esc(predNum(p.most_likely_score))}</strong></article>
      <article class="card mini"><span>Goles esperados local</span><strong>${esc(predNum(p.expected_home_goals))}</strong></article>
      <article class="card mini"><span>Goles esperados visitante</span><strong>${esc(predNum(p.expected_away_goals))}</strong></article>
      <article class="card mini"><span>Confianza de muestra</span><strong>${predPct(d.confidence_pct)}</strong></article>`;

    const hCond=d.home?.used_condition==='home'?'Solo local':'Todos';
    const aCond=d.away?.used_condition==='away'?'Solo visitante':'Todos';
    $('#predSampleInfo').innerHTML=`
      <div class="status-line"><b>${esc(d.home?.name)}</b>: ${d.home?.sample_matches??0} partido(s) usados · condición ${hCond} · disponibles como local: ${d.home?.specific_matches??0}</div>
      <div class="status-line"><b>${esc(d.away?.name)}</b>: ${d.away?.sample_matches??0} partido(s) usados · condición ${aCond} · disponibles como visitante: ${d.away?.specific_matches??0}</div>
      <div class="status-line">Modelo: ${esc(d.model||'—')}</div>`;

    $('#predEvidence').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Dato usado</th><th>${esc(d.home?.name)}</th><th>${esc(d.away?.name)}</th></tr></thead><tbody>${[
      predMetric('Goles a favor promedio',eh.avg_goals_for,ea.avg_goals_for),
      predMetric('Goles recibidos promedio',eh.avg_goals_against,ea.avg_goals_against),
      predMetric('Tiros promedio',eh.avg_shots_for,ea.avg_shots_for),
      predMetric('Tiros permitidos promedio',eh.avg_shots_against,ea.avg_shots_against),
      predMetric('Tiros a puerta promedio',eh.avg_shots_on_target_for,ea.avg_shots_on_target_for),
      predMetric('Tiros a puerta permitidos',eh.avg_shots_on_target_against,ea.avg_shots_on_target_against),
      predMetric('Posesión promedio',eh.avg_possession==null?null:`${eh.avg_possession}%`,ea.avg_possession==null?null:`${ea.avg_possession}%`)
    ].join('')}</tbody></table></div>`;

    $('#predResult').classList.remove('hidden');
    $('#predStatus').textContent='Pronóstico calculado.';
  }catch(e){$('#predStatus').textContent=`Error: ${e.message}`}
}

const r15ShowBase=perfShowView;
perfShowView=function(which){
  const pred=$('#predictionView');if(pred)pred.classList.add('hidden');
  const navPred=$('#navPrediction');if(navPred)navPred.classList.remove('active');
  if(which==='prediction'){
    for(const id of ['searchView','savedView','adminView','performanceView']){const el=$(`#${id}`);if(el)el.classList.add('hidden')}
    for(const id of ['navSearch','navSaved','navAdmin','navPerformance']){const el=$(`#${id}`);if(el)el.classList.remove('active')}
    pred.classList.remove('hidden');navPred.classList.add('active');predFillCompetitions();predLoadCatalog();return;
  }
  r15ShowBase(which);
};

window.addEventListener('DOMContentLoaded',()=>{
  const nav=$('.top-nav');
  if(nav&&!$('#navPrediction')){
    const b=document.createElement('button');b.id='navPrediction';b.className='nav-btn';b.type='button';b.textContent='Pronósticos';
    nav.insertBefore(b,$('#navAdmin'));
  }
  const main=document.querySelector('main.page');
  if(main&&!$('#predictionView')){
    const box=document.createElement('div');box.id='predictionView';box.className='hidden';box.innerHTML=`
      <section class="info-strip"><div><strong>Pronósticos Fútbol Quant</strong><span>Prueba experimental basada únicamente en los partidos guardados en tu base.</span></div></section>
      <section class="saved-tools card"><div class="search-grid saved-grid">
        <label><span>Equipo local</span><select id="predHome"><option value="">Cargando…</option></select></label>
        <label><span>Equipo visitante</span><select id="predAway"><option value="">Cargando…</option></select></label>
        <label><span>Competición</span><select id="predCompetition"><option value="">Todas</option></select></label>
        <label><span>Partidos a considerar</span><select id="predLimit"><option value="5">Últimos 5</option><option value="10" selected>Últimos 10</option><option value="20">Últimos 20</option><option value="0">Todos</option></select></label>
        <button id="predRun" class="primary" type="button">Generar pronóstico</button>
      </div><div id="predStatus" class="status-line">Selecciona los equipos.</div></section>
      <div id="predResult" class="hidden">
        <section class="card"><div class="section-head"><div><p class="eyebrow">PRONÓSTICO</p><h2 id="predMatchTitle">Partido</h2></div></div><div id="predWarning" class="status-line"></div><div id="predCards" class="info-grid"></div></section>
        <section class="card"><div class="section-head"><div><p class="eyebrow">MUESTRA UTILIZADA</p><h2>Qué historial tomó</h2></div></div><div id="predSampleInfo"></div></section>
        <section class="card"><div class="section-head"><div><p class="eyebrow">EVIDENCIA</p><h2>Datos que alimentaron el cálculo</h2></div></div><div id="predEvidence"></div></section>
      </div>`;
    main.appendChild(box);
  }
  $('#navPrediction').onclick=()=>perfShowView('prediction');
  $('#predRun').onclick=runPrediction;
  const v=document.querySelector('.version');if(v)v.textContent='R15';
  console.info('[Fútbol Quant] R15 · Fase 5 pronósticos experimentales');
});
