'use strict';

const { clamp, impliedProbability, shannonEntropy } = require('./probability');

function expectedValue(modelProbability, decimalOdds) {
  return modelProbability * decimalOdds - 1;
}

function kellyFraction(modelProbability, decimalOdds) {
  const b = decimalOdds - 1;
  const p = modelProbability;
  const q = 1 - p;
  if (b <= 0) return 0;
  return Math.max(0, (b * p - q) / b);
}

function stakeRecommendation({
  modelProbability,
  decimalOdds,
  bankroll,
  kellyMultiplier = 0.25,
  maxStakePct = 0.02,
  minEdgePct = 0.03,
  dataQuality = 1,
  lineupConfidence = 1
}) {
  const marketP = impliedProbability(decimalOdds);
  if (marketP == null) return { bet: false, reason: 'Cuota inválida', stake: 0 };
  const edge = modelProbability - marketP;
  const ev = expectedValue(modelProbability, decimalOdds);
  const fullKelly = kellyFraction(modelProbability, decimalOdds);

  const qualityPenalty = clamp(dataQuality, 0, 1) * clamp(lineupConfidence, 0, 1);
  const rawPct = fullKelly * kellyMultiplier * qualityPenalty;
  const stakePct = Math.min(maxStakePct, rawPct);
  const bet = edge >= minEdgePct && ev > 0 && stakePct > 0;

  return {
    bet,
    edge,
    ev,
    fullKelly,
    stakePct: bet ? stakePct : 0,
    stake: bet ? bankroll * stakePct : 0,
    reason: bet ? 'Value positivo y riesgo dentro de límites' : 'Sin margen suficiente para apostar'
  };
}

function matchRiskScore({
  probabilities,
  modelDisagreement = 0,
  lineupConfidence = 1,
  dataQuality = 1,
  injuryUncertainty = 0,
  marketVolatility = 0
}) {
  const uncertainty = shannonEntropy(probabilities);
  const raw = (
    uncertainty * 0.40 +
    clamp(modelDisagreement, 0, 1) * 0.20 +
    (1 - clamp(lineupConfidence, 0, 1)) * 0.15 +
    (1 - clamp(dataQuality, 0, 1)) * 0.15 +
    clamp(injuryUncertainty, 0, 1) * 0.05 +
    clamp(marketVolatility, 0, 1) * 0.05
  );
  return Math.round(clamp(raw, 0, 1) * 100);
}

function riskLabel(score) {
  if (score <= 30) return 'Bajo';
  if (score <= 55) return 'Medio';
  if (score <= 75) return 'Alto';
  return 'Muy alto';
}

module.exports = { expectedValue, kellyFraction, stakeRecommendation, matchRiskScore, riskLabel };
