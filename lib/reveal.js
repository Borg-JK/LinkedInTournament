// lib/reveal.js
// Controls how up-to-date a tournament's *currently in-progress* month
// looks. By default standings are always live; an owner can instead make
// them jump forward on a schedule instead of updating continuously, so
// nobody knows exactly where they stand between reveals — meant to make a
// tournament more exciting rather than a foregone conclusion by day 3.
// Any month that's already over is always shown in full — the lag only
// ever applies to the month still running today.
export const REVEAL_POLICIES = [
  { id: 'live', label: 'Live',
    desc: 'Standings update the moment a score is entered.' },
  { id: 'midpoint', label: 'Reveal at the midpoint',
    desc: "Nothing shows until the month's halfway day — then standings jump straight to that day's tally and stay there until the month ends." },
  { id: 'interval', label: 'Reveal on an interval',
    desc: 'Standings jump forward every few days instead of updating continuously — set how many.' },
  { id: 'dailyUntilMidpoint', label: 'Daily, then freeze at the midpoint',
    desc: 'Updates daily like normal for the first half of the month, then freezes there for the second half.' },
];

export const DEFAULT_REVEAL_POLICY = 'live';
export const DEFAULT_REVEAL_INTERVAL_DAYS = 5;

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function dateAtDay(monthKey, day) { return `${monthKey}-${String(day).padStart(2, '0')}`; }

// The latest date (within monthKey) whose data has actually been "revealed"
// as of todayIso, per the given policy — or null if nothing has been
// revealed yet this month. Only meaningful when monthKey is the month
// todayIso falls in; callers only need this for the in-progress month.
export function revealedEndDate(policy, intervalDays, monthKey, todayIso) {
  const [y, m] = monthKey.split('-').map(Number);
  const totalDays = daysInMonth(y, m);
  const todayDay = parseInt(todayIso.slice(8, 10), 10);

  if (policy === 'midpoint') {
    const mid = Math.ceil(totalDays / 2);
    return todayDay < mid ? null : dateAtDay(monthKey, mid);
  }

  if (policy === 'dailyUntilMidpoint') {
    const mid = Math.ceil(totalDays / 2);
    return todayDay <= mid ? todayIso : dateAtDay(monthKey, mid);
  }

  if (policy === 'interval') {
    const step = Math.max(1, intervalDays || DEFAULT_REVEAL_INTERVAL_DAYS);
    let lastReached = 0;
    for (let d = step; d <= totalDays; d += step) {
      if (d <= todayDay) lastReached = d;
    }
    return lastReached > 0 ? dateAtDay(monthKey, lastReached) : null;
  }

  // 'live' (and any unrecognized value) — always current.
  return todayIso;
}

// The date to use as `periodEnd` everywhere a tournament's live standings
// are computed. For any policy other than 'live', this pins the still-
// running month to its last reveal point — or, if nothing's been revealed
// yet this month, to the end of the previous month (i.e. the in-progress
// month simply doesn't exist in the standings yet).
export function effectivePeriodEnd(tournament, todayIsoStr) {
  const policy = tournament.revealPolicy || DEFAULT_REVEAL_POLICY;
  if (policy === 'live') return todayIsoStr;

  const currentMonth = todayIsoStr.slice(0, 7);
  const revealed = revealedEndDate(policy, tournament.revealIntervalDays, currentMonth, todayIsoStr);
  if (revealed) return revealed;

  const [y, m] = currentMonth.split('-').map(Number);
  const lastOfPrevMonth = new Date(y, m - 1, 0); // day 0 of this month = last day of previous month
  const py = lastOfPrevMonth.getFullYear(), pm = lastOfPrevMonth.getMonth() + 1, pd = lastOfPrevMonth.getDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(pd).padStart(2, '0')}`;
}

// UI-facing status for the current month, given the (already capped)
// effectivePeriodEnd computed above — used to show "as of ..." / "next
// reveal in N days" messaging instead of silently looking frozen/stale.
export function revealStatus(tournament, todayIsoStr) {
  const policy = tournament.revealPolicy || DEFAULT_REVEAL_POLICY;
  if (policy === 'live') return null;

  const currentMonth = todayIsoStr.slice(0, 7);
  const [y, m] = currentMonth.split('-').map(Number);
  const totalDays = daysInMonth(y, m);
  const todayDay = parseInt(todayIsoStr.slice(8, 10), 10);
  const asOf = revealedEndDate(policy, tournament.revealIntervalDays, currentMonth, todayIsoStr);

  let nextDay = null;
  if (policy === 'midpoint') {
    const mid = Math.ceil(totalDays / 2);
    if (todayDay < mid) nextDay = mid;
  } else if (policy === 'dailyUntilMidpoint') {
    const mid = Math.ceil(totalDays / 2);
    if (todayDay > mid) nextDay = null; // frozen until next month
  } else if (policy === 'interval') {
    const step = Math.max(1, tournament.revealIntervalDays || DEFAULT_REVEAL_INTERVAL_DAYS);
    for (let d = step; d <= totalDays; d += step) {
      if (d > todayDay) { nextDay = d; break; }
    }
  }

  return {
    asOf,
    nextRevealDate: nextDay ? dateAtDay(currentMonth, nextDay) : null,
    daysUntilNextReveal: nextDay ? nextDay - todayDay : null,
  };
}
