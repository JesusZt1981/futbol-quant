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

async function fixtures({ league, season, from, to, next }) {
  const leagueId = LEAGUES[league]?.id || league;
  return request('/fixtures', { league: leagueId, season, from, to, next });
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

module.exports = { request, LEAGUES, fixtures, fixtureBundle };
