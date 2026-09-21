// components/ScoreBoxes.jsx
// One box per game, for today's puzzle — every game gets a box regardless
// of whether this person "plays" it; which games are theirs is self-evident
// from what they actually fill in (Phase 1 dropped a fixed preference).
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { useTodayScores, submitScore } from '../lib/useScores';
import { GAMES, puzzleNumberFor, todayIso } from '../lib/games';
import { formatSeconds, digitsFromInput, formatDigitsForDisplay, digitsToSeconds, secondsToDigits } from '../lib/time';
import { themeFor } from '../lib/theme';

function ScoreBox({ game, existing }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const puzzleNum = puzzleNumberFor(game.id);

  useEffect(() => {
    if (existing && !editing) setDigits(secondsToDigits(existing.timeSeconds));
  }, [existing, editing]);

  function handleInputChange(e) {
    setDigits(digitsFromInput(e.target.value));
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const seconds = digitsToSeconds(digits);
    if (seconds == null || seconds <= 0) {
      setError('Enter a time, e.g. 105 for 1:05.');
      return;
    }
    setBusy(true);
    try {
      await submitScore(user.uid, game.id, todayIso(), seconds);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const showForm = editing || existing === null;
  const theme = themeFor(game.id);

  return (
    <div className="score-box" style={{ '--sb-accent': theme.accent, '--sb-accent2': theme.accent2 }}>
      <div className="score-box-head">
        <span className="score-box-game">{game.label}</span>
        <span className="score-box-num">#{puzzleNum}</span>
      </div>

      {existing === undefined ? (
        <div className="score-box-loading">…</div>
      ) : showForm ? (
        <form onSubmit={handleSave} className="score-box-form">
          <input
            type="text"
            inputMode="numeric"
            placeholder="1:05"
            value={formatDigitsForDisplay(digits)}
            onChange={handleInputChange}
            autoFocus={editing}
          />
          <button type="submit" className="score-box-btn" disabled={busy}>
            {busy ? '…' : existing ? 'Save' : 'Add'}
          </button>
          {editing && (
            <button type="button" className="chip-link" onClick={() => { setEditing(false); setError(''); }}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="score-box-done">
          <span className="score-box-time">{formatSeconds(existing.timeSeconds)}</span>
          <button className="chip-link" onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}
      {error && <div className="score-box-error">{error}</div>}
    </div>
  );
}

export default function ScoreBoxes() {
  const { scores } = useTodayScores();
  return (
    <div className="score-boxes-grid">
      {GAMES.map(game => <ScoreBox key={game.id} game={game} existing={scores[game.id]} />)}
    </div>
  );
}
