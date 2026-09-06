'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const connected = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function invoke(functionName, body) {
  if (!connected) throw new Error('Supabase no está conectado');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'x-fq-key': SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try { data = await response.json(); }
  catch { data = null; }
  if (!response.ok) throw new Error(data?.error || `Supabase Edge HTTP ${response.status}`);
  if (data && data.ok === false) throw new Error(data.error || 'Error de Supabase');
  return data;
}

async function insert(table, row) {
  if (!connected) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }
  return invoke('futbol-quant-history', {
    action: 'insert', category: table, payload: row,
    observed_at: row.observed_at || new Date().toISOString()
  });
}

async function list(table, limit = 100) {
  if (!connected) return (memory[table] || []).slice(-limit).reverse();
  const data = await invoke('futbol-quant-history', {
    action: 'list', category: table || null, limit: Number(limit || 100)
  });
  return (data || []).map((r) => ({
    id: r.id, created_at: r.created_at, observed_at: r.observed_at,
    category: r.category, ...(r.payload || {})
  }));
}

async function dataSummary() { return invoke('futbol-quant-history', { action: 'summary' }); }
async function teams(league) { return invoke('futbol-quant-history', { action: 'teams', league }); }
async function predictionInput(league, home, away) {
  return invoke('futbol-quant-history', { action: 'prediction_input', league, home, away });
}
async function bootstrap(mode = 'all') { return invoke('futbol-quant-bootstrap', { mode }); }

function status() {
  return { persistent: connected, backend: connected ? 'supabase-edge' : 'memory' };
}

module.exports = { insert, list, dataSummary, teams, predictionInput, bootstrap, status };
