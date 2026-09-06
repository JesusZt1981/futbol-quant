'use strict';

const BASE = 'https://api.the-odds-api.com/v4';

async function request(path, params = {}) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('Falta ODDS_API_KEY');
  const url = new URL(BASE + path);
  url.searchParams.set('apiKey', apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The Odds API HTTP ${response.status}`);
  return response.json();
}

async function sports() {
  return request('/sports', { all: false });
}

async function odds({ sportKey, regions = 'eu', markets = 'h2h,totals,btts,draw_no_bet', bookmakers }) {
  return request(`/sports/${encodeURIComponent(sportKey)}/odds`, {
    regions, markets, bookmakers, oddsFormat: 'decimal', dateFormat: 'iso'
  });
}

async function eventOdds({ sportKey, eventId, regions = 'eu', markets = 'h2h,totals,btts,draw_no_bet,alternate_totals' }) {
  return request(`/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/odds`, {
    regions, markets, oddsFormat: 'decimal', dateFormat: 'iso'
  });
}

module.exports = { request, sports, odds, eventOdds };
