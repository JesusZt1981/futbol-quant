'use strict';

function expectedScore(ratingA, ratingB, homeAdvantage = 65) {
  return 1 / (1 + Math.pow(10, ((ratingB - (ratingA + homeAdvantage)) / 400)));
}

function updateElo({ homeRating, awayRating, homeGoals, awayGoals, k = 24, homeAdvantage = 65 }) {
  const expectedHome = expectedScore(homeRating, awayRating, homeAdvantage);
  const actualHome = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
  const margin = Math.abs(homeGoals - awayGoals);
  const multiplier = margin <= 1 ? 1 : Math.log(margin + 1) * (2.2 / ((homeRating - awayRating) * 0.001 + 2.2));
  const delta = k * multiplier * (actualHome - expectedHome);
  return { homeRating: homeRating + delta, awayRating: awayRating - delta, delta };
}

module.exports = { expectedScore, updateElo };
