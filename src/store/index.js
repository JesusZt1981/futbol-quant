'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const connected = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let client = null;

if (connected) {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function pagedMatches({ league = null, select = '*', limit = 10000, order = true } = {}) {
  if (!client) throw new Error('Supabase no está conectado');
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < limit; from += pageSize) {
    let q = client.from('fq_matches').select(select).eq('finished', true);
    if (league) q = q.eq('league_key', league);
    if (order) q = q.order('kickoff', { ascending: false });
    const { data, error } = await q.range(from, Math.min(from + pageSize - 1, limit - 1));
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function insert(table, row) {
  if (!client) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }
  const payload = {
    app_key: 'futbol_quant',
    category: table,
    payload: row,
    observed_at: row.observed_at || new Date().toISOString()
  };
  const { data, error } = await client.from('app_history').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function list(table, limit = 100) {
  if (!client) return (memory[table] || []).slice(-limit).reverse();
  let q = client.from('app_history').select('*').eq('app_key', 'futbol_quant').order('created_at', { ascending: false }).limit(Math.min(Number(limit || 100), 500));
  if (table) q = q.eq('category', table);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    observed_at: r.observed_at,
    category: r.category,
    ...(r.payload || {})
  }));
}

async function dataSummary() {
  const rows = await pagedMatches({ select: 'league_key,competition,kickoff,finished', limit: 10000 });
  const map = new Map();
  for (const r of rows) {
    const key = r.league_key;
    if (!map.has(key)) map.set(key, { league_key: key, competition: r.competition, matches: 0, finished: 0, from: null, to: null });
    const item = map.get(key);
    item.matches += 1;
    if (r.finished) item.finished += 1;
    if (r.kickoff) {
      if (!item.to || r.kickoff > item.to) item.to = r.kickoff;
      if (!item.from || r.kickoff < item.from) item.from = r.kickoff;
    }
  }
  return [...map.values()].sort((a, b) => String(a.competition).localeCompare(String(b.competition)));
}

async function teams(league) {
  const rows = await pagedMatches({ league, select: 'home_team,away_team,kickoff', limit: 5000 });
  const set = new Set();
  for (const r of rows) {
    if (r.home_team) set.add(r.home_team);
    if (r.away_team) set.add(r.away_team);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function avg(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function shrink(value, n, baseline, prior = 6) { return (value * n + baseline * prior) / (n + prior); }

async function predictionInput(league, home, away) {
  const rows = await pagedMatches({ league, select: 'kickoff,home_team,away_team,home_score,away_score', limit: 5000 });
  const clean = rows.filter((r) => r.home_score != null && r.away_score != null);
  if (clean.length < 30) throw new Error('Todavía no hay suficiente historial para esta liga');
  const leagueRows = clean.slice(0, Math.min(clean.length, 700));
  const leagueHome = avg(leagueRows.map((r) => Number(r.home_score)));
  const leagueAway = avg(leagueRows.map((r) => Number(r.away_score)));
  const homeRows = clean.filter((r) => r.home_team === home).slice(0, 20);
  const awayRows = clean.filter((r) => r.away_team === away).slice(0, 20);
  if (homeRows.length < 3 || awayRows.length < 3) throw new Error('Muestra reciente insuficiente para uno de los equipos');

  const hf = avg(homeRows.map((r) => Number(r.home_score)));
  const ha = avg(homeRows.map((r) => Number(r.away_score)));
  const af = avg(awayRows.map((r) => Number(r.away_score)));
  const aa = avg(awayRows.map((r) => Number(r.home_score)));

  const homeAttack = shrink(hf, homeRows.length, leagueHome) / Math.max(leagueHome, 0.1);
  const homeDefense = shrink(ha, homeRows.length, leagueAway) / Math.max(leagueAway, 0.1);
  const awayAttack = shrink(af, awayRows.length, leagueAway) / Math.max(leagueAway, 0.1);
  const awayDefense = shrink(aa, awayRows.length, leagueHome) / Math.max(leagueHome, 0.1);

  let homeXg = leagueHome * homeAttack * awayDefense;
  let awayXg = leagueAway * awayAttack * homeDefense;
  homeXg = Math.min(3.8, Math.max(0.25, homeXg));
  awayXg = Math.min(3.8, Math.max(0.20, awayXg));

  return {
    league, home, away, homeXg, awayXg,
    sample: { league: leagueRows.length, home: homeRows.length, away: awayRows.length },
    baselines: { leagueHomeGoals: leagueHome, leagueAwayGoals: leagueAway },
    teamRates: { homeFor: hf, homeAgainst: ha, awayFor: af, awayAgainst: aa },
    methodology: 'Promedios recientes local/visitante con regularización hacia el promedio de liga; se convierten en tasas de gol para Poisson.'
  };
}

async function bootstrap() {
  const summary = await dataSummary();
  const total_rows = summary.reduce((s, r) => s + Number(r.finished || 0), 0);
  return { ok: true, total_rows, note: 'La carga automática externa está desactivada; la base ya existente se consulta directamente desde Supabase.' };
}

function status() {
  return { persistent: connected, backend: connected ? 'supabase-direct' : 'memory' };
}

module.exports = { insert, list, dataSummary, teams, predictionInput, bootstrap, status };
