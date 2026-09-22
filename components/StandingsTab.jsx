// components/StandingsTab.jsx
import { useState, useMemo, useEffect } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { computeStandings, rankStandings } from '../lib/scoring';
import { computeTournamentStandings } from '../lib/standings';
import {
  RANK_LABELS, RANK_COLORS, DOW_ORDER_SHORT, dateRange,
  computeRankComposition, computeRankProgressionSimple, computeCumulativeRatio, computeAvgRankByDow,
} from '../lib/standingsCharts';
import { monthsBetween, monthLabel, monthBounds } from '../lib/months';
import { GAMES } from '../lib/games';
import { colorForUid } from '../lib/colors';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

function rankClass(rank) {
  return rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
}

export default function StandingsTab({ tournament, names, byUidGame, myUid, periodEnd, joinedAtByUid, onGameThemeChange }) {
  const months = useMemo(() => monthsBetween(tournament.startDate, periodEnd), [tournament.startDate, periodEnd]);
  const [month, setMonth] = useState(months[0]);
  useEffect(() => {
    if (months.length > 0 && !months.includes(month)) setMonth(months[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(',')]);
  const multiGame = tournament.games.length > 1;
  const [game, setGame] = useState(multiGame ? 'overall' : tournament.games[0]);

  useEffect(() => { onGameThemeChange(game); }, [game, onGameThemeChange]);

  const { start, end } = month ? monthBounds(month, tournament.startDate, periodEnd) : { start: periodEnd, end: tournament.startDate };
  const isOverall = game === 'overall';
  const isRatioLike = tournament.scoringMetric !== 'simple';
  const gameLabel = isOverall ? 'Overall' : (GAMES.find(g => g.id === game)?.label || game);

  const rows = useMemo(() => {
    if (!month || start > end) return { ranked: [], perGameForOverall: null };
    if (isOverall) {
      const monthTournament = { ...tournament, startDate: start };
      const { ranked } = computeTournamentStandings(monthTournament, byUidGame, end, joinedAtByUid);
      return { ranked, perGameForOverall: true };
    }
    const entriesByUid = {};
    for (const uid of tournament.members) entriesByUid[uid] = byUidGame[uid]?.[game] || [];
    const result = computeStandings(tournament.scoringMetric, entriesByUid, start, end, tournament.eligibilityThresholdPct, joinedAtByUid);

    // computeSimpleScores() doesn't return a per-uid `played` count the way
    // computeRatioScores() does — derive it from `daily` either way, so the
    // "days played" column works for every metric.
    const playedByUid = {};
    result.participants.forEach(uid => { playedByUid[uid] = 0; });
    (result.daily || []).forEach(day => {
      const submitters = day.submitters || Object.keys(day.ratioByUid || {});
      submitters.forEach(uid => { if (playedByUid[uid] != null) playedByUid[uid]++; });
    });

    const ranked = rankStandings(result).map(r => ({
      ...r,
      played: playedByUid[r.uid] || 0,
      dailyCount: result.daily?.length || 0,
    }));
    return { ranked, perGameForOverall: false, entriesByUid, result };
  }, [tournament, byUidGame, game, isOverall, start, end, joinedAtByUid]);

  // The three charts that used to sit under a per-game leaderboard on the
  // original dashboard — rank composition, rank progression, avg rank by
  // day of week. Only meaningful for a specific game (not Overall, which
  // isn't a single race with day-by-day finishing positions).
  const charts = useMemo(() => {
    if (isOverall || !rows.result || rows.ranked.length === 0) return null;
    const participants = rows.result.participants;
    const dates = dateRange(start, end);
    const composition = tournament.scoringMetric === 'simple'
      ? computeRankComposition(rows.entriesByUid, participants, start, end, joinedAtByUid)
      : null;
    const progression = tournament.scoringMetric === 'simple'
      ? computeRankProgressionSimple(rows.entriesByUid, participants, start, end, joinedAtByUid, dates)
      : computeCumulativeRatio(rows.result.daily, participants, dates);
    const dowRank = computeAvgRankByDow(rows.entriesByUid, participants, start, end, joinedAtByUid);
    return { participants, dates, composition, progression, dowRank };
  }, [isOverall, rows, tournament.scoringMetric, start, end, joinedAtByUid]);

  return (
    <>
      <div className="editorial-controls">
        {months.length > 0 ? (
          <select className="editorial-select" value={month} onChange={e => setMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        ) : (
          <div className="lb-meta">Nothing revealed yet.</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tournament.games.map(gId => (
            <button
              key={gId}
              type="button"
              className={`ed-game-tab${game === gId ? ' active' : ''}`}
              onClick={() => setGame(gId)}
            >
              {GAMES.find(g => g.id === gId)?.label || gId}
            </button>
          ))}
          {multiGame && (
            <button
              type="button"
              className={`ed-game-tab${game === 'overall' ? ' active' : ''}`}
              style={{ fontWeight: 700 }}
              onClick={() => setGame('overall')}
            >
              Overall
            </button>
          )}
        </div>
      </div>

      <div className="leaderboard-card">
        <div className="lb-header">
          <div className="lb-title">{gameLabel}</div>
          <div className="lb-meta">Tournament leaderboard · qualifying players only</div>
        </div>

        {rows.ranked.length === 0 ? (
          <div className="lb-meta" style={{ textAlign: 'center', padding: '24px 0' }}>
            No participants qualified for this month.
          </div>
        ) : (
          <table className="lb-table">
            <thead>
              <tr>
                <th></th>
                <th className="player-name-cell">Player</th>
                {isOverall
                  ? tournament.games.map(gId => (
                      <th key={gId}>{GAMES.find(g => g.id === gId)?.label.slice(0, 1) || gId}</th>
                    ))
                  : <th>Days played</th>}
                <th>{isOverall ? 'Total pts' : (isRatioLike ? 'Avg ratio' : 'Total pts')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.ranked.map(r => {
                const displayValue = isOverall
                  ? r.value
                  : (isRatioLike ? (r.value / (r.played || 1)).toFixed(3) : r.value);
                return (
                  <tr key={r.uid}>
                    <td><span className={`rank-badge ${rankClass(r.rank)}`}>{r.rank}</span></td>
                    <td className="player-name-cell">
                      <span className="player-dot" style={{ background: colorForUid(r.uid) }} />
                      {names[r.uid] || '…'}
                    </td>
                    {isOverall
                      ? tournament.games.map(gId => (
                          <td key={gId}>{r.perGame?.[gId] ? Math.round(r.perGame[gId].value) : '—'}</td>
                        ))
                      : <td>{r.played || 0} / {r.dailyCount}</td>}
                    <td>{displayValue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {charts && (
        <>
          {charts.composition && (
            <div className="leaderboard-card">
              <div className="lb-header">
                <div className="lb-title">Rank Composition</div>
                <div className="lb-meta">How often each player finished in each position</div>
              </div>
              <div style={{ position: 'relative', height: Math.max(200, charts.participants.length * 44 + 40) }}>
                <Bar
                  data={{
                    labels: charts.participants.map(uid => names[uid] || '…'),
                    datasets: RANK_LABELS.map((label, ri) => ({
                      label,
                      data: charts.participants.map(uid => charts.composition.counts[uid]?.[ri] || 0),
                      backgroundColor: RANK_COLORS[ri],
                    })).filter(ds => ds.data.some(v => v > 0)),
                  }}
                  options={{
                    indexAxis: 'y',
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } },
                      tooltip: {
                        callbacks: {
                          label: c => {
                            const val = c.parsed.x;
                            if (!val) return null;
                            const uid = charts.participants[c.dataIndex];
                            const total = charts.composition.played[uid] || 1;
                            return ` ${c.dataset.label}: ${val} (${Math.round(val / total * 100)}%)`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: { stacked: true, title: { display: true, text: 'Days' } },
                      y: { stacked: true },
                    },
                  }}
                />
              </div>
            </div>
          )}

          <div className="leaderboard-card">
            <div className="lb-header">
              <div className="lb-title">Daily Rank Progression</div>
              <div className="lb-meta">{isRatioLike ? 'Cumulative ratio over time — lower is better' : 'Smoothed daily rank — lower is better'}</div>
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <Line
                data={{
                  labels: charts.dates.map(d => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
                  datasets: charts.participants.map(uid => ({
                    label: names[uid] || '…',
                    data: charts.progression[uid],
                    borderColor: colorForUid(uid),
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2.5,
                    spanGaps: true,
                  })),
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 12 } },
                    y: isRatioLike ? {} : { reverse: true, min: 1, ticks: { stepSize: 1 } },
                  },
                }}
              />
            </div>
          </div>

          <div className="leaderboard-card">
            <div className="lb-header">
              <div className="lb-title">Avg Rank by Day of Week</div>
              <div className="lb-meta">1 = fastest</div>
            </div>
            <div style={{ position: 'relative', height: 260 }}>
              <Line
                data={{
                  labels: DOW_ORDER_SHORT,
                  datasets: charts.participants.map(uid => ({
                    label: names[uid] || '…',
                    data: charts.dowRank[uid],
                    borderColor: colorForUid(uid),
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 4,
                    borderWidth: 2.5,
                  })),
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } } },
                  scales: { y: { reverse: true, min: 1, ticks: { stepSize: 1 } } },
                }}
              />
            </div>
          </div>
        </>
      )}

      <div className="leaderboard-card">
        <div className="lb-title" style={{ marginBottom: 10 }}>Participants</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rows.ranked.map(r => (
            <span key={r.uid} className="pill-static" style={{ background: 'rgba(0,0,0,0.05)', borderRadius: 999, padding: '6px 14px', display: 'inline-flex', alignItems: 'center' }}>
              <span className="player-dot" style={{ background: colorForUid(r.uid) }} />
              {names[r.uid] || '…'}
            </span>
          ))}
          {rows.ranked.length === 0 && <span className="lb-meta">No one yet.</span>}
        </div>
      </div>
    </>
  );
}
