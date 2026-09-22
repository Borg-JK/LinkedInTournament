// lib/hallOfFame.js
// Per-month winners, ported from the original's computeMonthWinner() +
// the winner half of computeOverallScores(). The original always used
// Simple Score's points for this; generalized here to whichever metric
// the tournament is actually configured with, same as Standings.
import { computeStandings, rankStandings } from './scoring';
import { computeTournamentStandings } from './standings';
import { monthBounds } from './months';

// Winner (and runner-up context) for a single game in a single month, or
// null if nobody qualified. `value` is that metric's number (points or
// avg ratio) — same unit the Standings tab shows.
export function computeMonthWinnerForGame(entriesByUid, monthKey, tournament, periodEnd, joinedAtByUid) {
  const { start, end } = monthBounds(monthKey, tournament.startDate, periodEnd);
  if (start > end) return null;
  const result = computeStandings(tournament.scoringMetric, entriesByUid, start, end, tournament.eligibilityThresholdPct, joinedAtByUid);
  const ranked = rankStandings(result);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  const isRatioLike = tournament.scoringMetric !== 'simple';
  const value = isRatioLike ? top.value / (result.played?.[top.uid] || 1) : top.value;
  return { uid: top.uid, value, isRatioLike };
}

// Overall (cross-game) winner for a month, reusing the same cumulative
// combination as the Standings "Overall" tab.
export function computeMonthWinnerOverall(entriesByUidByGame, monthKey, tournament, periodEnd, joinedAtByUid) {
  const { start, end } = monthBounds(monthKey, tournament.startDate, periodEnd);
  if (start > end) return null;
  // computeTournamentStandings reads startDate off the tournament object
  // itself — override it to the month's start so the winner is scoped to
  // just this month, not "start of tournament through end of this month".
  const monthTournament = { ...tournament, startDate: start };
  const { ranked } = computeTournamentStandings(monthTournament, entriesByUidByGame, end, joinedAtByUid);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return { uid: top.uid, value: top.value };
}
