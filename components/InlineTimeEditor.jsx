// components/InlineTimeEditor.jsx
// The masked M:SS entry form — shared between today's score boxes and
// editing a past entry from the History tab, since both are "enter a time,
// save it" with the same digit-buffer masking behavior.
import { useState } from 'react';
import { digitsFromInput, formatDigitsForDisplay, digitsToSeconds, secondsToDigits } from '../lib/time';

export default function InlineTimeEditor({ initialSeconds, onSave, onCancel, saveLabel = 'Save', autoFocus = false, className = 'score-box-form' }) {
  const [digits, setDigits] = useState(initialSeconds != null ? secondsToDigits(initialSeconds) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const seconds = digitsToSeconds(digits);
    if (seconds == null || seconds <= 0) {
      setError('Enter a time, e.g. 105 for 1:05.');
      return;
    }
    setBusy(true);
    try {
      await onSave(seconds);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="1:05"
        value={formatDigitsForDisplay(digits)}
        onChange={e => { setDigits(digitsFromInput(e.target.value)); setError(''); }}
        autoFocus={autoFocus}
      />
      <button type="submit" className="score-box-btn" disabled={busy}>{busy ? '…' : saveLabel}</button>
      {onCancel && (
        <button type="button" className="chip-link" onClick={onCancel}>Cancel</button>
      )}
      {error && <div className="score-box-error">{error}</div>}
    </form>
  );
}
