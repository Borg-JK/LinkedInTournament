// lib/scoring.js
// Scoring engine ported from the archived LinkedInCompetition dashboard
// (HTML/index.html's inline <script>: computeTotalRatios / computeTotalMedianRatios /
// computeTotalAvgRatios / computeTournamentScores). The point-assignment and
// ratio-benchmark math is unchanged from the original; what's generalized:
//   - a fixed calendar month ('2026-01') -> an arbitrary [periodStart, periodEnd]
//     date range, so a tournament isn't locked to calendar months.
//   - the hardcoded 50% participation threshold -> a per-tournament
//     eligibilityThresholdPct (still defaults to 50 — see Phase 3 UI).
// Not wired to real data yet — Phase 5 calls computeStandings() against the
// global scores collection. entriesByUid here is { [uid]: [{date, timeSeconds}] }.

export const SCORING_METRICS = [
  { id: 'simple',  label: 'Simple Score',
    desc: "Daily rank-based points — 1st place scores highest, ties share points, non-submitters score 0 that day. Higher total wins." },
  { id: 'ratio',   label: 'Ratio Score',
    desc: "Each day's time ÷ that day's fastest time; lower total wins. A missed day is penalized at your own average for that day of the week." },
  { id: 'median',  label: 'Median Ratio',
    desc: "Each day's time ÷ that day's median time; lower total wins." },
  { id: 'average', label: 'Average Ratio',
    desc: "Each day's time ÷ that day's mean time; lower total wins." },
];

export const DEFAULT_SCORING_METRIC = 'simple';
export const ELIGIBILITY_STEPS = [20, 25, 30, 35, 40, 45, 50];
export const DEFAULT_ELIGIBILITY_PCT = 50;

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DOW_NAMES[new Date(y, m - 1, d).getDay()];
}

function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / 86400000);
}

function inPeriod(entries, periodStart, periodEnd) {
  return entries.filter(e => e.date >= periodStart && e.date <= periodEnd);
}

// ── Eligibility (shared by all four metrics) ──────────────────────────────
// A participant's personal window runs from their first submission in the
// period to the period's latest submission across everyone (capped at
// periodEnd). They qualify if they submitted on at least thresholdPct% of
// the days in that window — mirrors getTournamentParticipants() exactly,
// generalized off the fixed 50%/calendar-month original.
export function getEligibleParticipants(entriesByUid, periodStart, periodEnd, thresholdPct) {
  let latestDate = null;
  for (const entries of Object.values(entriesByUid)) {
    for (const e of inPeriod(entries, periodStart, periodEnd)) {
      if (!latestDate || e.date > latestDate) latestDate = e.date;
    }
  }
  if (!latestDate) return [];

  const result = [];
  for (const [uid, entries] of Object.entries(entriesByUid)) {
    const mine = inPeriod(entries, periodStart, periodEnd);
    if (mine.length === 0) continue;
    const firstDate = mine.reduce((min, e) => (e.date < min ? e.date : min), mine[0].date);
    const windowDays = daysBetween(firstDate, latestDate) + 1;
    const threshold = Math.ceil(windowDays * (thresholdPct / 100));
    const uniqueDays = new Set(mine.map(e => e.date)).size;
    if (uniqueDays >= threshold) result.push(uid);
  }
  return result;
}

// ── Simple Score (daily rank points) ──────────────────────────────────────
// Ported from computeTournamentScores(). Per day: sort qualifying
// participants who submitted, fastest first; points = max(N - rank, minPts)
// with ties sharing the same rank/points; minPts is 2 if anyone was missing
// that day (else 1), so a slow-but-present day still beats an absent one;
// non-submitters explicitly score 0 that day. N = total eligible
// participants for the whole period (fixed, not just that day's turnout).
export function computeSimpleScores(entriesByUid, periodStart, periodEnd, thresholdPct) {
  const participants = getEligibleParticipants(entriesByUid, periodStart, periodEnd, thresholdPct);
  if (participants.length === 0) return { participants: [], totals: {}, daily: [], sortDir: 'desc' };

  const dayMap = {}; // date -> uid -> best timeSeconds
  for (const uid of participants) {
    for (const e of inPeriod(entriesByUid[uid] || [], periodStart, periodEnd)) {
      if (!dayMap[e.date]) dayMap[e.date] = {};
      if (dayMap[e.date][uid] == null || e.timeSeconds < dayMap[e.date][uid]) {
        dayMap[e.date][uid] = e.timeSeconds;
      }
    }
  }

  const N = participants.length;
  const totals = {};
  participants.forEach(p => { totals[p] = 0; });
  const daily = [];

  for (const date of Object.keys(dayMap).sort()) {
    const uidTime = dayMap[date];
    const submitters = participants.filter(p => uidTime[p] != null)
      .sort((a, b) => uidTime[a] - uidTime[b]);
    const missing = participants.filter(p => uidTime[p] == null);

    const minPts = missing.length > 0 ? 2 : 1;
    const dayPts = {};
    missing.forEach(p => { dayPts[p] = 0; });

    let rank = 0, i = 0;
    while (i < submitters.length) {
      const t = uidTime[submitters[i]];
      let j = i;
      while (j < submitters.length && uidTime[submitters[j]] === t) j++;
      const pts = Math.max(N - rank, minPts);
      for (let x = i; x < j; x++) dayPts[submitters[x]] = pts;
      rank += (j - i);
      i = j;
    }

    participants.forEach(p => { totals[p] += (dayPts[p] || 0); });
    daily.push({ date, dayPts, submitters, missing });
  }

  return { participants, totals, daily, N, sortDir: 'desc' };
}

// ── Ratio-based metrics (ratio / median / average) ────────────────────────
// Ported from computeTotalRatios() / computeTotalMedianRatios() /
// computeTotalAvgRatios() — identical structure across all three, differing
// only in how the day's benchmark time is computed. Lower total wins.
function dayBenchmark(times, mode) {
  if (mode === 'median') {
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  if (mode === 'average') return times.reduce((a, b) => a + b, 0) / times.length;
  return Math.min(...times); // 'ratio' — benchmark is the day's fastest
}

export function computeRatioScores(entriesByUid, periodStart, periodEnd, thresholdPct, mode = 'ratio') {
  const participants = getEligibleParticipants(entriesByUid, periodStart, periodEnd, thresholdPct);
  if (participants.length === 0) return { participants: [], totals: {}, daily: [], sortDir: 'asc' };

  const byDay = {}; // date -> { uidTime, benchmark, ratioByUid, worst }
  for (const uid of participants) {
    for (const e of inPeriod(entriesByUid[uid] || [], periodStart, periodEnd)) {
      if (!byDay[e.date]) byDay[e.date] = { uidTime: {} };
      const day = byDay[e.date];
      if (day.uidTime[uid] == null || e.timeSeconds < day.uidTime[uid]) day.uidTime[uid] = e.timeSeconds;
    }
  }
  for (const day of Object.values(byDay)) {
    day.benchmark = dayBenchmark(Object.values(day.uidTime), mode);
    day.ratioByUid = {};
    let worst = 0;
    for (const [uid, t] of Object.entries(day.uidTime)) {
      const r = t / day.benchmark;
      day.ratioByUid[uid] = r;
      if (r > worst) worst = r;
    }
    day.worst = worst;
  }

  // Non-submission penalty = the player's own average ratio for that day of
  // the week, falling back to their overall average, falling back to the
  // day's worst ratio — exactly as in the original.
  const dowSum = {}, dowCount = {}, globalSum = {}, globalCount = {};
  participants.forEach(p => {
    dowSum[p] = {}; dowCount[p] = {};
    DOW_NAMES.forEach(d => { dowSum[p][d] = 0; dowCount[p][d] = 0; });
    globalSum[p] = 0; globalCount[p] = 0;
  });
  for (const [date, day] of Object.entries(byDay)) {
    const dow = dayOfWeek(date);
    for (const p of participants) {
      const r = day.ratioByUid[p];
      if (r != null) {
        dowSum[p][dow] += r; dowCount[p][dow]++;
        globalSum[p] += r; globalCount[p]++;
      }
    }
  }
  const dowAvg = {}, globalAvg = {};
  participants.forEach(p => {
    dowAvg[p] = {};
    DOW_NAMES.forEach(d => { dowAvg[p][d] = dowCount[p][d] > 0 ? dowSum[p][d] / dowCount[p][d] : null; });
    globalAvg[p] = globalCount[p] > 0 ? globalSum[p] / globalCount[p] : null;
  });

  const isGold = mode === 'ratio' ? (r => Math.abs(r - 1) < 0.001) : (r => r <= 1.001);
  const totals = {}, golds = {}, played = {};
  participants.forEach(p => { totals[p] = 0; golds[p] = 0; played[p] = 0; });

  const daily = [];
  for (const date of Object.keys(byDay).sort()) {
    const day = byDay[date];
    const dow = dayOfWeek(date);
    for (const p of participants) {
      const r = day.ratioByUid[p];
      if (r != null) {
        totals[p] += r; played[p]++;
        if (isGold(r)) golds[p]++;
      } else {
        const penalty = dowAvg[p][dow] != null ? dowAvg[p][dow]
          : (globalAvg[p] != null ? globalAvg[p] : day.worst);
        totals[p] += penalty;
      }
    }
    daily.push({ date, benchmark: day.benchmark, ratioByUid: day.ratioByUid });
  }

  return { participants, totals, golds, played, daily, dowAvg, mode, sortDir: 'asc' };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────
export function computeStandings(metric, entriesByUid, periodStart, periodEnd, thresholdPct) {
  if (metric === 'simple') return computeSimpleScores(entriesByUid, periodStart, periodEnd, thresholdPct);
  return computeRatioScores(entriesByUid, periodStart, periodEnd, thresholdPct, metric);
}

// Ranks participants from a computeStandings() result into a sorted
// [{ uid, value, rank }] leaderboard, honoring each metric's sort direction.
// Standard competition ranking (1, 1, 3 — not 1, 2, 3): tied values share
// the same rank, and the next rank skips ahead by the size of the tie. This
// matters for "who won this game" — an arbitrary tie-break would silently
// pick one of two equal winners as *the* winner.
export function rankStandings({ participants, totals, sortDir }) {
  const sorted = [...participants].sort((a, b) =>
    sortDir === 'desc' ? totals[b] - totals[a] : totals[a] - totals[b]
  );
  const ranked = [];
  sorted.forEach((uid, i) => {
    const rank = i > 0 && totals[uid] === totals[sorted[i - 1]] ? ranked[i - 1].rank : i + 1;
    ranked.push({ uid, value: totals[uid], rank });
  });
  return ranked;
}
