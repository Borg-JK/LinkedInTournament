// lib/battle.js
// Head-to-head comparison between two players, ported from the original
// dashboard's Battle tab (and the computeDomination() it borrows from the
// Domination tab, which isn't being ported on its own). Generalized off
// the original's fixed 5-game list to whichever games a tournament has.
import { dayOfWeek, DOW_NAMES } from './scoring';

function bestTimesByDate(entries, periodStart, periodEnd) {
  const times = {};
  for (const e of entries || []) {
    if (e.date < periodStart || e.date > periodEnd) continue;
    if (times[e.date] == null || e.timeSeconds < times[e.date]) times[e.date] = e.timeSeconds;
  }
  return times;
}

// domCount[A][B] = # days A strictly beat B in every one of the tournament's
// games (no draws allowed in any of them) — "strong domination".
export function computeDomination(entriesByUidByGame, memberUids, gameIds, periodStart, periodEnd) {
  const gameDateTimes = {}; // gameId -> date -> uid -> time
  for (const gameId of gameIds) {
    gameDateTimes[gameId] = {};
    for (const uid of memberUids) {
      const times = bestTimesByDate(entriesByUidByGame[uid]?.[gameId], periodStart, periodEnd);
      for (const [date, t] of Object.entries(times)) {
        if (!gameDateTimes[gameId][date]) gameDateTimes[gameId][date] = {};
        gameDateTimes[gameId][date][uid] = t;
      }
    }
  }

  const allDates = new Set();
  for (const gameId of gameIds) Object.keys(gameDateTimes[gameId]).forEach(d => allDates.add(d));

  const domCount = {};
  memberUids.forEach(a => { domCount[a] = {}; memberUids.forEach(b => { if (a !== b) domCount[a][b] = 0; }); });

  for (const date of allDates) {
    const onDate = memberUids.filter(uid => gameIds.every(g => gameDateTimes[g][date]?.[uid] != null));
    for (const a of onDate) {
      for (const b of onDate) {
        if (a === b) continue;
        const dominated = gameIds.every(g => gameDateTimes[g][date][a] < gameDateTimes[g][date][b]);
        if (dominated) domCount[a][b]++;
      }
    }
  }
  return domCount;
}

// Per-game win counts on days both players submitted, plus overall win rate.
export function headToHead(entriesByUidByGame, uid1, uid2, gameIds, periodStart, periodEnd) {
  const perGame = {};
  let totalWins1 = 0, totalWins2 = 0, totalShared = 0;
  for (const gameId of gameIds) {
    const t1 = bestTimesByDate(entriesByUidByGame[uid1]?.[gameId], periodStart, periodEnd);
    const t2 = bestTimesByDate(entriesByUidByGame[uid2]?.[gameId], periodStart, periodEnd);
    const shared = Object.keys(t1).filter(d => t2[d] != null);
    let w1 = 0, w2 = 0, draws = 0;
    shared.forEach(d => { if (t1[d] < t2[d]) w1++; else if (t2[d] < t1[d]) w2++; else draws++; });
    perGame[gameId] = { wins1: w1, wins2: w2, draws, total: shared.length };
    totalWins1 += w1; totalWins2 += w2; totalShared += shared.length;
  }
  return {
    perGame,
    winRate1: totalShared > 0 ? Math.round((totalWins1 / totalShared) * 100) : 0,
    winRate2: totalShared > 0 ? Math.round((totalWins2 / totalShared) * 100) : 0,
    totalWins1, totalWins2, totalShared,
  };
}

// Average time by day of week, for one game, on days both players submitted.
export function dowAverageTimes(entriesByUidByGame, uid1, uid2, gameId, periodStart, periodEnd) {
  const t1 = bestTimesByDate(entriesByUidByGame[uid1]?.[gameId], periodStart, periodEnd);
  const t2 = bestTimesByDate(entriesByUidByGame[uid2]?.[gameId], periodStart, periodEnd);
  const sum1 = {}, sum2 = {}, count = {};
  DOW_NAMES.forEach(d => { sum1[d] = 0; sum2[d] = 0; count[d] = 0; });
  Object.keys(t1).filter(d => t2[d] != null).forEach(date => {
    const dow = dayOfWeek(date);
    sum1[dow] += t1[date]; sum2[dow] += t2[date]; count[dow]++;
  });
  return DOW_NAMES.map(d => ({
    dow: d,
    avg1: count[d] > 0 ? sum1[d] / count[d] : null,
    avg2: count[d] > 0 ? sum2[d] / count[d] : null,
  }));
}

// Finishing-rank distribution among ALL tournament members, for one game, on
// days both uid1 and uid2 submitted (ties share a rank, standard competition ranking).
export function placementDistribution(entriesByUidByGame, memberUids, uid1, uid2, gameId, periodStart, periodEnd) {
  const byDate = {}; // date -> uid -> time
  for (const uid of memberUids) {
    const times = bestTimesByDate(entriesByUidByGame[uid]?.[gameId], periodStart, periodEnd);
    for (const [date, t] of Object.entries(times)) {
      if (!byDate[date]) byDate[date] = {};
      byDate[date][uid] = t;
    }
  }
  const counts1 = {}, counts2 = {};
  for (const [date, times] of Object.entries(byDate)) {
    if (times[uid1] == null || times[uid2] == null) continue;
    const sorted = Object.entries(times).sort((a, b) => a[1] - b[1]);
    let rank = 1;
    for (let i = 0; i < sorted.length;) {
      const t = sorted[i][1];
      let j = i;
      while (j < sorted.length && sorted[j][1] === t) j++;
      for (let x = i; x < j; x++) {
        const [uid] = sorted[x];
        if (uid === uid1) counts1[rank] = (counts1[rank] || 0) + 1;
        if (uid === uid2) counts2[rank] = (counts2[rank] || 0) + 1;
      }
      rank += (j - i);
      i = j;
    }
  }
  const maxRank = Math.max(3, ...Object.keys(counts1).map(Number), ...Object.keys(counts2).map(Number));
  return { maxRank, counts1, counts2 };
}

// Cumulative day-win gap over time (uid1 wins - uid2 wins, running total),
// for one game, on days both submitted.
export function cumulativeDiff(entriesByUidByGame, uid1, uid2, gameId, periodStart, periodEnd) {
  const t1 = bestTimesByDate(entriesByUidByGame[uid1]?.[gameId], periodStart, periodEnd);
  const t2 = bestTimesByDate(entriesByUidByGame[uid2]?.[gameId], periodStart, periodEnd);
  const sharedDates = Object.keys(t1).filter(d => t2[d] != null).sort();
  let cum = 0;
  return sharedDates.map(date => {
    if (t1[date] < t2[date]) cum += 1;
    else if (t2[date] < t1[date]) cum -= 1;
    return { date, cumulative: cum };
  });
}
