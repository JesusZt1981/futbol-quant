'use strict';

(() => {
  const SYNC_URL='https://bcabfavdxxzauahpbmsa.supabase.co/functions/v1/fq-data-sync';
  let busy=false;

  async function call(action,payload={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const r=await fetch(SYNC_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store',signal:controller.signal});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||`Error HTTP ${r.status}`);
      return j;
    } finally { clearTimeout(timer); }
  }

  function ensureUI(){
    const view=document.querySelector('#view-data');
    if(!view||document.querySelector('#fqSyncPanel')) return;
    const intro=view.querySelector('.section-intro');
    const panel=document.createElement('div');
    panel.id='fqSyncPanel';
    panel.innerHTML=`
      <div class="grid two align-start" style="margin:16px 0">
        <article class="panel">
          <div class="panel-title"><div><p class="eyebrow">ACTUALIZACIÓN POR COMPETICIÓN</p><h3>Buscar partidos faltantes</h3></div></div>
          <p class="simple-note">Selecciona una liga o torneo. Fútbol Quant parte de la última fecha guardada, busca resultados finalizados posteriores y agrega únicamente los que faltan.</p>
          <div class="field" style="margin-top:12px"><label>Competición</label><select id="fqSyncLeague"><option value="">Cargando competiciones…</option></select></div>
          <div id="fqSyncLeagueInfo" class="simple-note" style="margin-top:10px">—</div>
          <button id="fqSyncLeagueBtn" class="primary big-action" style="margin-top:12px">Actualizar competición</button>
          <div id="fqSyncStatus" class="simple-note" style="margin-top:12px">Esperando selección.</div>
        </article>
        <article class="panel">
          <div class="panel-title"><div><p class="eyebrow">CIERRE DIARIO</p><h3>Partidos finalizados del día</h3></div></div>
          <p class="simple-note">Cada noche se ejecuta automáticamente. Revisa los partidos finalizados de las competiciones conocidas y guarda los que todavía no existen.</p>
          <div class="field" style="margin-top:12px"><label>Fecha para prueba manual</label><input id="fqDailyDate" type="date"></div>
          <button id="fqDailyBtn" class="primary big-action" style="margin-top:12px">Ejecutar cierre ahora</button>
          <div id="fqDailyStatus" class="simple-note" style="margin-top:12px">Automático cada noche · también puedes ejecutarlo manualmente.</div>
        </article>
      </div>
      <article class="panel" style="margin-bottom:16px">
        <div class="panel-title"><div><p class="eyebrow">RESULTADO</p><h3>Resumen de la última actualización</h3></div></div>
        <div id="fqSyncCounters" class="data-strip" style="margin-bottom:12px"></div>
        <div style="overflow:auto"><table class="progol-table"><thead><tr><th>Fecha</th><th>Competición</th><th>Local</th><th>Visitante</th><th>Marcador</th><th>L/E/V</th></tr></thead><tbody id="fqSyncRows"><tr><td colspan="6">Aún no hay una actualización ejecutada.</td></tr></tbody></table></div>
      </article>
      <article class="panel">
        <div class="panel-title"><div><p class="eyebrow">AUDITORÍA</p><h3>Últimas sincronizaciones</h3></div><button id="fqRunsBtn" class="ghost">Recargar</button></div>
        <div style="overflow:auto"><table class="progol-table"><thead><tr><th>Fecha</th><th>Modo</th><th>Competición</th><th>Nuevos</th><th>Actualizados</th><th>Errores</th><th>Estado</th></tr></thead><tbody id="fqRunsRows"></tbody></table></div>
      </article>`;
    if(intro) intro.insertAdjacentElement('afterend',panel); else view.prepend(panel);
    document.querySelector('#fqDailyDate').value=new Date().toISOString().slice(0,10);
    document.querySelector('#fqSyncLeagueBtn').addEventListener('click',syncSelectedLeague);
    document.querySelector('#fqDailyBtn').addEventListener('click',runDaily);
    document.querySelector('#fqRunsBtn').addEventListener('click',loadRuns);
    document.querySelector('#fqSyncLeague').addEventListener('change',showSelectedInfo);
    loadLeagues(); loadRuns();
  }

  let leagues=[];
  async function loadLeagues(){
    const sel=document.querySelector('#fqSyncLeague');
    try{
      leagues=await call('leagues');
      const sorted=[...leagues].sort((a,b)=>String(a.competition||a.league_key).localeCompare(String(b.competition||b.league_key),'es'));
      sel.innerHTML='<option value="">Selecciona liga o torneo…</option>'+sorted.map(x=>`<option value="${x.league_key}">${x.competition||x.league_key}</option>`).join('');
    }catch(e){ sel.innerHTML='<option value="">Error al cargar competiciones</option>'; document.querySelector('#fqSyncStatus').textContent=e.message; }
  }
  function showSelectedInfo(){
    const key=document.querySelector('#fqSyncLeague').value;
    const x=leagues.find(r=>r.league_key===key);
    document.querySelector('#fqSyncLeagueInfo').textContent=x?`${Number(x.finished||0).toLocaleString('es-MX')} partidos guardados · última fecha: ${x.to_date||'sin fecha'}`:'—';
  }
  function counters(r){
    document.querySelector('#fqSyncCounters').innerHTML=`
      <div class="data-box"><span>Revisados</span><strong>${Number(r.checked||0).toLocaleString('es-MX')}</strong></div>
      <div class="data-box"><span>Nuevos</span><strong>${Number(r.new||0).toLocaleString('es-MX')}</strong></div>
      <div class="data-box"><span>Ya existentes / actualizados</span><strong>${Number(r.updated||0).toLocaleString('es-MX')}</strong></div>
      <div class="data-box"><span>Errores</span><strong>${Number(r.errors||0).toLocaleString('es-MX')}</strong></div>`;
  }
  function tableRows(sample=[]){
    document.querySelector('#fqSyncRows').innerHTML=sample.length?sample.map(x=>`<tr><td>${String(x.date||'').slice(0,10)}</td><td>${x.competition||x.league_key||'—'}</td><td>${x.home||'—'}</td><td>${x.away||'—'}</td><td>${x.score||'—'}</td><td>${x.result||'—'}</td></tr>`).join(''):'<tr><td colspan="6">No se encontraron partidos nuevos en esta ejecución.</td></tr>';
  }
  async function syncSelectedLeague(){
    if(busy)return; const key=document.querySelector('#fqSyncLeague').value; if(!key){document.querySelector('#fqSyncStatus').textContent='Selecciona una competición.';return;}
    busy=true; const btn=document.querySelector('#fqSyncLeagueBtn'),status=document.querySelector('#fqSyncStatus'); btn.disabled=true;
    let totals={checked:0,new:0,updated:0,errors:0},sample=[],nextFrom=null,cycles=0;
    try{
      do{
        btn.textContent=`Actualizando… tramo ${cycles+1}`;
        const r=await call('sync_league',{league_key:key,from:nextFrom||undefined});
        totals.checked+=Number(r.checked||0); totals.new+=Number(r.new||0); totals.updated+=Number(r.updated||0); totals.errors+=Number(r.errors||0);
        sample.push(...(r.sample||[])); nextFrom=r.nextFrom; cycles++;
        status.textContent=`Procesado hasta ${r.to}. Nuevos acumulados: ${totals.new}.`;
      }while(nextFrom&&cycles<12);
      counters(totals); tableRows(sample.slice(-60));
      status.textContent=nextFrom?`Actualización parcial: ${totals.new} nuevos. Pulsa nuevamente para continuar desde ${nextFrom}.`:`Actualización completa: ${totals.new} partidos nuevos · ${totals.updated} ya existentes/actualizados · ${totals.errors} errores.`;
      if(typeof window.loadDataSummary==='function') await window.loadDataSummary();
      await loadLeagues(); document.querySelector('#fqSyncLeague').value=key; showSelectedInfo(); await loadRuns();
    }catch(e){status.textContent=`Error: ${e.message}`;}finally{btn.disabled=false;btn.textContent='Actualizar competición';busy=false;}
  }
  async function runDaily(){
    if(busy)return; busy=true; const btn=document.querySelector('#fqDailyBtn'),status=document.querySelector('#fqDailyStatus');btn.disabled=true;btn.textContent='Buscando finalizados…';
    try{const date=document.querySelector('#fqDailyDate').value;const r=await call('daily_close',{date});counters(r);tableRows(r.sample||[]);status.textContent=`${r.date}: ${r.new} nuevos · ${r.updated} ya existentes/actualizados · ${r.errors} errores.`;if(typeof window.loadDataSummary==='function')await window.loadDataSummary();await loadRuns();}
    catch(e){status.textContent=`Error: ${e.message}`;}finally{btn.disabled=false;btn.textContent='Ejecutar cierre ahora';busy=false;}
  }
  async function loadRuns(){
    const body=document.querySelector('#fqRunsRows'); if(!body)return;
    try{const rows=await call('runs');body.innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.created_at).toLocaleString('es-MX')}</td><td>${r.mode==='daily'?'Cierre diario':'Liga'}</td><td>${r.competition||r.league_key||'Todas'}</td><td>${r.inserted||0}</td><td>${r.updated||0}</td><td>${r.errors||0}</td><td>${r.status}</td></tr>`).join(''):'<tr><td colspan="7">Sin ejecuciones todavía.</td></tr>';}
    catch(e){body.innerHTML=`<tr><td colspan="7">Error: ${e.message}</td></tr>`;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI,{once:true});else ensureUI();
})();