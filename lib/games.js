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
];

export const GAME_IDS = GAMES.map(g => g.id);

export function getGame(id) {
  return GAMES.find(g => g.id === id) || null;
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

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
