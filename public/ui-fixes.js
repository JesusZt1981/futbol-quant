'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const PROGOL_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-progol-live';

  const money = (v) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(v || 0));
  const pct = (v, d = 1) => `${(Number(v) * 100).toFixed(d)}%`;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const outcomeText = (o, home, away) => o === 'L' ? `${home} (Local)` : o === 'V' ? `${away} (Visitante)` : o === 'E' ? 'Empate' : '—';
  const pickText = (o, m) => o === 'L' ? `L · ${m.home}` : o === 'V' ? `V · ${m.away}` : 'E · Empate';

  function enhanceProgolExplanation() {
    const wrap = $('#view-progol .progol-table-wrap');
    if (wrap && !$('#progolBaseExplanation')) {
      const note = document.createElement('div');
      note.id = 'progolBaseExplanation';
      note.className = 'fq-explainer progol-base-explainer';
      note.innerHTML = `
        <div class="fq-explainer-icon">📋</div>
        <div>
          <b>Tabla base del Progol actual — no se edita</b>
          <p>Estos 9 partidos son los que trae el volante de Progol Media Semana. Fútbol Quant no elige los partidos: recalcula las probabilidades con la base histórica. Los porcentajes de “cómo juega la gente” son la referencia pública del concurso.</p>
          <p><b>L = Local · E = Empate · V = Visitante.</b> Esta tabla es la materia prima que usa el botón <i>Armar combinaciones</i>.</p>
        </div>`;
      wrap.parentNode.insertBefore(note, wrap);
    }

    const th = $$('#view-progol .progol-table thead th');
    if (th.length >= 5) {
      th[1].textContent = 'Partido / torneo';
      th[2].textContent = 'Probabilidad Fútbol Quant';
      th[3].textContent = 'Cómo juega la gente';
      th[4].textContent = 'Cobertura sugerida';
    }

    const mode = $('#progolMode');
    if (mode) {
      const labels = {
        conservative: 'Priorizar probabilidad',
        balanced: 'Equilibrado: probabilidad + valor',
        contrarian: 'Buscar sorpresa / menos popular (más riesgo)'
      };
      [...mode.options].forEach(o => { if (labels[o.value]) o.textContent = labels[o.value]; });
    }
  }

  async function fetchProgolReal() {
    const r = await fetch(PROGOL_URL, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo leer el Progol actual');
    return d;
  }

  function comboCard(selection, matches) {
    const rows = selection.picks.map((pick, i) => {
      const m = matches[i] || { n: i + 1, home: 'Local', away: 'Visitante' };
      return `<div class="combo-match">
        <span class="combo-number">${m.n || i + 1}</span>
        <div class="combo-teams"><b>${esc(m.home)} vs ${esc(m.away)}</b><small>${esc(m.competition || '')}</small></div>
        <span class="combo-pick pick-${pick.toLowerCase()}">${esc(pickText(pick, m))}</span>
      </div>`;
    }).join('');

    return `<section class="combo-card">
      <div class="combo-card-head">
        <div><span>BOLETO / LÍNEA</span><strong>#${selection.rank}</strong></div>
        <div class="combo-prob"><span>Probabilidad exacta</span><b>${pct(selection.probabilityModel, 3)}</b></div>
      </div>
      <div class="combo-matches">${rows}</div>
    </section>`;
  }

  async function optimizeFriendly(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const btn = $('#optimizeBtn');
    const out = $('#progolResult');
    if (!btn || !out) return;
    btn.disabled = true;
    btn.textContent = 'Armando combinaciones…';
    out.innerHTML = '<div class="empty">Calculando tus boletos con las probabilidades actuales…</div>';

    try {
      const data = await fetchProgolReal();
      if (!Array.isArray(data.matches) || data.matches.length !== 9 || data.matches.some(m => !m.model)) {
        throw new Error('La quiniela actual todavía tiene partidos sin cálculo suficiente.');
      }
      const budget = Number($('#progolBudget')?.value || 0);
      const mode = $('#progolMode')?.value || 'balanced';
      const r = await fetch('/api/progol/optimize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matches: data.matches, budget, mode, lineCost: 15 })
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'No se pudieron generar combinaciones');

      const coverage = (result.selections || []).reduce((s, x) => s + Number(x.probabilityModel || 0), 0);
      const modeText = mode === 'conservative'
        ? 'prioriza las líneas con mayor probabilidad según Fútbol Quant'
        : mode === 'contrarian'
          ? 'acepta más sorpresa para buscar resultados menos jugados por el público'
          : 'equilibra probabilidad del modelo y resultados menos saturados por el público';

      out.innerHTML = `
        <div class="combo-summary">
          <div><span>💵 Inversión</span><strong>${money(result.spent)}</strong><small>${result.lines} boletos × $15</small></div>
          <div><span>🎯 Cobertura modelada</span><strong>${pct(coverage, 2)}</strong><small>Probabilidad estimada de que una de estas líneas sea exacta</small></div>
          <div><span>🧠 Perfil</span><strong>${esc($('#progolMode')?.selectedOptions?.[0]?.textContent || '')}</strong><small>${esc(modeText)}</small></div>
        </div>
        <p class="simple-note combo-help"><b>Cómo leerlo:</b> cada tarjeta es un boleto completo de 9 partidos. Ya no tienes que descifrar una fila de letras: en cada partido aparece exactamente qué marcar, L, E o V y el equipo correspondiente.</p>
        <div class="combo-grid">${(result.selections || []).map(s => comboCard(s, data.matches)).join('')}</div>
        <p class="simple-note combo-help">La “probabilidad exacta” de una línea es pequeña porque exige acertar los 9 partidos al mismo tiempo. La cobertura de arriba suma las líneas distintas que estás comprando. No es garantía de premio.</p>`;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      out.innerHTML = `<div class="simple-note"><b>No se pudieron armar las combinaciones.</b><br>${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Armar combinaciones';
    }
  }

  function enhanceBetPage() {
    const view = $('#view-bet');
    if (!view) return;
    const h2 = view.querySelector('.section-intro h2');
    const introRight = view.querySelector('.section-intro > p');
    const instruction = view.querySelector('.section-intro + .simple-note');
    if (h2) h2.textContent = '¿Me conviene esta apuesta?';
    if (introRight) introRight.textContent = 'Lo traducimos a pesos, porcentaje y una respuesta sencilla.';
    if (instruction) instruction.innerHTML = '<b>En palabras simples:</b> Fútbol Quant estima una probabilidad. Tú escribes cuánto arriesgas y cuánto te devuelve la casa si ganas. Nosotros comparamos ambas cosas y te decimos si matemáticamente el pago alcanza o se queda corto.';

    const pLabel = $('#betProb')?.closest('.field')?.querySelector('label');
    const aLabel = $('#betAmount')?.closest('.field')?.querySelector('label');
    const rLabel = $('#houseReturn100')?.closest('.field')?.querySelector('label');
    if (pLabel) pLabel.textContent = '🧠 1. Probabilidad que calculó Fútbol Quant (%)';
    if (aLabel) aLabel.textContent = '💵 2. ¿Cuánto dinero vas a arriesgar? ($)';
    if (rLabel) rLabel.textContent = '🏠 3. Por cada $100 apostados, ¿cuánto te devuelve la casa EN TOTAL si ganas?';

    const grid = view.querySelector('.grid.two.align-start');
    if (grid && !$('#betVisualGuide')) {
      const guide = document.createElement('div');
      guide.id = 'betVisualGuide';
      guide.className = 'bet-visual-guide span-all';
      guide.innerHTML = `
        <div><span>🧠</span><b>FQ dice 55%</b><small>55 de cada 100 escenarios</small></div>
        <div class="guide-arrow">→</div>
        <div><span>💵</span><b>Tú arriesgas $100</b><small>si pierdes, pierdes esos $100</small></div>
        <div class="guide-arrow">→</div>
        <div><span>🏠</span><b>La casa devuelve $190</b><small>$100 tuyos + $90 de ganancia</small></div>`;
      grid.parentNode.insertBefore(guide, grid);
    }
  }

  function betFriendly(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const probability = Number($('#betProb')?.value) / 100;
    const amount = Number($('#betAmount')?.value);
    const return100 = Number($('#houseReturn100')?.value);
    const out = $('#betResult');
    if (!out) return;
    if (!(probability > 0 && probability < 1) || !(amount > 0) || !(return100 > 100)) {
      out.innerHTML = '<div class="simple-note">Revisa los tres datos: probabilidad entre 1% y 99%, dinero mayor a $0 y devolución total mayor a $100 por cada $100 apostados.</div>';
      return;
    }

    const multiplier = return100 / 100;
    const totalReturn = amount * multiplier;
    const netProfit = totalReturn - amount;
    const implied = 1 / multiplier;
    const edge = probability - implied;
    const ev = probability * netProfit - (1 - probability) * amount;

    let icon = '🔴', title = 'El pago NO compensa nuestra probabilidad', cls = 'bet-bad';
    if (edge >= 0.05) { icon = '🟢'; title = 'Sí hay una ventaja matemática clara'; cls = 'bet-good'; }
    else if (edge >= 0.02) { icon = '🟡'; title = 'Hay una ventaja pequeña'; cls = 'bet-mid'; }
    else if (edge > 0) { icon = '🟡'; title = 'Está demasiado justa'; cls = 'bet-mid'; }

    const evText = ev >= 0
      ? `En muchas apuestas idénticas, el promedio matemático sería <b>+${money(ev)}</b> por cada ${money(amount)} arriesgados.`
      : `En muchas apuestas idénticas, el promedio matemático sería <b>${money(ev)}</b> por cada ${money(amount)} arriesgados.`;

    out.innerHTML = `
      <div class="bet-verdict ${cls}"><span>${icon}</span><div><small>RESPUESTA SIMPLE</small><h3>${title}</h3></div></div>
      <div class="bet-story">
        <div><span>🧠 Fútbol Quant</span><strong>${pct(probability)}</strong><small>estima ${Math.round(probability * 100)} aciertos de cada 100 escenarios parecidos</small></div>
        <div><span>🏠 Lo que exige el pago</span><strong>${pct(implied)}</strong><small>necesitas acertar al menos este porcentaje para quedar tablas a largo plazo</small></div>
        <div><span>⚖️ Diferencia</span><strong>${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)} puntos</strong><small>${edge > 0 ? 'FQ está por arriba del mínimo' : 'FQ está por debajo del mínimo'}</small></div>
      </div>
      <div class="bet-money-flow">
        <div><span>💵 Arriesgas</span><strong>${money(amount)}</strong></div>
        <div class="guide-arrow">→</div>
        <div><span>✅ Si ganas, recibes</span><strong>${money(totalReturn)}</strong><small>de los cuales ${money(netProfit)} son ganancia</small></div>
        <div class="guide-arrow">·</div>
        <div><span>❌ Si pierdes</span><strong>-${money(amount)}</strong></div>
      </div>
      <p class="simple-note"><b>Valor esperado explicado:</b> ${evText} Esto sirve para comparar apuestas, no para asegurar el resultado de una sola.</p>`;
  }

  async function loadFriendlyHistory() {
    const list = $('#historyList');
    if (!list) return;
    list.innerHTML = '<div class="empty">Cargando historial…</div>';
    try {
      const r = await fetch('/api/history/predictions-audit?limit=30');
      const rows = await r.json();
      if (!r.ok) throw new Error(rows.error || 'No se pudo leer el historial');
      list.innerHTML = rows.length ? rows.map(row => {
        const final = row.status === 'final';
        const prediction = outcomeText(row.predicted_outcome, row.home_team, row.away_team);
        const winner = final ? outcomeText(row.actual_outcome, row.home_team, row.away_team) : 'Aún no hay resultado';
        const accuracy = final
          ? (row.correct ? '<span class="history-accuracy ok">✅ Sí, acertó</span>' : '<span class="history-accuracy bad">❌ No acertó</span>')
          : '<span class="history-accuracy wait">⏳ Se sabrá al terminar</span>';
        const rightBadge = final
          ? `<span class="winner-badge">Ganó: ${esc(winner)}</span>`
          : '<span class="winner-badge pending">Sin resultado</span>';
        const resultBlock = final
          ? `<div class="history-result-grid">
              <div><span>Marcador final</span><strong>${Number(row.home_goals)} - ${Number(row.away_goals)}</strong></div>
              <div><span>Quién ganó</span><strong>${esc(winner)}</strong></div>
              <div><span>¿La lectura FQ acertó?</span><strong>${accuracy}</strong></div>
            </div>`
          : `<div class="history-pending-result">
              <b>Registrar el marcador cuando el partido haya terminado</b>
              <small>Mientras no escribas ambos marcadores, Fútbol Quant NO marcará “Acertó” ni “Falló”.</small>
              <div class="score-entry">
                <label>${esc(row.home_team)} <input id="hg-${row.id}" type="number" min="0" step="1" placeholder="Goles"></label>
                <span>–</span>
                <label>${esc(row.away_team)} <input id="ag-${row.id}" type="number" min="0" step="1" placeholder="Goles"></label>
                <button class="ghost settle-btn" data-id="${row.id}" type="button">Registrar marcador final</button>
              </div>
            </div>`;
        return `<div class="history-card">
          <div class="history-card-top"><small>${new Date(row.created_at).toLocaleString('es-MX')}</small>${rightBadge}</div>
          <h3>${esc(row.home_team)} vs ${esc(row.away_team)}</h3>
          <div class="history-prediction-line"><span>Lectura FQ:</span><b>${esc(prediction)}</b><small>L ${pct(row.p_home)} · E ${pct(row.p_draw)} · V ${pct(row.p_away)}</small></div>
          ${resultBlock}
        </div>`;
      }).join('') : '<div class="empty">Aún no hay pronósticos. Calcula uno en la pestaña Pronóstico.</div>';
    } catch (err) {
      list.innerHTML = `<div class="simple-note">${esc(err.message)}</div>`;
    }
  }

  async function settleStrict(e) {
    const btn = e.target.closest('.settle-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = btn.dataset.id;
    const h = $(`#hg-${id}`), a = $(`#ag-${id}`);
    const hv = h?.value?.trim() ?? '', av = a?.value?.trim() ?? '';
    if (hv === '' || av === '') {
      alert('Escribe LOS DOS marcadores finales. Dejar una casilla vacía ya no se interpreta como 0.');
      return;
    }
    const hg = Number(hv), ag = Number(av);
    if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) {
      alert('Los goles deben ser números enteros de 0 en adelante.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const r = await fetch(`/api/history/predictions-audit/${encodeURIComponent(id)}/result`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ homeGoals: hg, awayGoals: ag })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar el marcador');
      await loadFriendlyHistory();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Registrar marcador final';
    }
  }

  function init() {
    enhanceProgolExplanation();
    enhanceBetPage();

    const optimize = $('#optimizeBtn');
    if (optimize) optimize.addEventListener('click', optimizeFriendly, true);

    const bet = $('#betForm');
    if (bet) bet.addEventListener('submit', betFriendly, true);

    document.addEventListener('click', settleStrict, true);

    const histNav = $('.nav-btn[data-view="history"]');
    if (histNav) histNav.addEventListener('click', () => setTimeout(loadFriendlyHistory, 0));

    const reload = $('#loadHistoryBtn');
    if (reload) reload.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      loadFriendlyHistory();
    }, true);

    const observer = new MutationObserver(() => enhanceProgolExplanation());
    const progol = $('#view-progol');
    if (progol) observer.observe(progol, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
