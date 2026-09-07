'use strict';

// Las mejoras visuales se cargan una sola vez. El Progol real se consulta
// únicamente cuando el usuario entra a la pestaña Progol o pulsa Actualizar.
(() => {
  if(!document.querySelector('link[href="./ui-fixes.css"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./ui-fixes.css';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[src="./ui-fixes.js"]')){
    const script=document.createElement('script');
    script.src='./ui-fixes.js';
    script.defer=true;
    document.body.appendChild(script);
  }
})();
