// lib/games.js
// Canonical list of tracked games and the anchors used to derive "today's puzzle
// number" for each one. Anchors are ported directly from parse_chat.py (the
// WhatsApp-scraper-era source of truth) rather than re-derived — confirmed
// against a live data point (Queens #872 on 2026-09-19).

export const GAMES = [
  { id: 'queens',  label: 'Queens',      baseDate: '2026-01-01', baseNum: 611 },
  { id: 'tango',   label: 'Tango',       baseDate: '2026-01-01', baseNum: 451 },
  { id: 'mini',    label: 'Mini Sudoku', baseDate: '2026-01-01', baseNum: 143 },
  { id: 'zip',     label: 'Zip',         baseDate: '2026-01-01', baseNum: 290 },
  { id: 'patches', label: 'Patches',     baseDate: '2026-03-18', baseNum: 1   },
  { id: 'wend',    label: 'Wend',        baseDate: '2026-10-01', baseNum: 115 },
];

export const GAME_IDS = GAMES.map(g => g.id);

export function getGame(id) {
  return GAMES.find(g => g.id === id) || null;
}

// LinkedIn publishes each day's puzzles at 09:00 local time, so a puzzle
// "day" does not roll over at midnight. Between midnight and 09:00 the
// puzzle you can actually play is still the one published at 09:00
// yesterday — which is why a score entered at 08:30 belongs to yesterday's
// date, not today's. Everything that needs "which puzzle is current" goes
// through activePuzzleDayIso() rather than todayIso() for that reason.
export const PUZZLE_PUBLISH_HOUR = 9;

function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Shifts a 'YYYY-MM-DD' by whole days, via the Date constructor so month
// and year rollover (and DST) are the platform's problem, not ours.
export function addDaysIso(dateIso, delta) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return isoFromDate(new Date(y, m - 1, d + delta));
}

// Which puzzle day is live at `now`. Before the 09:00 publish time that's
// still yesterday.
export function activePuzzleDayIso(now = new Date()) {
  const d = new Date(now.getTime());
  if (d.getHours() < PUZZLE_PUBLISH_HOUR) d.setDate(d.getDate() - 1);
  return isoFromDate(d);
}

// Days between two 'YYYY-MM-DD' local dates, ignoring time-of-day/timezone drift.
function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to   = new Date(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// Puzzle number for a given game on a given local date (defaults to today).
export function puzzleNumberFor(gameId, dateIso) {
  const game = getGame(gameId);
  if (!game) return null;
  const iso = dateIso || todayIso();
  return game.baseNum + daysBetween(game.baseDate, iso);
}

// The exact inverse of puzzleNumberFor. A pasted LinkedIn share carries its
// puzzle number, which pins the date down with no reference to the clock at
// all — no timezone, no publish-hour edge case, no guessing. Whenever a
// number is available this is the authority on which day a score belongs to.
export function dateForPuzzleNumber(gameId, puzzleNum) {
  const game = getGame(gameId);
  if (!game || !Number.isFinite(puzzleNum)) return null;
  return addDaysIso(game.baseDate, puzzleNum - game.baseNum);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
