'use strict';

// R10 · Fase 1
// No agrega fuentes nuevas. Solo adapta la vista al esquema ampliado
// y corrige la lectura de possession_pct ya existente en Supabase.

function r10Possession(v){
  if(v==null||v==='') return '—';
  const n=Number(v);
  return Number.isFinite(n)?`${n}%`:String(v);
}

renderSaved=function(d){
  state.savedPage=d.page||1;
  state.savedPages=Math.max(1,d.pages||1);
  $('#savedCount').textContent=`${d.total||0} partidos`;
  $('#pageInfo').textContent=`Página ${state.savedPage} de ${state.savedPages}`;
  $('#prevPage').disabled=state.savedPage<=1;
  $('#nextPage').disabled=state.savedPage>=state.savedPages;
  $('#savedBody').innerHTML=(d.rows||[]).map(r=>`<tr>
    <td>${esc(fmt(r.kickoff))}</td>
    <td>${esc(r.competition||'—')}</td>
    <td>${esc(r.home?.canonical_name||'—')}</td>
    <td><b>${esc(`${r.home_score ?? '—'}-${r.away_score ?? '—'}`)}</b></td>
    <td>${esc(r.away?.canonical_name||'—')}</td>
    <td>${esc(val(r.stats?.home?.xg))}</td>
    <td>${esc(val(r.stats?.away?.xg))}</td>
    <td>${esc(r10Possession(r.stats?.home?.possession_pct))}</td>
    <td>${esc(`${val(r.stats?.home?.shots)}/${val(r.stats?.away?.shots)}`)}</td>
    <td>${esc(`${val(r.stats?.home?.shots_on_target)}/${val(r.stats?.away?.shots_on_target)}`)}</td>
    <td>${esc(`${val(r.stats?.home?.corners)}/${val(r.stats?.away?.corners)}`)}</td>
    <td>${esc(`${r.injuries?.home??0}/${r.injuries?.away??0}`)}</td>
    <td>${esc(r.context?.altitude_m==null?'—':`${r.context.altitude_m}m`)}</td>
    <td><span class="coverage">${esc(coverage(r.coverage))}</span></td>
  </tr>`).join('')||'<tr><td colspan="14"><div class="empty">No hay partidos con esos filtros.</div></td></tr>';
};

window.addEventListener('DOMContentLoaded',()=>{
  const v=document.querySelector('.version');
  if(v)v.textContent='R10';
  console.info('[Fútbol Quant] R10 · Fase 1 activa');
});
