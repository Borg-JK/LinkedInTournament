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

// Every date in a month, oldest first, stopped at capIso so the current
// month doesn't run on into days that haven't happened yet.
export function monthDays(monthKey, capIso) {
  const [y, m] = monthKey.split('-').map(Number);
  const last = daysInMonth(y, m);
  const dates = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
    if (capIso && iso > capIso) break;
    dates.push(iso);
  }
  return dates;
}

// How many games have a time on each of `dates`. Backs the History tab's
// day dropdown: the counts ride along in the option text, so which days you
// still owe scores for is visible without picking through them one by one.
export function buildDayPicker(entriesByGame, dates) {
  const gamesByDate = {};
  for (const [gameId, entries] of Object.entries(entriesByGame)) {
    for (const e of entries) {
      if (!gamesByDate[e.date]) gamesByDate[e.date] = new Set();
      gamesByDate[e.date].add(gameId);
    }
  }
  return dates.map(date => ({
    date,
    filled: gamesByDate[date] ? gamesByDate[date].size : 0,
    total: GAMES.length,
  }));
}

// One game's times lined up against `dates`, null where nothing was logged
// — the shape Chart.js wants for a line with gaps in it.
export function dailyTimesForGame(entries, dates) {
  const byDate = {};
  for (const e of entries) byDate[e.date] = e.timeSeconds;
  return dates.map(d => (byDate[d] == null ? null : byDate[d]));
}
