'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveMarkets, noVigFromOdds } = require('../src/engine/probability');
const { expectedValue, kellyFraction, stakeRecommendation } = require('../src/engine/risk');
const { optimizeProgol } = require('../src/engine/progol');
const { brierScore } = require('../src/engine/metrics');

function near(a,b,eps=1e-8){ assert.ok(Math.abs(a-b) < eps, `${a} != ${b}`); }

test('Poisson 1X2 suma 1', () => {
  const m = deriveMarkets(1.6, 1.1);
  near(m.home + m.draw + m.away, 1, 1e-10);
  near(m.over25 + m.under25, 1, 1e-10);
  near(m.bttsYes + m.bttsNo, 1, 1e-10);
});

test('No-vig normaliza cuotas 1X2', () => {
  const p = noVigFromOdds([1.9, 3.6, 4.0]);
  near(p.reduce((a,b)=>a+b,0), 1);
  assert.ok(p[0] > p[1] && p[1] > p[2]);
});

test('Kelly no apuesta con EV negativo', () => {
  assert.ok(expectedValue(0.45, 2.0) < 0);
  assert.equal(kellyFraction(0.45, 2.0), 0);
  const r = stakeRecommendation({ modelProbability:0.45, decimalOdds:2.0, bankroll:10000 });
  assert.equal(r.bet, false);
  assert.equal(r.stake, 0);
});

test('Kelly aplica tope de 2%', () => {
  const r = stakeRecommendation({ modelProbability:0.75, decimalOdds:2.2, bankroll:10000, kellyMultiplier:0.5, maxStakePct:0.02 });
  assert.equal(r.bet, true);
  near(r.stakePct, 0.02);
  near(r.stake, 200);
});

test('Optimizador Progol respeta presupuesto', () => {
  const matches = Array.from({length:9}, (_,i)=>({ n:i+1, model:{L:.5,E:.3,V:.2}, public:{L:.55,E:.25,V:.2} }));
  const r = optimizeProgol({ matches, budget:150, lineCost:15, mode:'balanced' });
  assert.equal(r.lines, 10);
  assert.equal(r.spent, 150);
  assert.equal(r.selections.length, 10);
  assert.ok(r.selections.every(x => x.picks.length === 9));
});

test('Brier perfecto = 0', () => {
  const score = brierScore([{ probabilities:{L:1,E:0,V:0}, result:'L' }]);
  near(score, 0);
});
