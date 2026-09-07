'use strict';

// Las mejoras visuales se cargan una sola vez. El Progol real se consulta
// únicamente cuando el usuario entra a la pestaña Progol o pulsa Actualizar.
(() => {
  if(!document.querySelector('link[data-fq-ui="stable"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./ui-fixes.css?v=1.3.2';
    link.dataset.fqUi='stable';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-fq-ui="stable"]')){
    const script=document.createElement('script');
    script.src='./ui-fixes.js?v=1.3.2';
    script.defer=true;
    script.dataset.fqUi='stable';
    document.body.appendChild(script);
  }
})();
