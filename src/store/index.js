'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
let client = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function insert(table, row) {
  if (!client) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }

  const { data, error } = await client.functions.invoke('futbol-quant-history', {
    body: {
      action: 'insert',
      category: table,
      payload: row,
      observed_at: row.observed_at || new Date().toISOString()
    }
  });
  if (error) throw error;
  return data;
}

async function list(table, limit = 100) {
  if (!client) return (memory[table] || []).slice(-limit).reverse();

  const { data, error } = await client.functions.invoke('futbol-quant-history', {
    body: {
      action: 'list',
      category: table || null,
      limit: Number(limit || 100)
    }
  });
  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    observed_at: r.observed_at,
    category: r.category,
    ...(r.payload || {})
  }));
}

function status() {
  return { persistent: Boolean(client), backend: client ? 'supabase-edge' : 'memory' };
}

module.exports = { insert, list, status };
