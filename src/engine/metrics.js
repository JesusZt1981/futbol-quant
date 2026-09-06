'use strict';

function brierScore(rows) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => {
    const outcomes = ['L', 'E', 'V'];
    return sum + outcomes.reduce((s, o) => s + Math.pow(Number(row.probabilities[o]) - (row.result === o ? 1 : 0), 2), 0);
  }, 0);
  return total / rows.length;
}

function logLoss(rows) {
  if (!rows.length) return null;
  const eps = 1e-12;
  return -rows.reduce((sum, row) => sum + Math.log(Math.max(eps, Number(row.probabilities[row.result]))), 0) / rows.length;
}

function roi(bets) {
  const staked = bets.reduce((s, b) => s + Number(b.stake || 0), 0);
  if (!staked) return null;
  const pnl = bets.reduce((s, b) => s + Number(b.pnl || 0), 0);
  return pnl / staked;
}

function hitRate(bets) {
  if (!bets.length) return null;
  return bets.filter((b) => Number(b.pnl || 0) > 0).length / bets.length;
}

function clv({ takenOdds, closingOdds }) {
  if (!(takenOdds > 1) || !(closingOdds > 1)) return null;
  return takenOdds / closingOdds - 1;
}

function calibration(rows, bucketSize = 0.1) {
  const buckets = new Map();
  rows.forEach((row) => {
    ['L', 'E', 'V'].forEach((o) => {
      const p = Number(row.probabilities[o]);
      const idx = Math.min(9, Math.floor(p / bucketSize));
      const key = `${(idx * bucketSize).toFixed(1)}-${((idx + 1) * bucketSize).toFixed(1)}`;
      const b = buckets.get(key) || { n: 0, predicted: 0, observed: 0 };
      b.n += 1;
      b.predicted += p;
      b.observed += row.result === o ? 1 : 0;
      buckets.set(key, b);
    });
  });
  return [...buckets.entries()].map(([bucket, b]) => ({
    bucket,
    n: b.n,
    predicted: b.predicted / b.n,
    observed: b.observed / b.n
  }));
}

module.exports = { brierScore, logLoss, roi, hitRate, clv, calibration };
