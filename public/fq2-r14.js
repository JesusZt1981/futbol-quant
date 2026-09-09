'use strict';

function r14Trend(label,pct,count,total){
  const p=pct==null?'—':`${pct}%`;
  const c=count==null?'—':`${count}/${total??0}`;
  return `<tr><td>${esc(label)}</td><td><b>${esc(p)}</b></td><td>${esc(c)}</td></tr>`;
}

const r13LoadPerformance=loadPerformance;
loadPerformance=async function(){
  const teamId=$('#perfTeam').value;
  if(!teamId)return $('#perfStatus').textContent='Selecciona un equipo.';
  $('#perfStatus').textContent='Calculando rendimiento y tendencias…';
  try{
    const d=await perfApi({action:'performance',team_id:teamId,condition:$('#perfCondition').value,competition_key:$('#perfCompetition').value||null,limit:Number($('#perfLimit').value)});
    const s=d.summary||{},a=d.averages||{},t=d.trends||{};
    $('#perfTitle').textContent=d.team?.name||'Equipo';
    $('#perfSummary').innerHTML=`
      <article class="card mini"><span>Partidos</span><strong>${s.matches??0}</strong></article>
      <article class="card mini"><span>Victorias</span><strong>${s.wins??0} (${s.win_pct??0}%)</strong></article>
      <article class="card mini"><span>Empates</span><strong>${s.draws??0} (${s.draw_pct??0}%)</strong></article>
      <article class="card mini"><span>Derrotas</span><strong>${s.losses??0} (${s.loss_pct??0}%)</strong></article>
      <article class="card mini"><span>Goles a favor</span><strong>${s.goals_for??0}</strong></article>
      <article class="card mini"><span>Goles recibidos</span><strong>${s.goals_against??0}</strong></article>
      <article class="card mini"><span>Promedio goles totales</span><strong>${s.avg_total_goals??'—'}</strong></article>`;

    $('#perfTrends').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Tendencia</th><th>Porcentaje</th><th>Partidos</th></tr></thead><tbody>${[
      r14Trend('Ambos equipos marcan (BTTS)',t.btts_pct,t.btts_count,s.matches),
      r14Trend('Más de 0.5 goles',t.over_0_5_pct,t.over_0_5_count,s.matches),
      r14Trend('Más de 1.5 goles',t.over_1_5_pct,t.over_1_5_count,s.matches),
      r14Trend('Más de 2.5 goles',t.over_2_5_pct,t.over_2_5_count,s.matches),
      r14Trend('Más de 3.5 goles',t.over_3_5_pct,t.over_3_5_count,s.matches),
      r14Trend('Más de 4.5 goles',t.over_4_5_pct,t.over_4_5_count,s.matches),
      r14Trend('Equipo marca al menos 1 gol',t.team_over_0_5_pct,t.team_over_0_5_count,s.matches),
      r14Trend('Equipo marca al menos 2 goles',t.team_over_1_5_pct,t.team_over_1_5_count,s.matches),
      r14Trend('Equipo marca al menos 3 goles',t.team_over_2_5_pct,t.team_over_2_5_count,s.matches),
      r14Trend('Portería a cero',t.clean_sheets_pct,t.clean_sheets_count,s.matches),
      r14Trend('Se quedó sin marcar',t.failed_to_score_pct,t.failed_to_score_count,s.matches)
    ].join('')}</tbody></table></div>`;

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

    $('#perfMatches').innerHTML=(d.matches||[]).map(m=>`<tr><td>${esc(fmt(m.kickoff))}</td><td>${esc(m.condition==='home'?'Local':'Visitante')}</td><td>${esc(m.opponent)}</td><td><b>${esc(`${m.goals_for}-${m.goals_against}`)}</b></td><td>${esc(m.result)}</td><td>${esc(m.btts?'Sí':'No')}</td><td>${esc(m.total_goals)}</td><td>${esc(m.competition)}</td></tr>`).join('')||'<tr><td colspan="8"><div class="empty">Sin partidos para esos filtros.</div></td></tr>';
    $('#perfStatus').textContent=`Rendimiento calculado sobre ${s.matches??0} partido(s).`;
  }catch(e){$('#perfStatus').textContent=`Error: ${e.message}`}
};

window.addEventListener('DOMContentLoaded',()=>{
  const avg=$('#perfAverages')?.closest('section.card');
  if(avg&&!$('#perfTrends')){
    const sec=document.createElement('section');sec.className='card';sec.innerHTML='<div class="section-head"><div><p class="eyebrow">TENDENCIAS</p><h2>Frecuencias históricas</h2></div></div><div id="perfTrends"></div>';
    avg.parentNode.insertBefore(sec,avg);
  }
  const head=$('#perfMatches')?.closest('table')?.querySelector('thead tr');
  if(head)head.innerHTML='<th>Fecha</th><th>Condición</th><th>Rival</th><th>Marcador</th><th>Resultado</th><th>BTTS</th><th>Goles totales</th><th>Competición</th>';
  const v=document.querySelector('.version');if(v)v.textContent='R14';
  console.info('[Fútbol Quant] R14 · Fase 4 tendencias históricas');
});
