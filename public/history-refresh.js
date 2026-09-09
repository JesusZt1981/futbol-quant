'use strict';

(() => {
  const REFRESH_RESULTS_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-refresh-results';

  async function refreshPendingResults() {
    const btn = document.querySelector('#refreshBtn');
    const active = document.querySelector('.view.active')?.id || '';
    if (active !== 'view-history') return;

    const original = btn?.textContent || 'Actualizar datos';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando resultados…';
    }

    try {
      const response = await fetch(REFRESH_RESULTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);

      if (typeof window.loadHistory === 'function') await window.loadHistory();

      if (btn) {
        btn.textContent = data.settled > 0
          ? `Actualizados ${data.settled} · Pendientes ${data.stillPending}`
          : `Sin nuevos finales · Pendientes ${data.stillPending}`;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 2500);
      }
    } catch (error) {
      if (btn) {
        btn.textContent = 'Error al actualizar';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = original; }, 2500);
      }
      console.error('[history-refresh]', error);
    }
  }

  document.querySelector('#refreshBtn')?.addEventListener('click', refreshPendingResults);
})();
