'use strict';

let supabase = null;
const memory = { snapshots: [], predictions: [], bets: [] };

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function insert(table, row) {
  if (!supabase) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function list(table, limit = 100) {
  if (!supabase) return (memory[table] || []).slice(-limit).reverse();
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

function status() {
  return { persistent: Boolean(supabase), backend: supabase ? 'supabase' : 'memory' };
}

module.exports = { insert, list, status };
