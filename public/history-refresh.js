'use strict';

(() => {
  const REFRESH_RESULTS_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-refresh-results';
  let running = false;

  async function refreshPendingResults(e) {
    const active = document.querySelector('.view.active')?.id || '';
    if (active !== 'view-history') return;

    e?.preventDefault?.();
    e?.stopImmediatePropagation?.();
    if (running) return;

    const btn = document.querySelector('#refreshBtn');
    const original = btn?.textContent || 'Actualizar datos';
    running = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando en internet…';
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(REFRESH_RESULTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);

      if (typeof window.fqReloadHistoryTable === 'function') {
        await window.fqReloadHistoryTable();
      }

      if (btn) {
        btn.textContent = data.settled > 0
          ? `Actualizados ${data.settled} · Pendientes ${data.stillPending}`
          : `Sin nuevos finales · Pendientes ${data.stillPending}`;
      }

      console.info('[history-refresh]', data);
    } catch (error) {
      console.error('[history-refresh]', error);
      if (btn) btn.textContent = 'Error al actualizar';
    } finally {
      setTimeout(() => {
        if (btn) {
          btn.textContent = original;
          btn.disabled = false;
        }
        running = false;
      }, 3000);
    }
  }

  function init() {
    const btn = document.querySelector('#refreshBtn');
    if (!btn || btn.dataset.historyInternetRefresh === '1') return;
    btn.dataset.historyInternetRefresh = '1';
    btn.addEventListener('click', refreshPendingResults, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();