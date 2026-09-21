// components/SharedScoreIntake.jsx
// Lands here when Android's system share sheet sends LinkedIn's share text
// straight to this app (see the manifest's share_target, and AGENTS.md/
// PWA notes) — the GET-based share target just navigates to "/" with the
// shared text as a query param, no service worker needed. Picks that up,
// parses it the same way the score-box paste flow does, and asks for
// one-tap confirmation before saving (same "never save silently" rule).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { submitScore } from '../lib/useScores';
import { parseShareText } from '../lib/shareParser';
import { GAMES, todayIso } from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';
import InlineTimeEditor from './InlineTimeEditor';

export default function SharedScoreIntake() {
  const router = useRouter();
  const { user } = useAuth();
  const [pending, setPending] = useState(null); // parseShareText() result, or null
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [manualGame, setManualGame] = useState(GAMES[0].id);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.share_text;
    if (typeof raw === 'string' && raw.trim()) {
      setPending(parseShareText(raw));
      const { share_text, share_title, share_url, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  if (!pending || dismissed || !user) return null;

  async function handleSave(seconds, gameId, qualifier) {
    await submitScore(user.uid, gameId, todayIso(), seconds, qualifier);
    setSaved(true);
    setTimeout(() => setDismissed(true), 1600);
  }

  if (saved) {
    return (
      <section className="panel" style={{ marginBottom: 24, borderColor: 'var(--gold)' }}>
        <div className="section-sub" style={{ margin: 0 }}>Saved from your LinkedIn share ✓</div>
      </section>
    );
  }

  const theme = pending.ok ? themeFor(pending.gameId) : null;
  const label = pending.ok ? (GAMES.find(g => g.id === pending.gameId)?.label || pending.gameId) : null;

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <h2>Shared from LinkedIn</h2>
      {pending.ok ? (
        <>
          <div className="section-sub">
            Detected <strong style={{ color: theme?.accent }}>{label}</strong> #{pending.puzzleNum} — {formatSeconds(pending.timeSeconds)}
            {pending.qualifier ? ` (${pending.qualifier})` : ''}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn-sm" onClick={() => handleSave(pending.timeSeconds, pending.gameId, pending.qualifier)}>
              Save this score
            </button>
            <button className="btn-sm btn-sm-ghost" onClick={() => setDismissed(true)}>Discard</button>
          </div>
        </>
      ) : (
        <>
          <div className="section-sub">{pending.error} You can still enter it manually:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <select
              className="daily-compare-select"
              style={{ width: 'auto', marginBottom: 0 }}
              value={manualGame}
              onChange={e => setManualGame(e.target.value)}
            >
              {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <InlineTimeEditor
              onSave={seconds => handleSave(seconds, manualGame)}
              onCancel={() => setDismissed(true)}
              autoFocus
            />
          </div>
        </>
      )}
    </section>
  );
}
