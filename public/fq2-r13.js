'use strict';

const PERF_BASE='https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq2-team-performance';
let perfTeams=[];

async function perfApi(payload){
  const r=await fetch(PERF_BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);
  return d;
}

function perfMetric(label,forValue,againstValue,suffix=''){
  const f=forValue==null?'—':`${forValue}${suffix}`;
  const a=againstValue==null?'—':`${againstValue}${suffix}`;
  return `<tr><td>${esc(label)}</td><td><b>${esc(f)}</b></td><td>${esc(a)}</td></tr>`;
}

function perfFillCompetitions(){
  const comp=$('#perfCompetition');
  if(!comp||!state.catalog?.length)return;
  const current=comp.value;
  comp.innerHTML='<option value="">Todas</option>'+state.catalog.map(x=>`<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('');
  if([...comp.options].some(o=>o.value===current))comp.value=current;
}

function perfShowView(which){
  for(const id of ['searchView','savedView','adminView','performanceView']){const el=$(`#${id}`);if(el)el.classList.add('hidden')}
  for(const id of ['navSearch','navSaved','navAdmin','navPerformance']){const el=$(`#${id}`);if(el)el.classList.remove('active')}
  if(which==='saved'){$('#savedView').classList.remove('hidden');$('#navSaved').classList.add('active');loadSaved(1)}
  else if(which==='admin'){$('#adminView').classList.remove('hidden');$('#navAdmin').classList.add('active')}
  else if(which==='performance'){$('#performanceView').classList.remove('hidden');$('#navPerformance').classList.add('active');perfFillCompetitions();loadPerfCatalog()}
  else{$('#searchView').classList.remove('hidden');$('#navSearch').classList.add('active')}
}

async function loadPerfCatalog(){
  const sel=$('#perfTeam');
  if(!sel)return;
  perfFillCompetitions();
  if(perfTeams.length)return;
  $('#perfStatus').textContent='Cargando equipos…';
  try{
    const d=await perfApi({action:'catalog'});
    perfTeams=d.teams||[];
    sel.innerHTML='<option value="">Selecciona un equipo…</option>'+perfTeams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${t.matches})</option>`).join('');
    perfFillCompetitions();
    $('#perfStatus').textContent=`${perfTeams.length} equipos disponibles.`;
  }catch(e){$('#perfStatus').textContent=`Error: ${e.message}`}
}

async function loadPerformance(){
  const teamId=$('#perfTeam').value;
  if(!teamId)return $('#perfStatus').textContent='Selecciona un equipo.';
  $('#perfStatus').textContent='Calculando rendimiento…';
  try{
    const d=await perfApi({action:'performance',team_id:teamId,condition:$('#perfCondition').value,competition_key:$('#perfCompetition').value||null,limit:Number($('#perfLimit').value)});
    const s=d.summary||{},a=d.averages||{};
    $('#perfTitle').textContent=d.team?.name||'Equipo';
    $('#perfSummary').innerHTML=`
      <article class="card mini"><span>Partidos</span><strong>${s.matches??0}</strong></article>
      <article class="card mini"><span>Victorias</span><strong>${s.wins??0}</strong></article>
      <article class="card mini"><span>Empates</span><strong>${s.draws??0}</strong></article>
      <article class="card mini"><span>Derrotas</span><strong>${s.losses??0}</strong></article>
      <article class="card mini"><span>% victorias</span><strong>${s.win_pct??0}%</strong></article>
      <article class="card mini"><span>Goles a favor</span><strong>${s.goals_for??0}</strong></article>
      <article class="card mini"><span>Goles recibidos</span><strong>${s.goals_against??0}</strong></article>`;
    $('#perfAverages').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Métrica promedio</th><th>Equipo</th><th>Rivales</th></tr></thead><tbody>${[
      perfMetric('Goles',s.avg_goals_for,s.avg_goals_against),
      perfMetric('Posesión',a.possession_for,a.possession_against,'%'),
      perfMetric('Tiros totales',a.shots_for,a.shots_against),
      perfMetric('Tiros a puerta',a.shots_on_target_for,a.shots_on_target_against),
      perfMetric('Tiros fuera',a.shots_off_target_for,a.shots_off_target_against),
      perfMetric('Tiros bloqueados',a.blocked_shots_for,a.blocked_shots_against),
      perfMetric('Corners',a.corners_for,a.corners_against),
      perfMetric('Pases totales',a.passes_for,a.passes_against),
      perfMetric('Pases correctos',a.passes_completed_for,a.passes_completed_against),
      perfMetric('Precisión de pase',a.pass_accuracy_for,a.pass_accuracy_against,'%'),
      perfMetric('Entradas',a.tackles_for,a.tackles_against),
      perfMetric('Intercepciones',a.interceptions_for,a.interceptions_against),
      perfMetric('Despejes',a.clearances_for,a.clearances_against),
      perfMetric('Amarillas',a.yellow_cards_for,a.yellow_cards_against),
      perfMetric('Rojas',a.red_cards_for,a.red_cards_against),
      perfMetric('xG',a.xg_for,a.xg_against)
    ].join('')}</tbody></table></div>`;
    $('#perfMatches').innerHTML=(d.matches||[]).map(m=>`<tr><td>${esc(fmt(m.kickoff))}</td><td>${esc(m.condition==='home'?'Local':'Visitante')}</td><td>${esc(m.opponent)}</td><td><b>${esc(`${m.goals_for}-${m.goals_against}`)}</b></td><td>${esc(m.result)}</td><td>${esc(m.competition)}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Sin partidos para esos filtros.</div></td></tr>';
    $('#perfStatus').textContent=`Rendimiento calculado sobre ${s.matches??0} partido(s).`;
  }catch(e){$('#perfStatus').textContent=`Error: ${e.message}`}
}

window.addEventListener('DOMContentLoaded',()=>{
  const nav=$('.top-nav');
  if(nav&&!$('#navPerformance')){
    const b=document.createElement('button');b.id='navPerformance';b.className='nav-btn';b.type='button';b.textContent='Rendimiento equipos';nav.insertBefore(b,$('#navAdmin'));
  }
  const main=document.querySelector('main.page');
  if(main&&!$('#performanceView')){
    const box=document.createElement('div');box.id='performanceView';box.className='hidden';box.innerHTML=`
      <section class="info-strip"><div><strong>Rendimiento por equipo</strong><span>Promedios calculados directamente desde los partidos guardados. No duplica datos.</span></div></section>
      <section class="saved-tools card"><div class="search-grid saved-grid">
        <label><span>Equipo</span><select id="perfTeam"><option value="">Cargando…</option></select></label>
        <label><span>Condición</span><select id="perfCondition"><option value="all">Todos</option><option value="home">Solo local</option><option value="away">Solo visitante</option></select></label>
        <label><span>Partidos</span><select id="perfLimit"><option value="5">Últimos 5</option><option value="10" selected>Últimos 10</option><option value="20">Últimos 20</option><option value="0">Todos</option></select></label>
        <label><span>Competición</span><select id="perfCompetition"><option value="">Todas</option></select></label>
        <button id="perfSearchBtn" class="primary" type="button">Ver rendimiento</button>
      </div><div id="perfStatus" class="status-line">Selecciona un equipo.</div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">RENDIMIENTO</p><h2 id="perfTitle">Equipo</h2></div></div><div id="perfSummary" class="info-grid"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">PROMEDIOS</p><h2>Equipo vs rivales</h2></div></div><div id="perfAverages"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">MUESTRA</p><h2>Partidos utilizados</h2></div></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Condición</th><th>Rival</th><th>Marcador</th><th>Resultado</th><th>Competición</th></tr></thead><tbody id="perfMatches"></tbody></table></div></section>`;
    main.appendChild(box);
  }
  $('#navSearch').onclick=()=>perfShowView('search');
  $('#navSaved').onclick=()=>perfShowView('saved');
  $('#navAdmin').onclick=()=>perfShowView('admin');
  $('#navPerformance').onclick=()=>perfShowView('performance');
  $('#perfSearchBtn').onclick=loadPerformance;
  const v=document.querySelector('.version');if(v)v.textContent='R13';
  console.info('[Fútbol Quant] R13 · Fase 3 rendimiento por equipo');
});