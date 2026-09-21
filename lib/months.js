// lib/months.js — month-list + month-bounds helpers for the tournament
// page's month filter (Standings/Hall of Fame/Battle all scope to a
// calendar month, same as the original dashboard's monthFilter).
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// 'YYYY-MM' strings from startDate's month through todayIso's month, newest first.
export function monthsBetween(startDateIso, todayIsoStr) {
  const [sy, sm] = startDateIso.split('-').map(Number);
  const [ty, tm] = todayIsoStr.split('-').map(Number);
  const months = [];
  let y = sy, m = sm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months.reverse();
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// Clamp a 'YYYY-MM' month to the [periodStart, periodEnd] date range actually
// covered by the tournament, so a partial first/last month doesn't reach
// outside it.
export function monthBounds(monthKey, periodStart, periodEnd) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    start: first > periodStart ? first : periodStart,
    end: last < periodEnd ? last : periodEnd,
  };
}
