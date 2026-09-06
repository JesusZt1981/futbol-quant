'use strict';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function factorial(n) {
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

function poissonPmf(lambda, k) {
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error('lambda inválido');
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function scoreMatrix(homeXg, awayXg, maxGoals = 8) {
  const matrix = [];
  let mass = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    const row = [];
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonPmf(homeXg, h) * poissonPmf(awayXg, a);
      row.push(p);
      mass += p;
    }
    matrix.push(row);
  }
  // Renormaliza la pequeña cola truncada.
  return matrix.map((row) => row.map((p) => p / mass));
}

function deriveMarkets(homeXg, awayXg) {
  const matrix = scoreMatrix(homeXg, awayXg, 9);
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  const correctScores = [];

  matrix.forEach((row, h) => {
    row.forEach((p, a) => {
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h + a >= 3) over25 += p;
      if (h > 0 && a > 0) btts += p;
      correctScores.push({ score: `${h}-${a}`, probability: p });
    });
  });

  correctScores.sort((x, y) => y.probability - x.probability);
  return {
    home,
    draw,
    away,
    over25,
    under25: 1 - over25,
    bttsYes: btts,
    bttsNo: 1 - btts,
    expectedGoals: { home: homeXg, away: awayXg, total: homeXg + awayXg },
    topScores: correctScores.slice(0, 5)
  };
}

function fairOdds(probability) {
  if (probability <= 0) return null;
  return 1 / probability;
}

function impliedProbability(decimalOdds) {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  return 1 / decimalOdds;
}

function noVig(probabilities) {
  const clean = probabilities.map(Number);
  const total = clean.reduce((sum, p) => sum + p, 0);
  if (!total) throw new Error('No se puede quitar vigorish: suma 0');
  return clean.map((p) => p / total);
}

function noVigFromOdds(odds) {
  const implied = odds.map(impliedProbability);
  if (implied.some((p) => p == null)) throw new Error('Cuotas inválidas');
  return noVig(implied);
}

function blendProbabilities(models, weights) {
  if (!models.length) throw new Error('Se requiere al menos un modelo');
  const w = weights && weights.length === models.length ? weights : models.map(() => 1);
  const totalW = w.reduce((a, b) => a + b, 0);
  const keys = Object.keys(models[0]);
  const out = {};
  keys.forEach((key) => {
    out[key] = models.reduce((sum, model, idx) => sum + Number(model[key] || 0) * w[idx], 0) / totalW;
  });
  return out;
}

function shannonEntropy(probabilities) {
  const ps = probabilities.filter((p) => p > 0);
  const h = -ps.reduce((s, p) => s + p * Math.log(p), 0);
  const max = Math.log(probabilities.length);
  return max ? h / max : 0;
}

function calibrationBand(probability) {
  const p = clamp(probability, 0, 1);
  if (p >= 0.75) return 'muy-alta';
  if (p >= 0.62) return 'alta';
  if (p >= 0.52) return 'media';
  return 'baja';
}

module.exports = {
  clamp,
  poissonPmf,
  scoreMatrix,
  deriveMarkets,
  fairOdds,
  impliedProbability,
  noVig,
  noVigFromOdds,
  blendProbabilities,
  shannonEntropy,
  calibrationBand
};
