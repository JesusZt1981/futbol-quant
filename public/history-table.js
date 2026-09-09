'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
  const outcome = (o, h, a) => o === 'L' ? `${h} (Local)` : o === 'V' ? `${a} (Visitante)` : o === 'E' ? 'Empate' : 'Pendiente';

  let controller = null;

  async function fetchJson(url, options = {}) {
    if (controller) controller.abort();
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    } finally {
      clearTimeout(timer);
      controller = null;
    }
  }

  function competitionText(r) {
    const raw = String(r.competition || '').trim();
    if (raw) return raw;
    const map = {
      liga_mx:'Liga MX', serie_a:'Serie A', premier_league:'Premier League', laliga:'LaLiga',
      bundesliga:'Bundesliga', mls:'MLS', leagues_cup:'Leagues Cup',
      uefa_champions_league:'UEFA Champions League', uefa_europa_league:'UEFA Europa League',
      uefa_conference_league:'UEFA Conference League', copa_libertadores:'Copa Libertadores',
      copa_sudamericana:'Copa Sudamericana', concacaf_champions_cup:'CONCACAF Champions Cup'
    };
    return map[r.league_key] || r.league_key || 'Por identificar';
  }

  function render(rows) {
    const box = $('#historyTableContainer');
    if (!box) return;
    if (!Array.isArray(rows) || !rows.length) {
      box.innerHTML = '<div class="empty">Aún no hay pronósticos guardados.</div>';
      return;
    }

    const body = rows.map(r => {
      const final = r.status === 'final' && r.home_goals !== null && r.away_goals !== null;
      const lectura = outcome(r.predicted_outcome, r.home_team, r.away_team);
      const ganador = final ? outcome(r.actual_outcome, r.home_team, r.away_team) : 'Pendiente';
      const acierto = final ? (r.correct ? '<span class="hist-ok">✅ Sí</span>' : '<span class="hist-no">❌ No</span>') : '<span class="hist-pending">⏳ Pendiente</span>';
      const marcador = final ? `${r.home_goals} - ${r.away_goals}` : '—';
      const action = final ? '' : `
        <div class="hist-score-entry">
          <input id="ht-h-${r.id}" type="number" min="0" step="1" placeholder="Local">
          <span>–</span>
          <input id="ht-a-${r.id}" type="number" min="0" step="1" placeholder="Visit.">
          <button class="ghost hist-save" data-id="${r.id}" type="button">Guardar resultado</button>
        </div>`;
      return `<tr>
        <td data-label="Fecha"><b>${new Date(r.created_at).toLocaleDateString('es-MX')}</b><small>${new Date(r.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</small></td>
        <td data-label="Partido"><b>${esc(r.home_team)}</b><span> vs </span><b>${esc(r.away_team)}</b></td>
        <td data-label="Competición"><b>${esc(competitionText(r))}</b></td>
        <td data-label="Probabilidades"><div class="hist-probs"><span>L <b>${pct(r.p_home)}</b></span><span>E <b>${pct(r.p_draw)}</b></span><span>V <b>${pct(r.p_away)}</b></span></div></td>
        <td data-label="Lectura FQ"><b>${esc(lectura)}</b></td>
        <td data-label="Resultado real"><b>${esc(ganador)}</b><small>Marcador: ${marcador}</small>${action}</td>
        <td data-label="¿Acertó?">${acierto}</td>
      </tr>`;
    }).join('');

    box.innerHTML = `
      <div class="hist-explainer"><b>Qué significa esta tabla</b><span>Actualizar datos busca en fuentes deportivas de internet únicamente los registros Pendientes. Cuando encuentra un resultado final, guarda marcador y competición; los registros Finalizados ya no se modifican.</span></div>
      <div class="hist-table-wrap">
        <table class="hist-table">
          <thead><tr><th>Fecha</th><th>Partido</th><th>Competición</th><th>Probabilidades FQ</th><th>Lectura FQ</th><th>Resultado real</th><th>¿Acertó?</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  async function load() {
    const box = $('#historyTableContainer');
    if (!box) return;
    box.innerHTML = '<div class="empty">Cargando historial…</div>';
    try {
      render(await fetchJson('/api/history/predictions-audit?limit=50'));
    } catch (e) {
      box.innerHTML = `<div class="simple-note">${esc(e?.name === 'AbortError' ? 'La consulta tardó demasiado.' : e.message)}</div>`;
    }
  }

  async function saveResult(btn) {
    const id = btn.dataset.id;
    const h = $(`#ht-h-${id}`), a = $(`#ht-a-${id}`);
    const hv = h?.value?.trim() ?? '', av = a?.value?.trim() ?? '';
    if (hv === '' || av === '') return alert('Escribe los dos marcadores finales.');
    const homeGoals = Number(hv), awayGoals = Number(av);
    if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) return alert('Los goles deben ser enteros de 0 en adelante.');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await fetchJson(`/api/history/predictions-audit/${encodeURIComponent(id)}/result`, {
        method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({homeGoals,awayGoals})
      });
      await load();
    } catch (e) {
      alert(e.message || 'No se pudo guardar el resultado');
      btn.disabled = false; btn.textContent = 'Guardar resultado';
    }
  }

  window.fqReloadHistoryTable = load;

  function init() {
    $('.nav-btn[data-view="history"]')?.addEventListener('click', () => setTimeout(load, 0));
    $('#historyReloadTable')?.addEventListener('click', load);
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.hist-save');
      if (btn) saveResult(btn);
    });
    if ($('#view-history')?.classList.contains('active')) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();