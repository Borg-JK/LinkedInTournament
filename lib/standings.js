// lib/standings.js
// Combines per-game results from lib/scoring.js into one tournament-wide
// ranking. The original dashboard never had to do this — it only ever
// scored one game at a time (a tab per game). A tournament here can span
// several games, so this is a new, explicitly-flagged design decision
// rather than a port of existing behavior:
//
//   - Simple Score: sums each participant's per-game point total (points
//     are inherently additive — this matches the original's own
//     computeOverallScores(), which summed per-game 'simple' points across
//     all five games for its "Overall" tab).
//   - Ratio / Median / Average: these are relative-to-the-day numbers, not
//     natively summable across games with different day-counts without one
//     game dominating. Combined value = the unweighted mean of each
//     participant's own per-game average ratio, across only the games they
//     qualify in. Not something the original dashboard ever needed to do —
//     flag to Borg if a different combination is wanted.
//
// A participant who doesn't qualify (per computeStandings' own eligibility
// check) in *any* of the tournament's games is left out of the ranking
// entirely, for either metric.
import { computeStandings } from './scoring';

export function computeTournamentStandings(tournament, entriesByUidByGame, periodEnd) {
  const { games, scoringMetric, eligibilityThresholdPct, startDate } = tournament;
  const sortDir = scoringMetric === 'simple' ? 'desc' : 'asc';

  // value[uid] accumulates points (simple) or a list of per-game averages
  // to mean together (ratio-like).
  const pointSum = {};
  const ratioAverages = {}; // uid -> [avgRatio, ...]
  const perGame = {}; // uid -> { [gameId]: { value, rank } } — for the detail breakdown

  for (const gameId of games) {
    const entriesByUid = {};
    for (const [uid, byGame] of Object.entries(entriesByUidByGame)) {
      entriesByUid[uid] = byGame[gameId] || [];
    }
    const result = computeStandings(scoringMetric, entriesByUid, startDate, periodEnd, eligibilityThresholdPct);

    for (const uid of result.participants) {
      perGame[uid] = perGame[uid] || {};
      if (scoringMetric === 'simple') {
        pointSum[uid] = (pointSum[uid] || 0) + result.totals[uid];
        perGame[uid][gameId] = { value: result.totals[uid] };
      } else {
        const played = result.played[uid] || 0;
        if (played > 0) {
          const avg = result.totals[uid] / played;
          ratioAverages[uid] = ratioAverages[uid] || [];
          ratioAverages[uid].push(avg);
          perGame[uid][gameId] = { value: avg };
        }
      }
    }
  }

  const combined = {};
  if (scoringMetric === 'simple') {
    Object.assign(combined, pointSum);
  } else {
    for (const [uid, avgs] of Object.entries(ratioAverages)) {
      combined[uid] = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    }
  }

  const participants = Object.keys(combined);
  const sorted = participants.sort((a, b) =>
    sortDir === 'desc' ? combined[b] - combined[a] : combined[a] - combined[b]
  );

  return {
    sortDir,
    ranked: sorted.map((uid, i) => ({ uid, value: combined[uid], rank: i + 1, perGame: perGame[uid] })),
  };
}
