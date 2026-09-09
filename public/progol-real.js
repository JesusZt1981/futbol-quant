'use strict';

// Carga únicamente mejoras visuales estables. La V03 conserva las mejoras
// actuales y restaura la capa de acceso directo a Supabase que sí cargaba
// la base de datos, evitando las Edge Functions problemáticas para el historial.
(() => {
  const BUILD_VERSION = 'V03';

  function showBuildVersion() {
    let badge = document.querySelector('#fqBuildVersion');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'fqBuildVersion';
      badge.style.cssText = 'margin-left:8px;padding:2px 7px;border:1px solid #2b4657;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.06em;color:#45e39c;background:#0d1a22;white-space:nowrap';
      const footer = document.querySelector('.sidebar-footer');
      if (footer) footer.appendChild(badge);
      else document.body.appendChild(badge);
    }
    badge.textContent = BUILD_VERSION;
    document.documentElement.dataset.fqVersion = BUILD_VERSION;
    document.title = `Fútbol Quant · ${BUILD_VERSION}`;
  }

  if (!document.querySelector('link[data-fq-ui="stable"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './ui-fixes.css?v=V03';
    link.dataset.fqUi = 'stable';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-fq-ui="stable"]')) {
    const script = document.createElement('script');
    script.src = './ui-fixes.js?v=V03';
    script.defer = true;
    script.dataset.fqUi = 'stable';
    document.body.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBuildVersion, { once: true });
  } else {
    showBuildVersion();
  }
})();
