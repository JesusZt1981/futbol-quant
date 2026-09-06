'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
let client = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function invoke(functionName, body) {
  if (!client) throw new Error('Supabase no está conectado');
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || 'Error de Supabase');
  return data;
}

async function insert(table, row) {
  if (!client) {
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
  if (!client) return (memory[table] || []).slice(-limit).reverse();
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
  return { persistent: Boolean(client), backend: client ? 'supabase-edge' : 'memory' };
}

module.exports = { insert, list, dataSummary, teams, predictionInput, bootstrap, status };
