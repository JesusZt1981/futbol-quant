'use strict';

// R11 · Fase 2
// Usa solamente datos que ya llegan por las fuentes integradas.
// Expone estadísticas ampliadas guardadas en fq2_team_match_stats.

function r11Pair(h,a,key,suffix=''){
  const hv=h?.[key], av=a?.[key];
  const fmt=v=>v==null||v===''?'—':`${v}${suffix}`;
  return `${fmt(hv)}/${fmt(av)}`;
}

renderSaved=function(d){
  state.savedPage=d.page||1;
  state.savedPages=Math.max(1,d.pages||1);
  $('#savedCount').textContent=`${d.total||0} partidos`;
  $('#pageInfo').textContent=`Página ${state.savedPage} de ${state.savedPages}`;
  $('#prevPage').disabled=state.savedPage<=1;
  $('#nextPage').disabled=state.savedPage>=state.savedPages;
  $('#savedBody').innerHTML=(d.rows||[]).map(r=>{
    const h=r.stats?.home||{},a=r.stats?.away||{};
    return `<tr>
      <td>${esc(fmt(r.kickoff))}</td>
      <td>${esc(r.competition||'—')}</td>
      <td>${esc(r.home?.canonical_name||'—')}</td>
      <td><b>${esc(`${r.home_score ?? '—'}-${r.away_score ?? '—'}`)}</b></td>
      <td>${esc(r.away?.canonical_name||'—')}</td>
      <td>${esc(r11Pair(h,a,'possession_pct','%'))}</td>
      <td>${esc(r11Pair(h,a,'shots'))}</td>
      <td>${esc(r11Pair(h,a,'shots_on_target'))}</td>
      <td>${esc(r11Pair(h,a,'shots_off_target'))}</td>
      <td>${esc(r11Pair(h,a,'blocked_shots'))}</td>
      <td>${esc(r11Pair(h,a,'passes'))}</td>
      <td>${esc(r11Pair(h,a,'passes_completed'))}</td>
      <td>${esc(r11Pair(h,a,'pass_accuracy_pct','%'))}</td>
      <td>${esc(r11Pair(h,a,'accurate_long_balls'))}</td>
      <td>${esc(r11Pair(h,a,'accurate_crosses'))}</td>
      <td>${esc(r11Pair(h,a,'tackles'))}</td>
      <td>${esc(r11Pair(h,a,'interceptions'))}</td>
      <td>${esc(r11Pair(h,a,'clearances'))}</td>
      <td>${esc(r11Pair(h,a,'penalties_for'))}</td>
      <td><span class="coverage">${esc(coverage(r.coverage))}</span></td>
    </tr>`;
  }).join('')||'<tr><td colspan="20"><div class="empty">No hay partidos con esos filtros.</div></td></tr>';
};

window.addEventListener('DOMContentLoaded',()=>{
  const v=document.querySelector('.version');
  if(v)v.textContent='R11';
  console.info('[Fútbol Quant] R11 · Fase 2 activa');
});
