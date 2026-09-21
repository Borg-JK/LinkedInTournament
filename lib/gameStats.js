// lib/gameStats.js
// Raw daily-rank statistics for one game — metric-independent (always just
// "who finished fastest that day"), ported from the original dashboard's
// getDayRankings() / renderRankCompositionChart() / renderAllDowRank().
// Generalized the same way lib/scoring.js was: fixed calendar month ->
// [periodStart, periodEnd], hardcoded 50% -> thresholdPct.
import { getEligibleParticipants, dayOfWeek, DOW_NAMES } from './scoring';

export const RANK_BUCKETS = 7; // 1st..6th, 7th+ — matches the original's RANK_LABELS

export function computeGameStats(entriesByUid, periodStart, periodEnd, thresholdPct) {
  const participants = getEligibleParticipants(entriesByUid, periodStart, periodEnd, thresholdPct);
  if (participants.length === 0) {
    return { participants: [], rankCounts: {}, playedCount: {}, dailyRankByUid: {}, dowAvgRank: {}, dates: [] };
  }

  const byDay = {}; // date -> uid -> best timeSeconds
  for (const uid of participants) {
    for (const e of entriesByUid[uid] || []) {
      if (e.date < periodStart || e.date > periodEnd) continue;
      if (!byDay[e.date]) byDay[e.date] = {};
      if (byDay[e.date][uid] == null || e.timeSeconds < byDay[e.date][uid]) byDay[e.date][uid] = e.timeSeconds;
    }
  }

  const rankCounts = {}, playedCount = {}, dowRankSum = {}, dowRankCount = {};
  participants.forEach(uid => {
    rankCounts[uid] = new Array(RANK_BUCKETS).fill(0);
    playedCount[uid] = 0;
    dowRankSum[uid] = {}; dowRankCount[uid] = {};
    DOW_NAMES.forEach(d => { dowRankSum[uid][d] = 0; dowRankCount[uid][d] = 0; });
  });

  const dailyRankByUid = {}; // uid -> { date: rank }
  participants.forEach(uid => { dailyRankByUid[uid] = {}; });

  const dates = Object.keys(byDay).sort();
  for (const date of dates) {
    const sorted = Object.entries(byDay[date]).sort((a, b) => a[1] - b[1]);
    const dow = dayOfWeek(date);
    sorted.forEach(([uid, _time], i) => {
      const rank = i + 1;
      rankCounts[uid][Math.min(i, RANK_BUCKETS - 1)]++;
      playedCount[uid]++;
      dailyRankByUid[uid][date] = rank;
      dowRankSum[uid][dow] += rank;
      dowRankCount[uid][dow]++;
    });
  }

  const dowAvgRank = {};
  participants.forEach(uid => {
    dowAvgRank[uid] = {};
    DOW_NAMES.forEach(d => {
      dowAvgRank[uid][d] = dowRankCount[uid][d] > 0 ? dowRankSum[uid][d] / dowRankCount[uid][d] : null;
    });
  });

  return { participants, rankCounts, playedCount, dailyRankByUid, dowAvgRank, dates };
}
