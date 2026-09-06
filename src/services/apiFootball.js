'use strict';

const BASE = 'https://v3.football.api-sports.io';

async function request(path, params = {}) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('Falta API_FOOTBALL_KEY');
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const response = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  const json = await response.json();
  if (json.errors && Object.keys(json.errors).length) throw new Error(JSON.stringify(json.errors));
  return json;
}

const LEAGUES = {
  premier_league: { id: 39, name: 'Premier League', country: 'England' },
  laliga: { id: 140, name: 'LaLiga', country: 'Spain' },
  serie_a: { id: 135, name: 'Serie A', country: 'Italy' },
  liga_mx: { id: 262, name: 'Liga MX', country: 'Mexico' }
};

async function fixtures({ league, season, from, to, next, date, live }) {
  const leagueId = LEAGUES[league]?.id || league;
  return request('/fixtures', { league: leagueId, season, from, to, next, date, live });
}

async function liveFixtures() {
  return request('/fixtures', { live: 'all' });
}

async function liveOdds(fixtureId) {
  return request('/odds/live', { fixture: fixtureId });
}

function normalizeThreeWay(values = []) {
  const find = (...names) => values.find(v => names.includes(String(v.value || '').toLowerCase()));
  const h = find('home','1');
  const d = find('draw','x');
  const a = find('away','2');
  if (!h || !d || !a) return null;
  const odds = [Number(h.odd), Number(d.odd), Number(a.odd)];
  if (odds.some(o => !(o > 1))) return null;
  const raw = odds.map(o => 1 / o);
  const sum = raw.reduce((x,y)=>x+y,0);
  return {
    L: raw[0] / sum,
    E: raw[1] / sum,
    V: raw[2] / sum,
    decimal: { L: odds[0], E: odds[1], V: odds[2] }
  };
}

function extractLiveMarketPercentages(payload) {
  const rows = payload?.response || [];
  const markets = [];
  for (const event of rows) {
    for (const bookmaker of event.bookmakers || []) {
      for (const bet of bookmaker.bets || []) {
        const name = String(bet.name || '').toLowerCase();
        if (!name.includes('match winner') && !name.includes('winner') && !name.includes('1x2')) continue;
        const normalized = normalizeThreeWay(bet.values || []);
        if (normalized) markets.push({ bookmaker: bookmaker.name || String(bookmaker.id), ...normalized });
      }
    }
  }
  if (!markets.length) return { consensus: null, bookmakers: [] };
  const consensus = {
    L: markets.reduce((s,m)=>s+m.L,0)/markets.length,
    E: markets.reduce((s,m)=>s+m.E,0)/markets.length,
    V: markets.reduce((s,m)=>s+m.V,0)/markets.length
  };
  return { consensus, bookmakers: markets };
}

async function fixtureBundle(fixtureId) {
  const [fixture, statistics, players, lineups, injuries, odds, prediction] = await Promise.allSettled([
    request('/fixtures', { id: fixtureId }),
    request('/fixtures/statistics', { fixture: fixtureId }),
    request('/fixtures/players', { fixture: fixtureId }),
    request('/fixtures/lineups', { fixture: fixtureId }),
    request('/injuries', { fixture: fixtureId }),
    request('/odds', { fixture: fixtureId }),
    request('/predictions', { fixture: fixtureId })
  ]);

  function value(result) {
    return result.status === 'fulfilled' ? result.value : { error: result.reason?.message || 'Error' };
  }
  return {
    fixture: value(fixture), statistics: value(statistics), players: value(players),
    lineups: value(lineups), injuries: value(injuries), odds: value(odds), prediction: value(prediction)
  };
}

module.exports = { request, LEAGUES, fixtures, liveFixtures, liveOdds, extractLiveMarketPercentages, fixtureBundle };
