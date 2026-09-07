'use strict';

(() => {
  const SUPABASE_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co';
  // Clave pública/anon de Supabase: está diseñada para usarse desde el navegador.
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjYWJmYXZkeHh6YXVhaHBibXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTIxMzYsImV4cCI6MjEwMjk4ODEzNn0.Ai1UqX1d-kGYA_84Ts9M-VGs0vGKrb43TFR38sSVxWE';
  const ENDPOINT = `${SUPABASE_URL}/functions/v1/fq-refresh-results`;
  let running = false;

  async function refreshPendingResults() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ limit: 250 }),
        cache: 'no-store',
        signal: controller.signal
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      return d;
    } finally {
      clearTimeout(timer);
    }
  }

  async function updateVisibleData() {
    if (typeof health === 'function') await health().catch?.(() => {});
    if (typeof loadDataSummary === 'function') await loadDataSummary().catch?.(() => {});
    const active = document.querySelector('.view.active')?.id || '';
    if (active === 'view-history' && typeof loadHistory === 'function') await loadHistory().catch?.(() => {});
    if (active === 'view-progol' && typeof loadProgol === 'function') await loadProgol().catch?.(() => {});
    if (active === 'view-overview' && typeof loadLiveMatches === 'function') await loadLiveMatches().catch?.(() => {});
  }

  async function onRefresh(e) {
    const btn = e.currentTarget;
    if (running) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    running = true;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Buscando resultados pendientes…';

    try {
      const result = await refreshPendingResults();
      await updateVisibleData();
      if (result.settled > 0) {
        btn.textContent = `Actualizados ${result.settled} · Pendientes ${result.stillPending}`;
      } else {
        btn.textContent = `Sin nuevos finales · Pendientes ${result.stillPending}`;
      }
    } catch (err) {
      console.error('[refresh-results]', err);
      btn.textContent = 'No se pudo actualizar';
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
        running = false;
      }, 2500);
    }
  }

  function init() {
    const btn = document.querySelector('#refreshBtn');
    if (!btn || btn.dataset.autoResults === '1') return;
    btn.dataset.autoResults = '1';
    // Captura para reemplazar el refresco genérico anterior: primero liquida pendientes,
    // después refresca únicamente la pantalla visible.
    btn.addEventListener('click', onRefresh, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
