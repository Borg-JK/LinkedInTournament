// lib/standingsCharts.js
// The three charts that sat directly under the leaderboard on the original
// dashboard's per-game "All Players" view (HTML/index.html:
// renderRankCompositionChart / renderRankProgression / renderAllDowRank) —
// ported onto this app's own entriesByUid/participants shape rather than
// the original's QUEENS_DATA-style globals. All three share one building
// block: each day's finishing position (0-based) among whoever submitted
// that day, restricted to the tournament's qualifying participants and to
// days on/after each member's own join date (same rule as the scoring
// engine itself — see lib/scoring.js's effectiveStart()).
import { dayOfWeek } from './scoring';

export const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th+'];
export const RANK_COLORS = ['#FFD700', '#b8c4d4', '#c87c3e', '#5b9bd5', '#5fc4a8', '#b07ec8', '#888888'];
export const DOW_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DOW_ORDER_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dateRange(startIso, endIso) {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

function effectiveStart(uid, periodStart, joinedAtByUid) {
  const joined = joinedAtByUid?.[uid];
  return joined && joined > periodStart ? joined : periodStart;
}

function dailyRanks(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid) {
  const dayMap = {}; // date -> uid -> best time
  for (const uid of participants) {
    const start = effectiveStart(uid, periodStart, joinedAtByUid);
    for (const e of (entriesByUid[uid] || [])) {
      if (e.date < start || e.date > periodEnd) continue;
      if (!dayMap[e.date]) dayMap[e.date] = {};
      if (dayMap[e.date][uid] == null || e.timeSeconds < dayMap[e.date][uid]) dayMap[e.date][uid] = e.timeSeconds;
    }
  }
  const ranksByDate = {};
  for (const [date, uidTime] of Object.entries(dayMap)) {
    const sorted = Object.entries(uidTime).sort((a, b) => a[1] - b[1]);
    const ranks = {};
    sorted.forEach(([uid], i) => { ranks[uid] = i; }); // 0-based
    ranksByDate[date] = ranks;
  }
  return ranksByDate;
}

// Rank Composition: how many days each qualifying participant finished in
// each position. Bucket index 6 covers 7th place and beyond.
export function computeRankComposition(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid) {
  const ranksByDate = dailyRanks(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid);
  const counts = {}, played = {};
  participants.forEach(uid => { counts[uid] = new Array(7).fill(0); played[uid] = 0; });
  for (const ranks of Object.values(ranksByDate)) {
    for (const [uid, r] of Object.entries(ranks)) {
      if (!counts[uid]) continue;
      counts[uid][Math.min(r, 6)]++;
      played[uid]++;
    }
  }
  return { counts, played };
}

// Daily Rank Progression (Simple Score): a 7-day trailing average of daily
// rank (1-based; lower is better) per participant, across every date in
// dateList — null on stretches with no data in the trailing window, same
// as the original's smoothing.
export function computeRankProgressionSimple(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid, dateList) {
  const ranksByDate = dailyRanks(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid);
  const series = {};
  participants.forEach(uid => {
    const raw = dateList.map(d => (ranksByDate[d]?.[uid] != null ? ranksByDate[d][uid] + 1 : null));
    series[uid] = raw.map((_, i) => {
      const window = raw.slice(Math.max(0, i - 6), i + 1).filter(v => v != null);
      return window.length ? +(window.reduce((a, b) => a + b, 0) / window.length).toFixed(2) : null;
    });
  });
  return series;
}

// Daily Rank Progression (ratio-like metrics): cumulative ratio per day —
// a missing day is filled with that day's worst ratio (same as the
// original), so the line never gaps for a qualifying participant.
export function computeCumulativeRatio(dailyResult, participants, dateList) {
  const byDate = {};
  dailyResult.forEach(d => { byDate[d.date] = d; });
  const series = {};
  participants.forEach(uid => {
    let cumulative = 0;
    series[uid] = dateList.map(date => {
      const day = byDate[date];
      if (!day) return null;
      const ratios = Object.values(day.ratioByUid);
      const worst = ratios.length ? Math.max(...ratios) : 0;
      const r = day.ratioByUid[uid] ?? worst;
      cumulative += r;
      return +cumulative.toFixed(2);
    });
  });
  return series;
}

// Avg Rank by Day of Week: same per-day rank as the composition chart,
// averaged per weekday (Monday-first, matching the original).
export function computeAvgRankByDow(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid) {
  const ranksByDate = dailyRanks(entriesByUid, participants, periodStart, periodEnd, joinedAtByUid);
  const sums = {}, counts = {};
  participants.forEach(uid => {
    sums[uid] = {}; counts[uid] = {};
    DOW_ORDER.forEach(d => { sums[uid][d] = 0; counts[uid][d] = 0; });
  });
  for (const [date, ranks] of Object.entries(ranksByDate)) {
    const dow = dayOfWeek(date);
    for (const [uid, r] of Object.entries(ranks)) {
      if (!sums[uid]) continue;
      sums[uid][dow] += (r + 1); // 1-based for display
      counts[uid][dow]++;
    }
  }
  const avgs = {};
  participants.forEach(uid => {
    avgs[uid] = DOW_ORDER.map(d => (counts[uid][d] > 0 ? +(sums[uid][d] / counts[uid][d]).toFixed(2) : null));
  });
  return avgs;
}
