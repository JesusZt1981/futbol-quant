'use strict';

const { clamp } = require('./probability');

// Convierte handicaps/condicionantes externos en ajustes pequeños y auditables de xG.
// Los pesos son deliberadamente conservadores; deben recalibrarse con backtesting.
function contextualXgAdjustment(features = {}) {
  const home = features.home || {};
  const away = features.away || {};

  function teamAdjustment(t) {
    let adj = 0;
    adj += clamp(Number(t.restDaysDelta || 0), -5, 5) * 0.025;
    adj -= clamp(Number(t.injuryImpact || 0), 0, 25) * 0.012;
    adj -= clamp(Number(t.suspensionImpact || 0), 0, 20) * 0.014;
    adj -= clamp(Number(t.travelFatigue || 0), 0, 10) * 0.025;
    adj += clamp(Number(t.lineupStrengthDelta || 0), -10, 10) * 0.025;
    adj += clamp(Number(t.formStrengthAdjusted || 0), -10, 10) * 0.018;
    adj += clamp(Number(t.tacticalMatchup || 0), -10, 10) * 0.012;
    adj += clamp(Number(t.altitudeAdaptation || 0), -10, 10) * 0.008;
    adj += clamp(Number(t.weatherAdaptation || 0), -10, 10) * 0.006;
    return clamp(adj, -0.55, 0.55);
  }

  return { home: teamAdjustment(home), away: teamAdjustment(away) };
}

function adjustedXg(baseHomeXg, baseAwayXg, features) {
  const adj = contextualXgAdjustment(features);
  return {
    home: Math.max(0.15, Number(baseHomeXg) + adj.home),
    away: Math.max(0.15, Number(baseAwayXg) + adj.away),
    adjustments: adj
  };
}

module.exports = { contextualXgAdjustment, adjustedXg };
