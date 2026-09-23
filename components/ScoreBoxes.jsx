// components/ScoreBoxes.jsx
// One box per game, for today's puzzle — every game gets a box regardless
// of whether this person "plays" it; which games are theirs is self-evident
// from what they actually fill in (Phase 1 dropped a fixed preference).
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useTodayScores, submitScore, deleteScore } from '../lib/useScores';
import { GAMES, puzzleNumberFor, todayIso } from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';
import InlineTimeEditor from './InlineTimeEditor';
import PasteScoreForm from './PasteScoreForm';

function ScoreBox({ game, existing, loadError, onRetry, defaultMode }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  // Paste-to-submit is the default entry flow — typing digits in by hand is
  // the fallback — but it's a per-person preference (Settings gear menu),
  // not a hardcoded choice.
  const [mode, setMode] = useState(defaultMode); // 'paste' | 'type'
  const puzzleNum = puzzleNumberFor(game.id);

  async function handleSave(seconds, qualifier) {
    await submitScore(user.uid, game.id, todayIso(), seconds, qualifier);
    setEditing(false);
    setMode(defaultMode);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete today's ${game.label} time?`)) return;
    await deleteScore(user.uid, game.id, todayIso());
    setEditing(false);
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
    </div>
  );
}

export default function ScoreBoxes() {
  const { profile } = useAuth();
  const { scores, error, retry } = useTodayScores();
  const defaultMode = profile?.scoreEntryDefault || 'paste';
  return (
    <div className="score-boxes-grid">
      {GAMES.map(game => (
        <ScoreBox
          key={game.id}
          game={game}
          existing={scores[game.id]}
          loadError={error}
          onRetry={retry}
          defaultMode={defaultMode}
        />
      ))}
    </div>
  );
}
