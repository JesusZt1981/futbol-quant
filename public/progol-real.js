'use strict';

// Carga únicamente mejoras visuales estables. Las consultas a Supabase deben
// pasar por el backend de Render; nunca se llaman Edge Functions directamente
// desde el navegador para evitar CORS y mantener una sola ruta de datos.
(() => {
  if (!document.querySelector('link[data-fq-ui="stable"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './ui-fixes.css?v=1.3.4';
    link.dataset.fqUi = 'stable';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-fq-ui="stable"]')) {
    const script = document.createElement('script');
    script.src = './ui-fixes.js?v=1.3.4';
    script.defer = true;
    script.dataset.fqUi = 'stable';
    document.body.appendChild(script);
  }
})();
