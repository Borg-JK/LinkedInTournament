// components/GameStatsPanel.jsx
// The full per-game statistics view, ported from the original dashboard:
// a ranked table with colored ratio cells + gold-day counts, a day-of-week
// average table, a rank-composition chart, and a rank-progression chart.
// Everything here is scoped to one game — entriesByUid is already filtered
// to that game by the caller.
import { useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { computeStandings, rankStandings, DOW_SHORT, DOW_NAMES } from '../lib/scoring';
import { computeGameStats, RANK_BUCKETS } from '../lib/gameStats';
import { themeFor } from '../lib/theme';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th+'];
const RANK_COLORS = ['#d4af6a', '#9a9eb9', '#c4784e', '#6b7290', '#6b7290', '#6b7290', '#4a4e66'];

function ratioClass(value) {
  if (value == null) return '';
  return value <= 1.02 ? 'ratio-good' : value >= 1.15 ? 'ratio-bad' : '';
}

export default function GameStatsPanel({ tournament, gameId, entriesByUid, names, myUid, periodEnd }) {
  const { scoringMetric, eligibilityThresholdPct: thresholdPct, startDate } = tournament;
  const isRatioLike = scoringMetric !== 'simple';
  const theme = themeFor(gameId);

  const standings = useMemo(
    () => computeStandings(scoringMetric, entriesByUid, startDate, periodEnd, thresholdPct),
    [scoringMetric, entriesByUid, startDate, periodEnd, thresholdPct]
  );
  const ranked = useMemo(() => rankStandings(standings), [standings]);
  const gameStats = useMemo(
    () => computeGameStats(entriesByUid, startDate, periodEnd, thresholdPct),
    [entriesByUid, startDate, periodEnd, thresholdPct]
  );

  const participants = gameStats.participants;

  if (participants.length === 0) {
    return <div className="panel-empty">No one has qualified in this game yet.</div>;
  }

  const compositionData = {
    labels: participants.map(uid => names[uid] || '…'),
    datasets: RANK_LABELS.map((label, ri) => ({
      label,
      data: participants.map(uid => gameStats.rankCounts[uid]?.[ri] || 0),
      backgroundColor: RANK_COLORS[ri],
    })).filter(ds => ds.data.some(v => v > 0)),
  };

  const progressionData = {
    labels: gameStats.dates,
    datasets: participants.map((uid, i) => ({
      label: names[uid] || '…',
      data: gameStats.dates.map(d => gameStats.dailyRankByUid[uid]?.[d] ?? null),
      borderColor: uid === myUid ? theme.accent : `hsl(${(i * 67) % 360} 40% 55%)`,
      backgroundColor: 'transparent',
      borderWidth: uid === myUid ? 3 : 1.5,
      pointRadius: 2,
      spanGaps: true,
    })),
  };

  return (
    <div className="game-stats-panel" style={{ '--theme-accent': theme.accent }}>
      {/* Leaderboard */}
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="leaderboard">
          <thead>
            <tr>
              <th></th>
              <th>Player</th>
              <th className="leaderboard-num">{isRatioLike ? 'Avg ratio' : 'Points'}</th>
              {isRatioLike && <th className="leaderboard-num">Gold days</th>}
            </tr>
          </thead>
          <tbody>
            {ranked.map(r => {
              const played = standings.played?.[r.uid];
              const avg = isRatioLike ? r.value / (played || 1) : null;
              return (
                <tr key={r.uid} className={r.uid === myUid ? 'leaderboard-me' : ''}>
                  <td className="leaderboard-rank">{r.rank}</td>
                  <td>{names[r.uid] || '…'}</td>
                  <td className={`leaderboard-num ${isRatioLike ? ratioClass(avg) : ''}`}>
                    {isRatioLike ? avg.toFixed(3) : r.value}
                  </td>
                  {isRatioLike && <td className="leaderboard-num">{standings.golds?.[r.uid] ?? 0}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Day-of-week average */}
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="dow-table">
          <thead>
            <tr>
              <th>Player</th>
              {DOW_SHORT.map(d => <th key={d} className="leaderboard-num">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {participants.map(uid => (
              <tr key={uid} className={uid === myUid ? 'leaderboard-me' : ''}>
                <td>{names[uid] || '…'}</td>
                {DOW_NAMES.map(d => {
                  const val = isRatioLike ? standings.dowAvg?.[uid]?.[d] : gameStats.dowAvgRank[uid]?.[d];
                  return (
                    <td key={d} className={`leaderboard-num ${isRatioLike ? ratioClass(val) : ''}`}>
                      {val == null ? '—' : val.toFixed(isRatioLike ? 2 : 1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rank composition */}
      <div className="chart-block">
        <div className="section-sub" style={{ marginBottom: 8 }}>Rank composition — how often each day ends</div>
        <div style={{ height: Math.max(160, participants.length * 42 + 40) }}>
          <Bar
            data={compositionData}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
              plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } } },
            }}
          />
        </div>
      </div>

      {/* Rank progression */}
      <div className="chart-block">
        <div className="section-sub" style={{ marginBottom: 8 }}>Rank over time</div>
        <div style={{ height: 260 }}>
          <Line
            data={progressionData}
            options={{
              maintainAspectRatio: false,
              scales: { y: { reverse: true, min: 1, ticks: { stepSize: 1 } } },
              plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } } },
            }}
          />
        </div>
      </div>
    </div>
  );
}
