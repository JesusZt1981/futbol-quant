'use strict';

// V07 conserva V06 y mejora únicamente la resolución automática de resultados:
// nombres tolerantes, ventana amplia de fechas y varias fuentes encadenadas.
(() => {
  const BUILD_VERSION = 'V07';

  function showBuildVersion() {
    let badge = document.querySelector('#fqBuildVersion');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'fqBuildVersion';
      badge.style.cssText = 'margin-left:8px;padding:2px 7px;border:1px solid #2b4657;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.06em;color:#45e39c;background:#0d1a22;white-space:nowrap';
      const footer = document.querySelector('.sidebar-footer');
      if (footer) footer.appendChild(badge); else document.body.appendChild(badge);
    }
    badge.textContent = BUILD_VERSION;
    document.documentElement.dataset.fqVersion = BUILD_VERSION;
    document.title = `Fútbol Quant · ${BUILD_VERSION}`;
  }

  function injectStyle() {
    if (document.querySelector('link[data-fq-ui="stable"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './ui-fixes.css?v=V07';
    link.dataset.fqUi = 'stable';
    document.head.appendChild(link);
  }

  function injectScript(src, marker, value) {
    if (document.querySelector(`script[${marker}="${value}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(marker, value);
    document.body.appendChild(script);
  }

  injectStyle();
  injectScript('./ui-fixes.js?v=V07', 'data-fq-ui', 'stable');
  injectScript('./history-refresh.js?v=V07', 'data-fq-history-refresh', 'v07');
  injectScript('./history-table.js?v=V07', 'data-fq-history-table', 'v07');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBuildVersion, { once: true });
  else showBuildVersion();
})();
