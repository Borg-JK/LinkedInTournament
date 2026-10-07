// components/ScoreBoxes.jsx
// One box per game, for one puzzle day — every game gets a box regardless
// of whether this person "plays" it; which games are theirs is self-evident
// from what they actually fill in (Phase 1 dropped a fixed preference).
//
// The day is explicit rather than "today": puzzles publish at 09:00, so
// before then the live puzzle is still yesterday's, and you can switch to
// the previous day to fill in one you missed.
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useScoresForDate, submitScore, deleteScore } from '../lib/useScores';
import {
  GAMES, puzzleNumberFor, dateForPuzzleNumber, todayIso,
  activePuzzleDayIso, addDaysIso, PUZZLE_PUBLISH_HOUR,
} from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';
import InlineTimeEditor from './InlineTimeEditor';
import PasteScoreForm from './PasteScoreForm';

function dayLabel(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function ScoreBox({ game, dateIso, existing, loadError, onRetry, defaultMode }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  // Paste-to-submit is the default entry flow — typing digits in by hand is
  // the fallback — but it's a per-person preference (Settings gear menu),
  // not a hardcoded choice.
  const [mode, setMode] = useState(defaultMode); // 'paste' | 'type'
  // Set when a pasted share's puzzle number put the score on a different day
  // than the one on screen — otherwise the box would just look like it
  // silently failed to save.
  const [rehomedTo, setRehomedTo] = useState(null);
  const puzzleNum = puzzleNumberFor(game.id, dateIso);

  // A pasted share carries its puzzle number, which names the day exactly.
  // Trust it over whichever day is selected — that's what stops an 08:30
  // entry for last night's puzzle landing on today. Ignore a number that
  // resolves into the future, which only happens if it was misread.
  function resolveDate(pastedPuzzleNum) {
    if (pastedPuzzleNum == null) return dateIso;
    const fromNum = dateForPuzzleNumber(game.id, pastedPuzzleNum);
    if (!fromNum || fromNum > todayIso()) return dateIso;
    return fromNum;
  }

  async function handleSave(seconds, qualifier, pastedPuzzleNum) {
    const target = resolveDate(pastedPuzzleNum);
    await submitScore(user.uid, game.id, target, seconds, qualifier);
    setRehomedTo(target === dateIso ? null : target);
    setEditing(false);
    setMode(defaultMode);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete your ${game.label} time for ${dayLabel(dateIso)}?`)) return;
    try {
      await deleteScore(user.uid, game.id, dateIso);
      setEditing(false);
    } catch (err) {
      window.alert(err.message || 'Could not delete that score. Try again.');
    }
  }

  const showForm = editing || existing === null;
  const theme = themeFor(game.id);
  const boxStyle = {
    '--sb-accent': theme.accent,
    '--sb-accent2': theme.accent2,
    '--sb-bg': theme.bg,
    '--sb-bg-soft': theme.bgSoft,
    '--sb-text': theme.onDark ? 'var(--text-on-dark)' : 'var(--text)',
    '--sb-text-muted': theme.onDark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)',
    '--sb-input-bg': theme.onDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.75)',
    '--sb-input-border': theme.onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)',
  };

  return (
    <div className="score-box" style={boxStyle}>
      <div className="score-box-head">
        <span className="score-box-game">{game.label}</span>
        <span className="score-box-num">#{puzzleNum}</span>
      </div>

      {existing === undefined ? (
        loadError ? (
          <div className="score-box-form">
            <div className="score-box-error" style={{ margin: 0 }}>Couldn't load</div>
            <button type="button" className="chip-link" onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <div className="score-box-loading">…</div>
        )
      ) : showForm ? (
        <>
          {mode === 'paste' ? (
            <PasteScoreForm
              gameId={game.id}
              dateIso={dateIso}
              onSave={handleSave}
              onCancel={() => setMode('type')}
              autoFocus
            />
          ) : (
            <InlineTimeEditor
              initialSeconds={existing?.timeSeconds}
              onSave={handleSave}
              onCancel={editing ? () => setEditing(false) : null}
              saveLabel={existing ? 'Save' : 'Add'}
              autoFocus={editing}
            />
          )}
          {mode === 'type' && (
            <button type="button" className="chip-link score-box-mode-toggle" onClick={() => setMode('paste')}>
              Paste from LinkedIn instead
            </button>
          )}
        </>
      ) : (
        <div className="score-box-done">
          <span className="score-box-time">{formatSeconds(existing.timeSeconds)}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="chip-link" onClick={() => setEditing(true)}>Edit</button>
            <button className="chip-link chip-link-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}

      {rehomedTo && (
        <div className="score-box-rehomed">
          That share was puzzle #{puzzleNumberFor(game.id, rehomedTo)}, so it saved to{' '}
          <strong>{dayLabel(rehomedTo)}</strong>.
        </div>
      )}
    </div>
  );
}

export default function ScoreBoxes() {
  const { profile } = useAuth();
  // "Today" means today's *puzzle*, which before 09:00 still carries
  // yesterday's date. Computed once per mount; nobody sits on this page
  // across the 09:00 boundary often enough to warrant a ticking clock.
  const [liveDay] = useState(() => activePuzzleDayIso());
  const previousDay = addDaysIso(liveDay, -1);
  const [dateIso, setDateIso] = useState(liveDay);
  const { scores, loading, error, retry } = useScoresForDate(dateIso);
  const defaultMode = profile?.scoreEntryDefault || 'paste';

  // Only worth explaining when it's actually counter-intuitive — i.e. while
  // the live puzzle is dated yesterday because 09:00 hasn't come round yet.
  const beforePublish = liveDay !== todayIso();

  const filledIn = GAMES.filter(g => scores[g.id]).length;

  return (
    <section className="score-day">
      <div className="score-day-bar">
        <span className="score-day-label">Scores for</span>
        <div className="score-day-tabs">
          {/* Name and date are separate spans so a phone can stack them —
              "Today" over "Wed 7 Oct" — and still fit both days on one row. */}
          <button
            type="button"
            className={`home-tab score-day-tab${dateIso === liveDay ? ' active' : ''}`}
            onClick={() => setDateIso(liveDay)}
          >
            <span className="score-day-tab-name">Today</span>
            <span className="score-day-tab-date">{dayLabel(liveDay)}</span>
          </button>
          <button
            type="button"
            className={`home-tab score-day-tab${dateIso === previousDay ? ' active' : ''}`}
            onClick={() => setDateIso(previousDay)}
          >
            <span className="score-day-tab-name">Yesterday</span>
            <span className="score-day-tab-date">{dayLabel(previousDay)}</span>
          </button>
        </div>
        {!loading && <span className="score-day-count">{filledIn} of {GAMES.length} filled in</span>}
      </div>

      {beforePublish && (
        <p className="score-day-note">
          New puzzles go up at {PUZZLE_PUBLISH_HOUR}:00, so the one you can play right now is still
          {' '}{dayLabel(liveDay)}&apos;s — that&apos;s where a score entered now belongs.
        </p>
      )}

      <div className="score-boxes-grid">
        {GAMES.map(game => (
          <ScoreBox
            key={`${game.id}|${dateIso}`}
            game={game}
            dateIso={dateIso}
            existing={scores[game.id]}
            loadError={error}
            onRetry={retry}
            defaultMode={defaultMode}
          />
        ))}
      </div>
    </section>
  );
}
