// components/QuickPasteBox.jsx
// One box for every game (Settings → "One paste box"): paste what LinkedIn
// gives you on Share — one result, or several pasted one after another —
// and it works out which game each is from the share text itself. Like the
// per-box paste flow, it never saves silently: it shows what it found and
// where each will go, and you confirm.
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { submitScore } from '../lib/useScores';
import { parseShareText, splitShares } from '../lib/shareParser';
import { GAMES, todayIso, dateForPuzzleNumber, activePuzzleDayIso } from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';

function dayLabel(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Same rule as the score boxes and the share-sheet intake: the share's own
// puzzle number names the day; one that resolves into the future can't be
// right, so that falls back to the live puzzle day.
function dateFor(gameId, puzzleNum) {
  const fromNum = puzzleNum != null ? dateForPuzzleNumber(gameId, puzzleNum) : null;
  return fromNum && fromNum <= todayIso() ? fromNum : activePuzzleDayIso();
}

export default function QuickPasteBox({ scoresByDate = {} }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [found, setFound] = useState(null); // [{ ok, gameId, puzzleNum, timeSeconds, qualifier, date } | { ok: false, error }]
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null); // labels of what was just saved
  const [error, setError] = useState('');

  function read(value) {
    setSaved(null);
    setError('');
    if (!value.trim()) { setFound(null); return; }
    const results = splitShares(value).map(parseShareText).map(r => (r.ok ? { ...r, date: dateFor(r.gameId, r.puzzleNum) } : r));
    // The same game and day twice (pasted twice): keep the last one.
    const seen = new Set();
    setFound(results.reverse().filter(r => {
      if (!r.ok) return true;
      const k = `${r.gameId}|${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).reverse());
  }

  const good = (found || []).filter(r => r.ok);
  const label = id => GAMES.find(g => g.id === id)?.label || id;

  async function saveAll() {
    setBusy(true);
    setError('');
    try {
      for (const r of good) await submitScore(user.uid, r.gameId, r.date, r.timeSeconds, r.qualifier);
      setSaved(good.map(r => `${label(r.gameId)} ${formatSeconds(r.timeSeconds)}`));
      setText('');
      setFound(null);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="quick-paste" aria-label="Paste your LinkedIn results">
      <label htmlFor="quick-paste-input" className="quick-paste-label">Paste from LinkedIn</label>
      <textarea
        id="quick-paste-input"
        className="quick-paste-input"
        rows={3}
        value={text}
        placeholder={'Queens #912 | 0:05 and flawless 👑\nlnkd.in/queens.\n\nPaste one result, or several at once.'}
        onChange={e => { setText(e.target.value); read(e.target.value); }}
      />

      {found && found.length > 0 && (
        <ul className="quick-paste-found">
          {found.map((r, i) => {
            if (!r.ok) return <li key={`x${i}`} className="quick-paste-miss">{r.error}</li>;
            const existing = scoresByDate[r.date]?.[r.gameId];
            const theme = themeFor(r.gameId);
            return (
              <li key={`${r.gameId}|${r.date}`} className="quick-paste-hit" style={{ '--game': theme.accent }}>
                <span className="quick-paste-game">{label(r.gameId)}</span>
                <span className="quick-paste-num">#{r.puzzleNum}</span>
                <span className="quick-paste-time">{formatSeconds(r.timeSeconds)}</span>
                <span className="quick-paste-day">
                  {r.date === activePuzzleDayIso() ? 'today' : dayLabel(r.date)}
                  {existing && existing.timeSeconds !== r.timeSeconds ? ` · replaces ${formatSeconds(existing.timeSeconds)}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {good.length > 0 && (
        <button type="button" className="btn-sm quick-paste-save" disabled={busy} onClick={saveAll}>
          {busy ? 'Saving…' : good.length === 1 ? 'Save' : `Save all ${good.length}`}
        </button>
      )}
      {error && <p className="score-box-error">{error}</p>}
      {saved && <p className="quick-paste-saved" role="status">Saved ✓ {saved.join(' · ')}</p>}
    </section>
  );
}
