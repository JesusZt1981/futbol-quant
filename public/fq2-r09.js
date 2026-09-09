'use strict';
api=async function(path,payload){
  const r=await fetch(`${BASE}/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}};
  if(!r.ok){
    const parts=[d.error||`HTTP ${r.status}`];
    if(d.stage)parts.push(`etapa: ${d.stage}`);
    if(d.code)parts.push(`código: ${d.code}`);
    if(d.details)parts.push(`detalle: ${d.details}`);
    if(d.hint)parts.push(`hint: ${d.hint}`);
    throw new Error(parts.join(' · '));
  }
  return d;
};
window.addEventListener('DOMContentLoaded',()=>{const v=document.querySelector('.version');if(v)v.textContent='R09';console.info('[Fútbol Quant] R09 diagnóstico activo')});
