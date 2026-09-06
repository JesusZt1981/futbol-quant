'use strict';

const OUTCOMES = ['L', 'E', 'V'];

function normalizedTriplet(values) {
  const nums = OUTCOMES.map((key) => Math.max(0.000001, Number(values[key] || 0)));
  const total = nums.reduce((a, b) => a + b, 0);
  return { L: nums[0] / total, E: nums[1] / total, V: nums[2] / total };
}

function outcomeValue(modelP, publicP) {
  return modelP / Math.max(publicP, 0.005);
}

function enumerateCombinations(matches, mode = 'balanced') {
  const lambda = mode === 'conservative' ? 0 : mode === 'contrarian' ? 0.33 : 0.14;
  const prepared = matches.map((m) => ({
    ...m,
    model: normalizedTriplet(m.model),
    public: normalizedTriplet(m.public || { L: 1/3, E: 1/3, V: 1/3 })
  }));

  let combos = [{ picks: [], logP: 0, logPublic: 0, pModel: 1, pPublic: 1 }];
  for (const match of prepared) {
    const next = [];
    for (const combo of combos) {
      for (const outcome of OUTCOMES) {
        const pm = match.model[outcome];
        const pp = match.public[outcome];
        next.push({
          picks: [...combo.picks, outcome],
          logP: combo.logP + Math.log(pm),
          logPublic: combo.logPublic + Math.log(pp),
          pModel: combo.pModel * pm,
          pPublic: combo.pPublic * pp
        });
      }
    }
    combos = next;
  }

  combos.forEach((c) => {
    c.score = c.logP + lambda * (-c.logPublic);
    c.valueRatio = c.pModel / Math.max(c.pPublic, 1e-12);
  });
  combos.sort((a, b) => b.score - a.score);
  return combos;
}

function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return d;
}

function selectDiverse(combos, count) {
  const selected = [];
  const pool = combos.slice(0, Math.min(combos.length, Math.max(300, count * 120)));
  while (selected.length < count && pool.length) {
    if (selected.length === 0) {
      selected.push(pool.shift());
      continue;
    }
    let bestIdx = 0;
    let bestAdjusted = -Infinity;
    pool.forEach((combo, idx) => {
      const minDistance = Math.min(...selected.map((s) => hammingDistance(s.picks, combo.picks)));
      const adjusted = combo.score + minDistance * 0.08;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = idx;
      }
    });
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}

function optimizeProgol({ matches, budget, lineCost = 15, mode = 'balanced' }) {
  if (!Array.isArray(matches) || matches.length !== 9) throw new Error('Progol Media Semana requiere exactamente 9 partidos');
  const lines = Math.max(1, Math.floor(Number(budget) / Number(lineCost)));
  const combos = enumerateCombinations(matches, mode);
  const selected = selectDiverse(combos, lines);
  return {
    budget: Number(budget),
    lineCost: Number(lineCost),
    lines,
    spent: lines * Number(lineCost),
    mode,
    selections: selected.map((c, idx) => ({
      rank: idx + 1,
      picks: c.picks,
      probabilityModel: c.pModel,
      popularityProxy: c.pPublic,
      valueRatio: c.valueRatio
    }))
  };
}

function coverageRecommendation(match) {
  const model = normalizedTriplet(match.model);
  const ranked = OUTCOMES.map((o) => ({ outcome: o, p: model[o] })).sort((a,b) => b.p-a.p);
  const one = ranked[0].p;
  const two = ranked[0].p + ranked[1].p;
  if (one >= 0.62) return { type: 'Sencilla', picks: [ranked[0].outcome], coverage: one };
  if (two >= 0.72) return { type: 'Doble', picks: [ranked[0].outcome, ranked[1].outcome], coverage: two };
  return { type: 'Triple', picks: OUTCOMES, coverage: 1 };
}

module.exports = { OUTCOMES, normalizedTriplet, outcomeValue, enumerateCombinations, optimizeProgol, coverageRecommendation };
