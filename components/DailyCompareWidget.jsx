// components/DailyCompareWidget.jsx
// Narrow sidebar widget: toggle between games, see today's time for you and
// your friends, ranked — independent of any tournament.
import { useState, useMemo } from 'react';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
import { usePlayerGameScores } from '../lib/useScores';
import { GAMES, todayIso } from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';

export default function DailyCompareWidget() {
  const { user, profile } = useAuth();
  const { friends } = useFriends();
  const [gameId, setGameId] = useState(GAMES[0].id);
  const myUid = user?.uid;

  const compareUids = useMemo(
    () => (myUid ? [myUid, ...friends.map(f => f.uid)] : []),
    [myUid, friends]
  );
  const pairs = useMemo(() => compareUids.map(uid => ({ uid, gameId })), [compareUids, gameId]);
  const byUidGame = usePlayerGameScores(pairs);

  const today = todayIso();
  const nameFor = (uid) => (uid === myUid ? profile?.username : friends.find(f => f.uid === uid)?.username) || '…';

  const ready = compareUids.every(uid => byUidGame[uid]?.[gameId] !== undefined);
  const ranked = useMemo(() => {
    if (!ready) return [];
    const withTimes = compareUids
      .map(uid => ({ uid, entry: byUidGame[uid]?.[gameId]?.find(e => e.date === today) }))
      .filter(r => r.entry);
    withTimes.sort((a, b) => a.entry.timeSeconds - b.entry.timeSeconds);
    return withTimes.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [ready, compareUids, byUidGame, gameId, today]);

  const theme = themeFor(gameId);

  return (
    <aside className="daily-compare" style={{ '--dc-accent': theme.accent, '--dc-accent2': theme.accent2 }}>
      <div className="daily-compare-title">Today vs. friends</div>

      <div className="daily-compare-tabs">
        {GAMES.map(g => (
          <button
            key={g.id}
            type="button"
            className={`daily-compare-tab${gameId === g.id ? ' active' : ''}`}
            onClick={() => setGameId(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {!ready ? (
        <div className="list-empty">Loading…</div>
      ) : ranked.length === 0 ? (
        <div className="panel-empty" style={{ fontSize: '0.85rem' }}>
          No one's submitted {GAMES.find(g => g.id === gameId)?.label} today yet.
        </div>
      ) : (
        <ul className="daily-compare-list">
          {ranked.map(r => (
            <li key={r.uid} className={`daily-compare-row${r.uid === myUid ? ' daily-compare-me' : ''}`}>
              <span className="daily-compare-rank">{r.rank}</span>
              <span className="daily-compare-name">{nameFor(r.uid)}</span>
              <span className="daily-compare-time">{formatSeconds(r.entry.timeSeconds)}</span>
            </li>
          ))}
        </ul>
      )}

      {friends.length === 0 && (
        <div className="daily-compare-hint">Add friends to compare your daily times.</div>
      )}
    </aside>
  );
}
