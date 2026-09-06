'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { deriveMarkets, fairOdds, noVigFromOdds } = require('./engine/probability');
const { adjustedXg } = require('./engine/featureScore');
const { stakeRecommendation, matchRiskScore, riskLabel } = require('./engine/risk');
const { optimizeProgol, coverageRecommendation } = require('./engine/progol');
const metrics = require('./engine/metrics');
const apiFootball = require('./services/apiFootball');
const oddsApi = require('./services/oddsApi');
const store = require('./store');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');
const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'progol-demo.json'), 'utf8'));

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

async function saveHistory(category, payload) {
  try { await store.insert(category, payload); return true; }
  catch (error) { console.error(`[history:${category}]`, error.message); return false; }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.3.0', store: store.status(), timestamp: new Date().toISOString() });
});

app.get('/api/providers/status', (req, res) => {
  res.json({
    apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
    oddsApi: Boolean(process.env.ODDS_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    liveTracking: Boolean(process.env.API_FOOTBALL_KEY),
    leagues: apiFootball.LEAGUES
  });
});

app.post('/api/data/bootstrap', async (req, res) => {
  try { res.json(await store.bootstrap(req.body?.mode || 'all')); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/data/summary', async (req, res) => {
  try { res.json(await store.dataSummary()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/data/teams/:league', async (req, res) => {
  try { res.json(await store.teams(req.params.league)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/predict/history', async (req, res) => {
  try {
    const league = String(req.body.league || '');
    const home = String(req.body.home || '');
    const away = String(req.body.away || '');
    if (!league || !home || !away || home === away) return res.status(400).json({ error: 'Selecciona liga, local y visitante distintos' });

    const input = await store.predictionInput(league, home, away);
    const markets = deriveMarkets(input.homeXg, input.awayXg);
    const result = {
      league, home, away,
      probabilities: { L: markets.home, E: markets.draw, V: markets.away },
      goals: { home: input.homeXg, away: input.awayXg, total: markets.expectedGoals.total },
      over25: markets.over25,
      btts: markets.bttsYes,
      sample: input.sample,
      baselines: input.baselines,
      teamRates: input.teamRates,
      methodology: input.methodology,
      dataSource: 'Historial real guardado en Supabase'
    };
    const historySaved = await saveHistory('historical_predictions', { input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/live/matches', async (req, res) => {
  try {
    const payload = await apiFootball.liveFixtures();
    const rows = (payload.response || []).map(x => ({
      fixtureId: x.fixture?.id,
      date: x.fixture?.date,
      status: x.fixture?.status?.short,
      minute: x.fixture?.status?.elapsed,
      league: x.league?.name,
      country: x.league?.country,
      home: x.teams?.home?.name,
      away: x.teams?.away?.name,
      homeGoals: x.goals?.home,
      awayGoals: x.goals?.away
    }));
    res.json({ enabled: true, updatedAt: new Date().toISOString(), matches: rows });
  } catch (error) {
    res.status(503).json({ enabled: false, error: error.message, matches: [] });
  }
});

app.get('/api/live/match/:fixtureId', async (req, res) => {
  try {
    const fixtureId = req.params.fixtureId;
    const [fixturePayload, oddsPayload] = await Promise.all([
      apiFootball.request('/fixtures', { id: fixtureId }),
      apiFootball.liveOdds(fixtureId).catch(() => ({ response: [] }))
    ]);
    const x = fixturePayload.response?.[0];
    if (!x) return res.status(404).json({ error: 'Partido no encontrado' });
    const market = apiFootball.extractLiveMarketPercentages(oddsPayload);
    const snapshot = {
      fixtureId: Number(fixtureId),
      capturedAt: new Date().toISOString(),
      minute: x.fixture?.status?.elapsed,
      status: x.fixture?.status?.short,
      league: x.league?.name,
      home: x.teams?.home?.name,
      away: x.teams?.away?.name,
      score: { home: x.goals?.home, away: x.goals?.away },
      market
    };
    await saveHistory('live_market_snapshots', snapshot);
    res.json(snapshot);
  } catch (error) { res.status(503).json({ error: error.message }); }
});

app.get('/api/demo/progol', (req, res) => {
  const enriched = demo.matches.map((m) => ({ ...m, coverage: coverageRecommendation(m) }));
  res.json({ ...demo, matches: enriched });
});

app.post('/api/model/poisson', async (req, res) => {
  try {
    const baseHomeXg = Number(req.body.homeXg);
    const baseAwayXg = Number(req.body.awayXg);
    if (!(baseHomeXg >= 0) || !(baseAwayXg >= 0)) return res.status(400).json({ error: 'xG inválido' });
    const adjusted = adjustedXg(baseHomeXg, baseAwayXg, req.body.features || {});
    const markets = deriveMarkets(adjusted.home, adjusted.away);
    const result = {
      adjustedXg: adjusted,
      markets,
      fairOdds: { L: fairOdds(markets.home), E: fairOdds(markets.draw), V: fairOdds(markets.away) }
    };
    const historySaved = await saveHistory('model_runs', { model: 'poisson', version: '1.3.0', input: req.body, output: result });
    res.json({ ...result, historySaved, historyBackend: store.status().backend });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/market/no-vig', async (req, res) => {
  try {
    const inputOdds = [Number(req.body.L), Number(req.body.E), Number(req.body.V)];
    const p = noVigFromOdds(inputOdds);
    const result = { L: p[0], E: p[1], V: p[2], overround: inputOdds.reduce((s, o) => s + 1/o, 0) - 1 };
    const historySaved = await saveHistory('market_runs', { type: 'no-vig', input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/risk/stake', async (req, res) => {
  try {
    const result = stakeRecommendation({
      modelProbability: Number(req.body.modelProbability),
      decimalOdds: Number(req.body.decimalOdds),
      bankroll: Number(req.body.bankroll || process.env.DEFAULT_BANKROLL || 10000),
      kellyMultiplier: Number(req.body.kellyMultiplier || process.env.KELLY_FRACTION || 0.25),
      maxStakePct: Number(req.body.maxStakePct || process.env.MAX_STAKE_PCT || 0.02),
      minEdgePct: Number(req.body.minEdgePct || process.env.MIN_EDGE_PCT || 0.03),
      dataQuality: Number(req.body.dataQuality ?? 1),
      lineupConfidence: Number(req.body.lineupConfidence ?? 1)
    });
    const historySaved = await saveHistory('risk_runs', { type: 'stake', input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/risk/match', async (req, res) => {
  try {
    const score = matchRiskScore(req.body);
    const result = { score, label: riskLabel(score) };
    const historySaved = await saveHistory('risk_runs', { type: 'match', input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/progol/optimize', async (req, res) => {
  try {
    const result = optimizeProgol({
      matches: req.body.matches,
      budget: Number(req.body.budget),
      lineCost: Number(req.body.lineCost || process.env.PROGOL_LINE_COST || 15),
      mode: req.body.mode || 'balanced'
    });
    const historySaved = await saveHistory('progol_runs', { input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/football/fixtures', async (req, res) => {
  try { res.json(await apiFootball.fixtures(req.query)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/football/fixture/:id/bundle', async (req, res) => {
  try { res.json(await apiFootball.fixtureBundle(req.params.id)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/odds/sports', async (req, res) => {
  try { res.json(await oddsApi.sports()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/odds/:sportKey', async (req, res) => {
  try { res.json(await oddsApi.odds({ sportKey: req.params.sportKey, ...req.query })); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/api/snapshots', async (req, res) => {
  try { res.status(201).json(await store.insert('snapshots', req.body)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/snapshots', async (req, res) => {
  try { res.json(await store.list('snapshots', Number(req.query.limit || 100))); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/history', async (req, res) => {
  try { res.json(await store.list(null, Number(req.query.limit || 100))); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/history/:category', async (req, res) => {
  try { res.json(await store.list(req.params.category, Number(req.query.limit || 100))); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/metrics/backtest', async (req, res) => {
  try {
    const rows = req.body.predictions || [];
    const bets = req.body.bets || [];
    const result = {
      nPredictions: rows.length,
      brier: metrics.brierScore(rows),
      logLoss: metrics.logLoss(rows),
      calibration: metrics.calibration(rows),
      nBets: bets.length,
      roi: metrics.roi(bets),
      hitRate: metrics.hitRate(bets)
    };
    const historySaved = await saveHistory('backtests', { input: req.body, output: result });
    res.json({ ...result, historySaved });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, async () => {
  console.log(`Fútbol Quant escuchando en http://localhost:${PORT}`);
  if (process.env.AUTO_BOOTSTRAP_HISTORY === '1') {
    try {
      const summary = await store.dataSummary();
      const total = (summary || []).reduce((s, r) => s + Number(r.finished || 0), 0);
      if (!total) {
        console.log('[bootstrap] Base vacía: cargando historial real…');
        const result = await store.bootstrap('all');
        console.log(`[bootstrap] Historial cargado: ${result.total_rows || 0} registros`);
      } else {
        console.log(`[bootstrap] Base existente: ${total} partidos`);
      }
    } catch (error) {
      console.error('[bootstrap]', error.message);
    }
  }
});
