// components/HallOfFameTab.jsx
// Auto-computed monthly winners, styled as the original's polaroid trophy
// cards. The original's trophies were photos uploaded by hand per month —
// no photos exist to port, so every card shows the "awaiting trophy"
// placeholder with the computed winner's name and score, which is exactly
// what the original itself shows before a photo's been added.
import { useMemo } from 'react';
import { monthsBetween, monthLabel } from '../lib/months';
import { computeMonthWinnerForGame, computeMonthWinnerOverall } from '../lib/hallOfFame';
import { GAMES } from '../lib/games';
import { colorForUid } from '../lib/colors';

function TrophyCard({ gameId, label, winner, isOverall }) {
  const initial = winner ? (winner.name || '?').charAt(0).toUpperCase() : null;
  return (
    <div className="trophy" data-game={gameId}>
      <div className="trophy-game" style={isOverall ? { color: 'var(--ed-accent2)', fontWeight: 700 } : undefined}>
        {isOverall ? '★ Overall' : label}
      </div>
      <div className="trophy-placeholder">
        {winner ? (
          <span className="trophy-avatar" style={{ background: colorForUid(winner.uid) }}>{initial}</span>
        ) : (
          <span className="trophy-placeholder-text">No data</span>
        )}
        {winner && <div className="trophy-placeholder-text">Awaiting trophy</div>}
      </div>
      <div className="trophy-name">{winner ? winner.name : '—'}</div>
      <div className="trophy-pts">
        {winner
          ? <><strong>{winner.isRatioLike ? winner.value.toFixed(3) : Math.round(winner.value)}</strong> {winner.isRatioLike ? 'avg ratio' : 'pts'}</>
          : 'Not played this month'}
      </div>
    </div>
  );
}

export default function HallOfFameTab({ tournament, names, byUidGame, periodEnd, joinedAtByUid }) {
  const months = useMemo(() => monthsBetween(tournament.startDate, periodEnd), [tournament.startDate, periodEnd]);
  const currentMonth = periodEnd.slice(0, 7);
  const multiGame = tournament.games.length > 1;

  return (
    <>
      <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 40px' }}>
        <div className="tournament-eyebrow" style={{ color: 'var(--ed-accent)' }}>The handmade trophy archive</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: 'var(--ed-text)', marginBottom: 12 }}>
          Champions <em style={{ fontStyle: 'italic', color: 'var(--ed-accent2)' }}>past</em>
        </h2>
        <p style={{ color: 'var(--ed-text-muted)', lineHeight: 1.6 }}>
          Whoever's on top at the end of each month gets the trophy — this page just doesn't have a photo of it yet.
        </p>
      </div>

      {months.map(month => {
        const isLive = month === currentMonth;
        return (
          <div key={month} className="hall-month">
            <div className="hall-month-divider">
              <div className="hall-month-label">{monthLabel(month).split(' ')[0]} <em>{monthLabel(month).split(' ')[1]}</em></div>
              <div className="hall-month-line" />
              <div className={`hall-month-status${isLive ? ' live' : ''}`}>{isLive ? 'In progress' : 'Decided'}</div>
            </div>
            <div className="hall-grid">
              {multiGame && (() => {
                const w = computeMonthWinnerOverall(byUidGame, month, tournament, periodEnd, joinedAtByUid);
                return (
                  <TrophyCard
                    key="overall"
                    gameId="overall"
                    label="Overall"
                    isOverall
                    winner={w ? { uid: w.uid, name: names[w.uid] || '…', value: w.value, isRatioLike: false } : null}
                  />
                );
              })()}
              {tournament.games.map(gameId => {
                const entriesByUid = {};
                for (const uid of tournament.members) entriesByUid[uid] = byUidGame[uid]?.[gameId] || [];
                const w = computeMonthWinnerForGame(entriesByUid, month, tournament, periodEnd, joinedAtByUid);
                return (
                  <TrophyCard
                    key={gameId}
                    gameId={gameId}
                    label={GAMES.find(g => g.id === gameId)?.label || gameId}
                    winner={w ? { uid: w.uid, name: names[w.uid] || '…', value: w.value, isRatioLike: w.isRatioLike } : null}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
