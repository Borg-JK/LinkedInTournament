// lib/personalHistory.js
// Groups a user's own scores (across all games) into a newest-first list of
// monthly summaries, and a per-month average for the trend chart. Reads only
// the signed-in user's own data — no tournament context needed.
import { GAMES } from './games';

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function daysBetweenInclusive(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000) + 1;
}

// entriesByGame: { [gameId]: [{date, timeSeconds}] } — this user's own scores.
export function buildMonthlyHistory(entriesByGame, todayIsoStr) {
  // "Days missed" only makes sense from when the user actually started
  // playing a game — not from whenever the puzzle itself launched.
  const firstDateByGame = {};
  for (const [gameId, entries] of Object.entries(entriesByGame)) {
    if (entries.length === 0) continue;
    firstDateByGame[gameId] = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
  }

  const monthsSet = new Set();
  for (const entries of Object.values(entriesByGame)) {
    for (const e of entries) monthsSet.add(e.date.slice(0, 7));
  }
  const months = [...monthsSet].sort().reverse();

  return months
    .map(monthKey => {
      const [y, m] = monthKey.split('-').map(Number);
      const monthStart = `${monthKey}-01`;
      const monthEnd = `${monthKey}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
      const cappedEnd = monthEnd > todayIsoStr ? todayIsoStr : monthEnd;

      const gamesSummary = {};
      for (const game of GAMES) {
        const entries = (entriesByGame[game.id] || [])
          .filter(e => e.date.startsWith(monthKey))
          .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first within the month
        if (entries.length === 0) continue;

        const first = firstDateByGame[game.id];
        const windowStart = monthStart > first ? monthStart : first;
        const activeDays = cappedEnd >= windowStart ? daysBetweenInclusive(windowStart, cappedEnd) : 0;
        const daysPlayed = entries.length;
        const sum = entries.reduce((s, e) => s + e.timeSeconds, 0);

        gamesSummary[game.id] = {
          entries,
          daysPlayed,
          avgSeconds: sum / daysPlayed,
          bestSeconds: Math.min(...entries.map(e => e.timeSeconds)),
          daysMissed: Math.max(0, activeDays - daysPlayed),
          activeDays,
        };
      }
      return { month: monthKey, games: gamesSummary };
    })
    .filter(row => Object.keys(row.games).length > 0);
}

// For the trend chart: average time per month, for one game.
export function averageByMonthForGame(entries) {
  const byMonth = {};
  for (const e of entries) {
    const mk = e.date.slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = { sum: 0, count: 0 };
    byMonth[mk].sum += e.timeSeconds;
    byMonth[mk].count++;
  }
  return Object.keys(byMonth).sort().map(mk => ({ month: mk, avgSeconds: byMonth[mk].sum / byMonth[mk].count }));
}
