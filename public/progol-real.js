'use strict';

// Carga únicamente mejoras visuales estables. Las consultas a Supabase deben
// pasar por el backend de Render; nunca se llaman Edge Functions directamente
// desde el navegador para evitar CORS y mantener una sola ruta de datos.
(() => {
  const BUILD_VERSION = 'V02';

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
    link.href = './ui-fixes.css?v=V02';
    link.dataset.fqUi = 'stable';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-fq-ui="stable"]')) {
    const script = document.createElement('script');
    script.src = './ui-fixes.js?v=V02';
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
