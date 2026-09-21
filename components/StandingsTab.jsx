// components/StandingsTab.jsx
import { useState, useMemo, useEffect } from 'react';
import { computeStandings, rankStandings } from '../lib/scoring';
import { computeTournamentStandings } from '../lib/standings';
import { monthsBetween, monthLabel, monthBounds } from '../lib/months';
import { GAMES } from '../lib/games';
import { colorForUid } from '../lib/colors';

function rankClass(rank) {
  return rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
}

export default function StandingsTab({ tournament, names, byUidGame, myUid, periodEnd, onGameThemeChange }) {
  const months = useMemo(() => monthsBetween(tournament.startDate, periodEnd), [tournament.startDate, periodEnd]);
  const [month, setMonth] = useState(months[0]);
  const multiGame = tournament.games.length > 1;
  const [game, setGame] = useState(multiGame ? 'overall' : tournament.games[0]);

  useEffect(() => { onGameThemeChange(game); }, [game, onGameThemeChange]);

  const { start, end } = monthBounds(month, tournament.startDate, periodEnd);
  const isOverall = game === 'overall';
  const isRatioLike = tournament.scoringMetric !== 'simple';
  const gameLabel = isOverall ? 'Overall' : (GAMES.find(g => g.id === game)?.label || game);

  const rows = useMemo(() => {
    if (start > end) return { ranked: [], perGameForOverall: null };
    if (isOverall) {
      const monthTournament = { ...tournament, startDate: start };
      const { ranked } = computeTournamentStandings(monthTournament, byUidGame, end);
      return { ranked, perGameForOverall: true };
    }
    const entriesByUid = {};
    for (const uid of tournament.members) entriesByUid[uid] = byUidGame[uid]?.[game] || [];
    const result = computeStandings(tournament.scoringMetric, entriesByUid, start, end, tournament.eligibilityThresholdPct);

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
    return { ranked, perGameForOverall: false };
  }, [tournament, byUidGame, game, isOverall, start, end]);

  return (
    <>
      <div className="editorial-controls">
        <select className="editorial-select" value={month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
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
