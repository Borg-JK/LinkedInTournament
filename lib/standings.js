// lib/standings.js
// Combines per-game results from lib/scoring.js into one tournament-wide
// ranking. The original dashboard never had to do this — it only ever
// scored one game at a time (a tab per game); a tournament here can span
// several.
//
// Each game is still scored entirely independently — ratio-based metrics
// are always relative to that game's own day-to-day numbers, and every
// game has its own winner. The cumulative/overall score that decides the
// tournament is the straight sum of each participant's per-game score
// (points for Simple Score, average ratio for Ratio/Median/Average) —
// same rule for every metric, no averaging across games. A participant who
// doesn't qualify (per computeStandings' own eligibility check) in *any*
// of the tournament's games is left out of the overall ranking entirely.
import { computeStandings, rankStandings } from './scoring';

export function computeTournamentStandings(tournament, entriesByUidByGame, periodEnd, joinedAtByUid) {
  const { games, scoringMetric, eligibilityThresholdPct, startDate } = tournament;
  const sortDir = scoringMetric === 'simple' ? 'desc' : 'asc';

  const cumulative = {}; // uid -> sum of per-game scores
  const perGame = {}; // uid -> { [gameId]: { value, rank } } — that game's own standings

  for (const gameId of games) {
    const entriesByUid = {};
    for (const [uid, byGame] of Object.entries(entriesByUidByGame)) {
      entriesByUid[uid] = byGame[gameId] || [];
    }
    const result = computeStandings(scoringMetric, entriesByUid, startDate, periodEnd, eligibilityThresholdPct, joinedAtByUid);
    const gameRanked = rankStandings(result); // that game's own winner, 2nd, 3rd...

    for (const { uid, value, rank } of gameRanked) {
      // Simple Score's value is already per-game points; ratio-like metrics
      // report a sum of daily ratios, so divide down to this game's average
      // — the unit that's actually comparable and summable across games.
      const gameValue = scoringMetric === 'simple' ? value : value / (result.played[uid] || 1);
      perGame[uid] = perGame[uid] || {};
      perGame[uid][gameId] = { value: gameValue, rank };
      cumulative[uid] = (cumulative[uid] || 0) + gameValue;
    }
  }

  // Same tie-aware ranking as each individual game (see rankStandings) —
  // a tied cumulative score is a tied placement, not an arbitrary tie-break.
  const overall = rankStandings({ participants: Object.keys(cumulative), totals: cumulative, sortDir });

  return {
    sortDir,
    ranked: overall.map(({ uid, value, rank }) => ({ uid, value, rank, perGame: perGame[uid] })),
  };
}
