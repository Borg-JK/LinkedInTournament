// components/BattleTab.jsx
import { useState, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { monthsBetween, monthLabel, monthBounds } from '../lib/months';
import { GAMES } from '../lib/games';
import { colorForUid } from '../lib/colors';
import { formatSeconds } from '../lib/time';
import { DOW_SHORT } from '../lib/scoring';
import {
  computeDomination, headToHead, dowAverageTimes, placementDistribution, cumulativeDiff,
} from '../lib/battle';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

function StatCard({ uid, name, color, h2h, winKey, dom }) {
  let totalWins = 0, totalGames = 0;
  Object.values(h2h.perGame).forEach(s => { totalWins += s[winKey]; totalGames += s.total; });
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <div className="battle-card" style={{ borderColor: `${color}55` }}>
      <div className="battle-card-head">
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span className="battle-card-name">{name}</span>
      </div>
      <div className="battle-stat-row">
        <div className="battle-stat"><div className="battle-stat-value" style={{ color }}>{dom}</div><div className="battle-stat-label">Dominations</div></div>
        <div className="battle-stat"><div className="battle-stat-value" style={{ color }}>{winRate}%</div><div className="battle-stat-label">Win rate</div></div>
        <div className="battle-stat"><div className="battle-stat-value" style={{ color }}>{totalWins}</div><div className="battle-stat-label">Wins</div></div>
      </div>
      {Object.entries(h2h.perGame).map(([gameId, s]) => {
        if (s.total === 0) return null;
        const wins = s[winKey];
        const pct = Math.round((wins / s.total) * 100);
        return (
          <div className="battle-game-bar-row" key={gameId}>
            <div className="battle-game-bar-head">
              <span>{GAMES.find(g => g.id === gameId)?.label || gameId}</span>
              <span style={{ color }}>{wins}/{s.total}</span>
            </div>
            <div className="battle-game-bar-track"><div className="battle-game-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export default function BattleTab({ tournament, names, byUidGame, periodEnd }) {
  const months = useMemo(() => monthsBetween(tournament.startDate, periodEnd), [tournament.startDate, periodEnd]);
  const [month, setMonth] = useState('all');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [chartGame, setChartGame] = useState(tournament.games[0]);

  const { start, end } = month === 'all'
    ? { start: tournament.startDate, end: periodEnd }
    : monthBounds(month, tournament.startDate, periodEnd);

  const ready = p1 && p2 && p1 !== p2;

  const h2h = useMemo(() => ready ? headToHead(byUidGame, p1, p2, tournament.games, start, end) : null, [ready, byUidGame, p1, p2, tournament.games, start, end]);
  const dom = useMemo(() => ready ? computeDomination(byUidGame, tournament.members, tournament.games, start, end) : null, [ready, byUidGame, tournament.members, tournament.games, start, end]);
  const dowRows = useMemo(() => ready ? dowAverageTimes(byUidGame, p1, p2, chartGame, start, end) : [], [ready, byUidGame, p1, p2, chartGame, start, end]);
  const placement = useMemo(() => ready ? placementDistribution(byUidGame, tournament.members, p1, p2, chartGame, start, end) : null, [ready, byUidGame, tournament.members, p1, p2, chartGame, start, end]);
  const diff = useMemo(() => ready ? cumulativeDiff(byUidGame, p1, p2, chartGame, start, end) : [], [ready, byUidGame, p1, p2, chartGame, start, end]);

  const c1 = ready ? colorForUid(p1) : '#4fc3f7';
  const c2 = ready ? colorForUid(p2) : '#ff6b6b';
  const n1 = names[p1] || '';
  const n2 = names[p2] || '';

  return (
    <>
      <div className="battle-controls">
        <select className="editorial-select" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select className="editorial-select" value={p1} onChange={e => setP1(e.target.value)}>
          <option value="">— Select player —</option>
          {tournament.members.map(uid => <option key={uid} value={uid}>{names[uid] || '…'}</option>)}
        </select>
        <select className="editorial-select" value={p2} onChange={e => setP2(e.target.value)}>
          <option value="">— Select player —</option>
          {tournament.members.map(uid => <option key={uid} value={uid}>{names[uid] || '…'}</option>)}
        </select>
      </div>

      {!ready ? (
        <div className="leaderboard-card">
          <div className="lb-meta" style={{ textAlign: 'center', padding: '20px 0' }}>Select two different players to compare.</div>
        </div>
      ) : (
        <>
          <div className="battle-cards">
            <StatCard uid={p1} name={n1} color={c1} h2h={h2h} winKey="wins1" dom={dom[p1]?.[p2] || 0} />
            <StatCard uid={p2} name={n2} color={c2} h2h={h2h} winKey="wins2" dom={dom[p2]?.[p1] || 0} />
          </div>

          <div className="leaderboard-card">
            <div className="lb-header">
              <div className="lb-title">Avg time by day of week</div>
              <select className="editorial-select" value={chartGame} onChange={e => setChartGame(e.target.value)}>
                {tournament.games.map(gId => <option key={gId} value={gId}>{GAMES.find(g => g.id === gId)?.label || gId}</option>)}
              </select>
            </div>
            <div style={{ height: 260 }}>
              <Line
                data={{
                  labels: DOW_SHORT,
                  datasets: [
                    { label: n1, data: dowRows.map(r => r.avg1), borderColor: c1, backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, borderWidth: 2.5, spanGaps: true },
                    { label: n2, data: dowRows.map(r => r.avg2), borderColor: c2, backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, borderWidth: 2.5, spanGaps: true },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } },
                    tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y != null ? formatSeconds(c.parsed.y) : '—'}` } },
                  },
                  scales: { y: { ticks: { callback: v => formatSeconds(v) } } },
                }}
              />
            </div>
          </div>

          <div className="battle-grid-2">
            <div className="leaderboard-card">
              <div className="lb-title" style={{ marginBottom: 10 }}>Placement distribution</div>
              <div style={{ height: 240 }}>
                <Bar
                  data={{
                    labels: Array.from({ length: placement.maxRank }, (_, i) => `${i + 1}${['st', 'nd', 'rd'][i] || 'th'}`),
                    datasets: [
                      { label: n1, backgroundColor: c1, data: Array.from({ length: placement.maxRank }, (_, i) => placement.counts1[i + 1] || 0) },
                      { label: n2, backgroundColor: c2, data: Array.from({ length: placement.maxRank }, (_, i) => placement.counts2[i + 1] || 0) },
                    ],
                  }}
                  options={{ maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }}
                />
              </div>
            </div>

            <div className="leaderboard-card">
              <div className="lb-title" style={{ marginBottom: 2 }}>Day-win gap over time</div>
              <div className="lb-meta" style={{ marginBottom: 10 }}>Cumulative — positive = {n1} ahead</div>
              <div style={{ height: 240 }}>
                <Line
                  data={{
                    labels: diff.map(d => { const [, m, dd] = d.date.split('-'); return `${dd}/${m}`; }),
                    datasets: [{
                      label: `${n1} − ${n2}`,
                      data: diff.map(d => d.cumulative),
                      borderColor: c1,
                      backgroundColor: `${c1}33`,
                      fill: 'origin',
                      tension: 0.3,
                      pointRadius: 0,
                      borderWidth: 2.5,
                    }],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { title: { display: true, text: `${n1} ahead ↑ / ${n2} ahead ↓` } } },
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
