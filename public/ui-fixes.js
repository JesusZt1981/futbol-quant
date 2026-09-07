'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const PROGOL_URL = 'https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-progol-live';
  const money = (v) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(v||0));
  const pct = (v,d=1) => `${(Number(v)*100).toFixed(d)}%`;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const outcomeText = (o,h,a) => o==='L'?`${h} (Local)`:o==='V'?`${a} (Visitante)`:o==='E'?'Empate':'—';
  const pickText = (o,m) => o==='L'?`L · ${m.home}`:o==='V'?`V · ${m.away}`:'E · Empate';

  function enhanceStaticUi(){
    const wrap=$('#view-progol .progol-table-wrap');
    if(wrap && !$('#progolBaseExplanation')){
      const note=document.createElement('div');
      note.id='progolBaseExplanation';
      note.className='fq-explainer progol-base-explainer';
      note.innerHTML=`<div class="fq-explainer-icon">📋</div><div><b>Tabla base del Progol actual — no se edita</b><p>Estos 9 partidos son los del volante. Fútbol Quant recalcula L / E / V con la base histórica real.</p><p><b>L = Local · E = Empate · V = Visitante.</b> Esta tabla alimenta el botón <i>Armar combinaciones</i>.</p></div>`;
      wrap.parentNode.insertBefore(note,wrap);
    }
    const th=$$('#view-progol .progol-table thead th');
    const labels=['#','Partido / torneo','Probabilidad Fútbol Quant','Cómo juega la gente','Cobertura sugerida'];
    th.forEach((x,i)=>{ if(labels[i] && x.textContent!==labels[i]) x.textContent=labels[i]; });
    const mode=$('#progolMode');
    const modes={conservative:'Priorizar probabilidad',balanced:'Equilibrado: probabilidad + valor',contrarian:'Buscar sorpresa / menos popular (más riesgo)'};
    if(mode) [...mode.options].forEach(o=>{if(modes[o.value] && o.textContent!==modes[o.value])o.textContent=modes[o.value];});

    const view=$('#view-bet');
    if(view){
      const h2=view.querySelector('.section-intro h2'); if(h2) h2.textContent='¿Me conviene esta apuesta?';
      const intro=view.querySelector('.section-intro > p'); if(intro) intro.textContent='Lo traducimos a pesos, porcentaje y una respuesta sencilla.';
      const help=view.querySelector('.section-intro + .simple-note'); if(help) help.innerHTML='<b>En palabras simples:</b> Fútbol Quant estima una probabilidad. Tú escribes cuánto arriesgas y cuánto te devolvería la casa. Nosotros te decimos si ese pago compensa el riesgo.';
      const p=$('#betProb')?.closest('.field')?.querySelector('label'); if(p)p.textContent='🧠 1. Probabilidad que calculó Fútbol Quant (%)';
      const a=$('#betAmount')?.closest('.field')?.querySelector('label'); if(a)a.textContent='💵 2. ¿Cuánto dinero vas a arriesgar? ($)';
      const r=$('#houseReturn100')?.closest('.field')?.querySelector('label'); if(r)r.textContent='🏠 3. Por cada $100 apostados, ¿cuánto devuelve la casa EN TOTAL si ganas?';
      const grid=view.querySelector('.grid.two.align-start');
      if(grid && !$('#betVisualGuide')){
        const guide=document.createElement('div'); guide.id='betVisualGuide'; guide.className='bet-visual-guide span-all';
        guide.innerHTML='<div><span>🧠</span><b>FQ dice 55%</b><small>55 de cada 100 escenarios</small></div><div class="guide-arrow">→</div><div><span>💵</span><b>Tú arriesgas $100</b><small>si pierdes, pierdes $100</small></div><div class="guide-arrow">→</div><div><span>🏠</span><b>La casa devuelve $190</b><small>$100 tuyos + $90 de ganancia</small></div>';
        grid.parentNode.insertBefore(guide,grid);
      }
    }
  }

  async function fetchJson(url,options={}){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch(url,{...options,signal:controller.signal,cache:options.cache||'no-store'});
      const d=await r.json(); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`); return d;
    }catch(e){ if(e.name==='AbortError')throw new Error('La consulta tardó demasiado. Intenta nuevamente.'); throw e; }
    finally{clearTimeout(timer);}
  }

  async function fetchProgolReal(){ return fetchJson(PROGOL_URL); }

  function comboCard(s,matches){
    return `<section class="combo-card"><div class="combo-card-head"><div><span>BOLETO / LÍNEA</span><strong>#${s.rank}</strong></div><div class="combo-prob"><span>Probabilidad exacta</span><b>${pct(s.probabilityModel,3)}</b></div></div><div class="combo-matches">${s.picks.map((pick,i)=>{const m=matches[i]||{n:i+1,home:'Local',away:'Visitante'};return `<div class="combo-match"><span class="combo-number">${m.n||i+1}</span><div class="combo-teams"><b>${esc(m.home)} vs ${esc(m.away)}</b><small>${esc(m.competition||'')}</small></div><span class="combo-pick pick-${pick.toLowerCase()}">${esc(pickText(pick,m))}</span></div>`;}).join('')}</div></section>`;
  }

  async function optimizeFriendly(e){
    e.preventDefault(); e.stopImmediatePropagation();
    const btn=$('#optimizeBtn'),out=$('#progolResult'); if(!btn||!out)return;
    btn.disabled=true; btn.textContent='Armando combinaciones…'; out.innerHTML='<div class="empty">Calculando tus boletos…</div>';
    try{
      const data=await fetchProgolReal();
      if(!Array.isArray(data.matches)||data.matches.length!==9||data.matches.some(m=>!m.model))throw new Error('Hay partidos sin cálculo suficiente.');
      const budget=Number($('#progolBudget')?.value||0),mode=$('#progolMode')?.value||'balanced';
      const result=await fetchJson('/api/progol/optimize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({matches:data.matches,budget,mode,lineCost:15}),cache:'no-store'});
      const coverage=(result.selections||[]).reduce((s,x)=>s+Number(x.probabilityModel||0),0);
      out.innerHTML=`<div class="combo-summary"><div><span>💵 Inversión</span><strong>${money(result.spent)}</strong><small>${result.lines} boletos × $15</small></div><div><span>🎯 Cobertura modelada</span><strong>${pct(coverage,2)}</strong><small>Probabilidad de que una línea sea exacta</small></div><div><span>🧠 Perfil</span><strong>${esc($('#progolMode')?.selectedOptions?.[0]?.textContent||'')}</strong></div></div><p class="simple-note combo-help"><b>Cómo leerlo:</b> cada tarjeta es un boleto completo de 9 partidos.</p><div class="combo-grid">${(result.selections||[]).map(s=>comboCard(s,data.matches)).join('')}</div><p class="simple-note combo-help">La probabilidad exacta es baja porque exige acertar los 9 partidos.</p>`;
      out.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){out.innerHTML=`<div class="simple-note"><b>No se pudieron armar las combinaciones.</b><br>${esc(err.message)}</div>`;}
    finally{btn.disabled=false;btn.textContent='Armar combinaciones';}
  }

  function betFriendly(e){
    e.preventDefault(); e.stopImmediatePropagation();
    const probability=Number($('#betProb')?.value)/100,amount=Number($('#betAmount')?.value),return100=Number($('#houseReturn100')?.value),out=$('#betResult'); if(!out)return;
    if(!(probability>0&&probability<1)||!(amount>0)||!(return100>100)){out.innerHTML='<div class="simple-note">Revisa los tres datos.</div>';return;}
    const mult=return100/100,total=amount*mult,profit=total-amount,minimum=1/mult,edge=probability-minimum,ev=probability*profit-(1-probability)*amount;
    let icon='🔴',title='El pago NO compensa nuestra probabilidad',cls='bet-bad'; if(edge>=.05){icon='🟢';title='Sí hay una ventaja matemática clara';cls='bet-good';}else if(edge>0){icon='🟡';title=edge>=.02?'Hay una ventaja pequeña':'Está demasiado justa';cls='bet-mid';}
    out.innerHTML=`<div class="bet-verdict ${cls}"><span>${icon}</span><div><small>RESPUESTA SIMPLE</small><h3>${title}</h3></div></div><div class="bet-story"><div><span>🧠 Fútbol Quant</span><strong>${pct(probability)}</strong><small>nuestra estimación</small></div><div><span>🏠 El pago exige</span><strong>${pct(minimum)}</strong><small>mínimo para quedar tablas a largo plazo</small></div><div><span>⚖️ Diferencia</span><strong>${edge>=0?'+':''}${(edge*100).toFixed(1)} puntos</strong></div></div><div class="bet-money-flow"><div><span>💵 Arriesgas</span><strong>${money(amount)}</strong></div><div class="guide-arrow">→</div><div><span>✅ Si ganas recibes</span><strong>${money(total)}</strong><small>${money(profit)} de ganancia</small></div><div class="guide-arrow">·</div><div><span>❌ Si pierdes</span><strong>-${money(amount)}</strong></div></div><p class="simple-note"><b>Promedio matemático estimado:</b> ${ev>=0?'+':''}${money(ev)} por una apuesta de ${money(amount)} repetida muchas veces en condiciones iguales.</p>`;
  }

  async function loadFriendlyHistory(){
    const list=$('#historyList'); if(!list)return; list.innerHTML='<div class="empty">Cargando historial…</div>';
    try{
      const rows=await fetchJson('/api/history/predictions-audit?limit=30');
      list.innerHTML=rows.length?rows.map(row=>{const final=row.status==='final',prediction=outcomeText(row.predicted_outcome,row.home_team,row.away_team),winner=final?outcomeText(row.actual_outcome,row.home_team,row.away_team):'Aún no hay resultado';const accuracy=final?(row.correct?'✅ Sí, acertó':'❌ No acertó'):'⏳ Se sabrá al terminar';const body=final?`<div class="history-result-grid"><div><span>Marcador final</span><strong>${Number(row.home_goals)} - ${Number(row.away_goals)}</strong></div><div><span>Quién ganó</span><strong>${esc(winner)}</strong></div><div><span>¿La lectura FQ acertó?</span><strong>${accuracy}</strong></div></div>`:`<div class="history-pending-result"><b>Registrar marcador final</b><small>Las dos casillas son obligatorias.</small><div class="score-entry"><label>${esc(row.home_team)} <input id="hg-${row.id}" type="number" min="0" step="1" placeholder="Goles"></label><span>–</span><label>${esc(row.away_team)} <input id="ag-${row.id}" type="number" min="0" step="1" placeholder="Goles"></label><button class="ghost settle-btn" data-id="${row.id}" type="button">Registrar marcador final</button></div></div>`;return `<div class="history-card"><div class="history-card-top"><small>${new Date(row.created_at).toLocaleString('es-MX')}</small><span class="winner-badge ${final?'':'pending'}">${final?`Ganó: ${esc(winner)}`:'Sin resultado'}</span></div><h3>${esc(row.home_team)} vs ${esc(row.away_team)}</h3><div class="history-prediction-line"><span>Lectura FQ:</span><b>${esc(prediction)}</b><small>L ${pct(row.p_home)} · E ${pct(row.p_draw)} · V ${pct(row.p_away)}</small></div>${body}</div>`;}).join(''):'<div class="empty">Aún no hay pronósticos.</div>';
    }catch(err){list.innerHTML=`<div class="simple-note">${esc(err.message)}</div>`;}
  }

  async function settleStrict(e){
    const btn=e.target.closest('.settle-btn'); if(!btn)return; e.preventDefault(); e.stopImmediatePropagation();
    const id=btn.dataset.id,h=$(`#hg-${id}`),a=$(`#ag-${id}`),hv=h?.value?.trim()??'',av=a?.value?.trim()??'';
    if(hv===''||av===''){alert('Escribe LOS DOS marcadores finales.');return;}
    const hg=Number(hv),ag=Number(av); if(!Number.isInteger(hg)||!Number.isInteger(ag)||hg<0||ag<0){alert('Los goles deben ser enteros de 0 en adelante.');return;}
    btn.disabled=true;btn.textContent='Guardando…';
    try{await fetchJson(`/api/history/predictions-audit/${encodeURIComponent(id)}/result`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({homeGoals:hg,awayGoals:ag}),cache:'no-store'});await loadFriendlyHistory();}
    catch(err){alert(err.message);btn.disabled=false;btn.textContent='Registrar marcador final';}
  }

  function init(){
    enhanceStaticUi();
    $('#optimizeBtn')?.addEventListener('click',optimizeFriendly,true);
    $('#betForm')?.addEventListener('submit',betFriendly,true);
    document.addEventListener('click',settleStrict,true);
    $('.nav-btn[data-view="history"]')?.addEventListener('click',()=>setTimeout(loadFriendlyHistory,0));
    $('#loadHistoryBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();loadFriendlyHistory();},true);
    // IMPORTANTE: no MutationObserver. El anterior se auto-disparaba al modificar el propio DOM y saturaba la CPU.
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
