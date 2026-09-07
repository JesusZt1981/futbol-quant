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

const CONTINENTAL_COMPETITIONS = new Set([
  'uefa_champions_league',
  'uefa_champions_league_qualifying',
  'uefa_europa_league_qualifying',
  'uefa_conference_league_qualifying'
]);

const CALENDAR_YEAR_LEAGUES = new Set([
  'argentina_primera','uefa_belarus','uefa_estonia','uefa_faroe_islands','uefa_finland',
  'uefa_georgia','uefa_iceland','uefa_ireland','uefa_latvia','uefa_lithuania','uefa_norway','uefa_sweden'
]);

const EXTRA_ALIASES = {
  'Real Betis (ESP)': ['Real Betis Balompié'],
  'Club Atlético de Madrid (ESP)': ['Club Atlético de Madrid'],
  'Atlético de Madrid': ['Club Atlético de Madrid'],
  'FC Internazionale Milano (ITA)': ['FC Internazionale Milano'],
  'Real Madrid CF (ESP)': ['Real Madrid CF'],
  'Liverpool FC (ENG)': ['Liverpool FC'],
  'Manchester City FC (ENG)': ['Manchester City FC'],
  'Arsenal FC (ENG)': ['Arsenal FC'],
  'FC Porto (POR)': ['FC Porto'],
  'Lille OSC (FRA)': ['Lille OSC'],
  'SSC Napoli (ITA)': ['SSC Napoli'],
  'Fenerbahçe (TUR)': ['Fenerbahçe'],
  'RB Leipzig (GER)': ['RB Leipzig'],
  'Slavia Praha (CZE)': ['Slavia Praha'],
  'SK Slavia Praha (CZE)': ['Slavia Praha'],
  'Racing Club de Lens (FRA)': ['Racing Club de Lens'],
  'RC Lens (FRA)': ['Racing Club de Lens']
};

function aliasesFor(team) {
  const stripped = String(team || '')
    .replace(/\s+\([A-Z]{2,4}\)\s*$/i, '')
    .replace(/\s+\d+-\d+\s+pen\.?\s*$/i, '')
    .trim();
  return [...new Set([team, stripped, ...(EXTRA_ALIASES[team] || []), ...(EXTRA_ALIASES[stripped] || [])].filter(Boolean))];
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
  if (!client) return [];
  const { data, error } = await client
    .from('fq_match_summary')
    .select('league_key,competition,matches,finished,from_date,to_date')
    .order('competition', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    league_key: r.league_key,
    competition: r.competition,
    matches: Number(r.matches || 0),
    finished: Number(r.finished || 0),
    from: r.from_date,
    to: r.to_date
  }));
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
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function expectedSeason(league, date = new Date()) {
  const y = date.getUTCFullYear();
  if (CALENDAR_YEAR_LEAGUES.has(league)) return String(y);
  const month = date.getUTCMonth() + 1;
  if (month >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

function perspectiveRates(rows, aliases) {
  const vals = rows.map((r) => {
    const isHome = aliases.includes(r.home_team);
    return {
      gf: Number(isHome ? r.home_score : r.away_score),
      ga: Number(isHome ? r.away_score : r.home_score)
    };
  });
  return { n: vals.length, gf: avg(vals.map(x => x.gf)), ga: avg(vals.map(x => x.ga)) };
}

function indexFrom(rates, baseline, prior = 5) {
  const b = Math.max(Number(baseline || 1.3), 0.35);
  return {
    attack: shrink(rates.gf, rates.n, b, prior) / b,
    defense: shrink(rates.ga, rates.n, b, prior) / b
  };
}

function blend(parts) {
  const valid = parts.filter((p) => p && Number(p.weight) > 0);
  const total = valid.reduce((s, p) => s + p.weight, 0) || 1;
  return {
    attack: valid.reduce((s, p) => s + p.attack * p.weight, 0) / total,
    defense: valid.reduce((s, p) => s + p.defense * p.weight, 0) / total
  };
}

async function inferDomesticContext(team, competitionLeague) {
  const aliases = aliasesFor(team);
  const select = 'kickoff,league_key,season,home_team,away_team,home_score,away_score';
  const [h, a] = await Promise.all([
    client.from('fq_matches').select(select).eq('finished', true).in('home_team', aliases).order('kickoff', { ascending: false }).limit(150),
    client.from('fq_matches').select(select).eq('finished', true).in('away_team', aliases).order('kickoff', { ascending: false }).limit(150)
  ]);
  if (h.error) throw h.error;
  if (a.error) throw a.error;
  const rows = [...(h.data || []), ...(a.data || [])]
    .filter((r) => r.home_score != null && r.away_score != null)
    .sort((x, y) => String(y.kickoff).localeCompare(String(x.kickoff)));

  const domesticRows = rows.filter((r) => !CONTINENTAL_COMPETITIONS.has(r.league_key) && r.league_key !== competitionLeague);
  const counts = new Map();
  for (const r of domesticRows) counts.set(r.league_key, (counts.get(r.league_key) || 0) + 1);
  const domesticLeague = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { aliases, domesticLeague, rows: domesticRows.filter((r) => !domesticLeague || r.league_key === domesticLeague) };
}

async function predictionInput(league, home, away) {
  const rows = await pagedMatches({ league, select: 'kickoff,league_key,competition,season,home_team,away_team,home_score,away_score', limit: 5000 });
  const clean = rows.filter((r) => r.home_score != null && r.away_score != null);
  if (clean.length < 30) throw new Error('Todavía no hay suficiente historial para esta competición');

  const homeAliases = aliasesFor(home);
  const awayAliases = aliasesFor(away);
  const leagueRows = clean.slice(0, Math.min(clean.length, 700));
  const leagueHome = avg(leagueRows.map((r) => Number(r.home_score)));
  const leagueAway = avg(leagueRows.map((r) => Number(r.away_score)));
  const leagueTeam = avg(leagueRows.flatMap((r) => [Number(r.home_score), Number(r.away_score)]));
  const targetCompetition = clean[0]?.competition || league;
  const currentSeason = expectedSeason(league);

  if (!CONTINENTAL_COMPETITIONS.has(league)) {
    const currentRows = clean.filter((r) => r.season === currentSeason);
    const homeCurrent = currentRows.filter((r) => homeAliases.includes(r.home_team)).slice(0, 8);
    const awayCurrent = currentRows.filter((r) => awayAliases.includes(r.away_team)).slice(0, 8);
    const homeRecent = clean.filter((r) => homeAliases.includes(r.home_team)).slice(0, 20);
    const awayRecent = clean.filter((r) => awayAliases.includes(r.away_team)).slice(0, 20);
    if (homeRecent.length < 3 || awayRecent.length < 3) throw new Error('Muestra reciente insuficiente para uno de los equipos');

    const hr = perspectiveRates(homeRecent, homeAliases);
    const ar = perspectiveRates(awayRecent, awayAliases);
    const hc = perspectiveRates(homeCurrent, homeAliases);
    const ac = perspectiveRates(awayCurrent, awayAliases);

    const homeRecentIdx = {
      attack: shrink(hr.gf, hr.n, leagueHome, 6) / Math.max(leagueHome, 0.35),
      defense: shrink(hr.ga, hr.n, leagueAway, 6) / Math.max(leagueAway, 0.35)
    };
    const awayRecentIdx = {
      attack: shrink(ar.gf, ar.n, leagueAway, 6) / Math.max(leagueAway, 0.35),
      defense: shrink(ar.ga, ar.n, leagueHome, 6) / Math.max(leagueHome, 0.35)
    };
    const homeCurrentIdx = hc.n ? indexFrom(hc, leagueTeam, 4) : homeRecentIdx;
    const awayCurrentIdx = ac.n ? indexFrom(ac, leagueTeam, 4) : awayRecentIdx;
    const hw = hc.n ? Math.min(0.65, 0.35 + hc.n * 0.075) : 0;
    const aw = ac.n ? Math.min(0.65, 0.35 + ac.n * 0.075) : 0;
    const homeStrength = blend([{ ...homeCurrentIdx, weight: hw }, { ...homeRecentIdx, weight: 1 - hw }]);
    const awayStrength = blend([{ ...awayCurrentIdx, weight: aw }, { ...awayRecentIdx, weight: 1 - aw }]);

    const homeXg = clamp(leagueHome * homeStrength.attack * awayStrength.defense, 0.25, 3.8);
    const awayXg = clamp(leagueAway * awayStrength.attack * homeStrength.defense, 0.20, 3.8);
    return {
      league, home, away, homeXg, awayXg,
      sample: { league: leagueRows.length, home: homeRecent.length, away: awayRecent.length, homeCurrentSeason: hc.n, awayCurrentSeason: ac.n },
      baselines: { leagueHomeGoals: leagueHome, leagueAwayGoals: leagueAway },
      teamRates: { homeFor: hr.gf, homeAgainst: hr.ga, awayFor: ar.gf, awayAgainst: ar.ga },
      context: { competition: targetCompetition, currentSeason, competitionAware: true, currentSeasonWeighted: true },
      methodology: `Modelo contextual de ${targetCompetition}: prioriza la temporada ${currentSeason} cuando hay partidos disponibles y la combina con el rendimiento reciente local/visitante de la misma competición.`
    };
  }

  const [homeDomestic, awayDomestic] = await Promise.all([
    inferDomesticContext(home, league),
    inferDomesticContext(away, league)
  ]);

  const homeTournamentRows = clean.filter((r) => homeAliases.includes(r.home_team) || homeAliases.includes(r.away_team)).slice(0, 12);
  const awayTournamentRows = clean.filter((r) => awayAliases.includes(r.home_team) || awayAliases.includes(r.away_team)).slice(0, 12);
  const ht = perspectiveRates(homeTournamentRows, homeAliases);
  const at = perspectiveRates(awayTournamentRows, awayAliases);

  const homeDomesticSeason = homeDomestic.domesticLeague ? expectedSeason(homeDomestic.domesticLeague) : null;
  const awayDomesticSeason = awayDomestic.domesticLeague ? expectedSeason(awayDomestic.domesticLeague) : null;
  const homeCurrentRows = homeDomestic.rows.filter((r) => r.season === homeDomesticSeason).slice(0, 8);
  const awayCurrentRows = awayDomestic.rows.filter((r) => r.season === awayDomesticSeason).slice(0, 8);
  const homeCurrent = perspectiveRates(homeCurrentRows.length ? homeCurrentRows : homeDomestic.rows.slice(0, 8), homeDomestic.aliases);
  const awayCurrent = perspectiveRates(awayCurrentRows.length ? awayCurrentRows : awayDomestic.rows.slice(0, 8), awayDomestic.aliases);

  const homeDomBase = homeDomestic.rows.length ? avg(homeDomestic.rows.slice(0, 100).flatMap(r => [Number(r.home_score), Number(r.away_score)])) : leagueTeam;
  const awayDomBase = awayDomestic.rows.length ? avg(awayDomestic.rows.slice(0, 100).flatMap(r => [Number(r.home_score), Number(r.away_score)])) : leagueTeam;
  const homeCurrentIdx = indexFrom(homeCurrent, homeDomBase || leagueTeam, 4);
  const awayCurrentIdx = indexFrom(awayCurrent, awayDomBase || leagueTeam, 4);
  const homeTournamentIdx = indexFrom(ht, leagueTeam, 6);
  const awayTournamentIdx = indexFrom(at, leagueTeam, 6);

  const homeCompW = ht.n >= 3 ? 0.35 : ht.n ? 0.18 : 0;
  const awayCompW = at.n >= 3 ? 0.35 : at.n ? 0.18 : 0;
  const homeCurrentW = homeCurrent.n ? 0.50 : 0;
  const awayCurrentW = awayCurrent.n ? 0.50 : 0;
  const homeFallback = { attack: 1, defense: 1 };
  const awayFallback = { attack: 1, defense: 1 };
  const homeStrength = blend([{ ...homeCurrentIdx, weight: homeCurrentW }, { ...homeTournamentIdx, weight: homeCompW }, { ...homeFallback, weight: Math.max(0.15, 1 - homeCurrentW - homeCompW) }]);
  const awayStrength = blend([{ ...awayCurrentIdx, weight: awayCurrentW }, { ...awayTournamentIdx, weight: awayCompW }, { ...awayFallback, weight: Math.max(0.15, 1 - awayCurrentW - awayCompW) }]);

  const homeXg = clamp(leagueHome * homeStrength.attack * awayStrength.defense, 0.25, 3.8);
  const awayXg = clamp(leagueAway * awayStrength.attack * homeStrength.defense, 0.20, 3.8);
  return {
    league, home, away, homeXg, awayXg,
    sample: {
      league: leagueRows.length,
      home: ht.n,
      away: at.n,
      homeCurrentSeason: homeCurrentRows.length,
      awayCurrentSeason: awayCurrentRows.length
    },
    baselines: { leagueHomeGoals: leagueHome, leagueAwayGoals: leagueAway },
    teamRates: { homeFor: ht.gf, homeAgainst: ht.ga, awayFor: at.gf, awayAgainst: at.ga },
    context: {
      competition: targetCompetition,
      currentSeason,
      competitionAware: true,
      currentSeasonWeighted: true,
      homeDomesticLeague: homeDomestic.domesticLeague,
      awayDomesticLeague: awayDomestic.domesticLeague,
      homeDomesticSeason,
      awayDomesticSeason,
      homeTournamentMatches: ht.n,
      awayTournamentMatches: at.n
    },
    methodology: `Modelo contextual de ${targetCompetition}: combina rendimiento en el torneo con la forma de la temporada actual en la liga doméstica de cada club; si falta muestra actual, reduce su peso y usa historial reciente regularizado.`
  };
}

async function bootstrap() {
  const summary = await dataSummary();
  const total_rows = summary.reduce((s, r) => s + Number(r.finished || 0), 0);
  return {
    ok: true,
    total_rows,
    competitions: summary.length,
    note: 'La base histórica ya está precargada en Supabase. Este botón verifica la cobertura; las actualizaciones automáticas se conectarán a la fuente de partidos actuales.'
  };
}

async function savePredictionAudit(row) {
  if (!client) return null;
  const { data, error } = await client.from('fq_prediction_audit').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function listPredictionAudit(limit = 100) {
  if (!client) return [];
  const { data, error } = await client.from('fq_prediction_audit').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(limit || 100), 500));
  if (error) throw error;
  return data || [];
}

async function settlePredictionAudit(id, homeGoals, awayGoals) {
  if (!client) throw new Error('Supabase no está conectado');
  const hg = Number(homeGoals), ag = Number(awayGoals);
  const actual = hg > ag ? 'L' : hg === ag ? 'E' : 'V';
  const { data: current, error: readError } = await client.from('fq_prediction_audit').select('predicted_outcome').eq('id', id).single();
  if (readError) throw readError;
  const { data, error } = await client.from('fq_prediction_audit').update({
    home_goals: hg,
    away_goals: ag,
    actual_outcome: actual,
    correct: current.predicted_outcome === actual,
    status: 'final',
    settled_at: new Date().toISOString()
  }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

function status() {
  return { persistent: connected, backend: connected ? 'supabase-direct' : 'memory' };
}

module.exports = {
  insert, list, dataSummary, teams, predictionInput, bootstrap,
  savePredictionAudit, listPredictionAudit, settlePredictionAudit, status
};
