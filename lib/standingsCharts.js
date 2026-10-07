// lib/standingsCharts.js
// Rank composition — how often each player finished in each position —
// ported from the original dashboard's per-game "All Players" view
// (HTML/index.html: renderRankCompositionChart) onto this app's own
// entriesByUid/participants shape rather than the original's
// QUEENS_DATA-style globals. It's built on each day's finishing position
// (0-based) among whoever submitted that day, restricted to the
// tournament's qualifying participants and to days on/after each member's
// own join date (the same rule as the scoring engine itself — see
// lib/scoring.js's effectiveStart()).
//
// The rank-progression and avg-rank-by-weekday charts that used to live
// here were dropped along with the two line charts they fed.

export const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th+'];
export const RANK_COLORS = ['#FFD700', '#b8c4d4', '#c87c3e', '#5b9bd5', '#5fc4a8', '#b07ec8', '#888888'];

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
