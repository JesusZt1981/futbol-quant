'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const connected = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const EDGE_URL = connected ? `${SUPABASE_URL}/functions/v1/fq-core` : '';
const RESULTS_EDGE_URL = connected ? `${SUPABASE_URL}/functions/v1/fq-refresh-results` : '';
const INTERNAL_KEY = process.env.FQ_INTERNAL_KEY || 'mTZVlJHyCupE0ex7DtvBXBYeHX8Cx0WdZk0hSTWOtgQ';

async function postEdge(url, body, timeoutMs = 15000) {
  if (!connected) throw new Error('Supabase no está conectado');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-fq-key': INTERNAL_KEY
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw new Error(`Respuesta inválida de Supabase (${response.status})`); }
    if (!response.ok) {
      const msg = typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error || data || {});
      throw new Error(msg || `Supabase HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Supabase tardó demasiado en responder');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function edge(action, payload = {}, timeoutMs = 15000) {
  return postEdge(EDGE_URL, { action, ...payload }, timeoutMs);
}

async function insert(table, row) {
  if (!connected) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }
  return edge('insert_history', { category: table, payload: row });
}

async function list(table, limit = 100) {
  if (!connected) return (memory[table] || []).slice(-limit).reverse();
  const rows = await edge('list_history', { category: table || null, limit: Math.min(Number(limit || 100), 500) });
  return (rows || []).map(r => ({
    id: r.id,
    created_at: r.created_at,
    observed_at: r.observed_at,
    category: r.category,
    ...(r.payload || {})
  }));
}

async function dataSummary() {
  if (!connected) return [];
  return edge('summary');
}

async function teams(league) {
  if (!connected) return [];
  return edge('teams', { league });
}

async function predictionInput(league, home, away, opts = {}) {
  return edge('prediction_input', { league, home, away, cutoff: opts.cutoff || null }, 25000);
}

async function bootstrap() {
  if (!connected) return { ok: false, total_rows: 0, competitions: 0 };
  return edge('bootstrap');
}

async function savePredictionAudit(row) {
  if (!connected) return null;
  return edge('save_audit', { row });
}

async function listPredictionAudit(limit = 100) {
  if (!connected) return [];
  return edge('list_audit', { limit: Math.min(Number(limit || 100), 500) });
}

async function settlePredictionAudit(id, homeGoals, awayGoals) {
  if (!connected) throw new Error('Supabase no está conectado');
  return edge('settle_audit', { id, homeGoals, awayGoals });
}

async function refreshPendingPredictionResults(limit = 100) {
  if (!connected) return { ok: false, checked: 0, settled: 0, stillPending: 0 };
  return postEdge(RESULTS_EDGE_URL, { limit: Math.min(Math.max(Number(limit || 100), 1), 250) }, 20000);
}

function status() {
  return { persistent: connected, backend: connected ? 'supabase-edge' : 'memory' };
}

module.exports = {
  insert,
  list,
  dataSummary,
  teams,
  predictionInput,
  bootstrap,
  savePredictionAudit,
  listPredictionAudit,
  settlePredictionAudit,
  refreshPendingPredictionResults,
  status
};
