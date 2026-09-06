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

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.1.0', store: store.status(), timestamp: new Date().toISOString() });
});

app.get('/api/providers/status', (req, res) => {
  res.json({
    apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
    oddsApi: Boolean(process.env.ODDS_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    leagues: apiFootball.LEAGUES
  });
});

app.get('/api/demo/progol', (req, res) => {
  const enriched = demo.matches.map((m) => ({ ...m, coverage: coverageRecommendation(m) }));
  res.json({ ...demo, matches: enriched });
});

app.post('/api/model/poisson', (req, res) => {
  try {
    const baseHomeXg = Number(req.body.homeXg);
    const baseAwayXg = Number(req.body.awayXg);
    if (!(baseHomeXg >= 0) || !(baseAwayXg >= 0)) return res.status(400).json({ error: 'xG inválido' });
    const adjusted = adjustedXg(baseHomeXg, baseAwayXg, req.body.features || {});
    const markets = deriveMarkets(adjusted.home, adjusted.away);
    res.json({
      adjustedXg: adjusted,
      markets,
      fairOdds: { L: fairOdds(markets.home), E: fairOdds(markets.draw), V: fairOdds(markets.away) }
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/market/no-vig', (req, res) => {
  try {
    const odds = [Number(req.body.L), Number(req.body.E), Number(req.body.V)];
    const p = noVigFromOdds(odds);
    res.json({ L: p[0], E: p[1], V: p[2], overround: odds.reduce((s, o) => s + 1/o, 0) - 1 });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/risk/stake', (req, res) => {
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
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/risk/match', (req, res) => {
  try {
    const score = matchRiskScore(req.body);
    res.json({ score, label: riskLabel(score) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/progol/optimize', (req, res) => {
  try {
    const result = optimizeProgol({
      matches: req.body.matches,
      budget: Number(req.body.budget),
      lineCost: Number(req.body.lineCost || process.env.PROGOL_LINE_COST || 15),
      mode: req.body.mode || 'balanced'
    });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/football/fixtures', async (req, res) => {
  try {
    const data = await apiFootball.fixtures(req.query);
    res.json(data);
  } catch (error) { res.status(502).json({ error: error.message }); }
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

app.post('/api/metrics/backtest', (req, res) => {
  try {
    const rows = req.body.predictions || [];
    const bets = req.body.bets || [];
    res.json({
      nPredictions: rows.length,
      brier: metrics.brierScore(rows),
      logLoss: metrics.logLoss(rows),
      calibration: metrics.calibration(rows),
      nBets: bets.length,
      roi: metrics.roi(bets),
      hitRate: metrics.hitRate(bets)
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, () => console.log(`Fútbol Quant escuchando en http://localhost:${PORT}`));
