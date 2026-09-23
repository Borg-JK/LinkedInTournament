// components/PasteScoreForm.jsx
// The "paste-to-submit" flow: paste the text LinkedIn gives you on Share,
// parse it, and confirm before saving — never save silently on paste, since
// a parsing miss should be visible and correctable. Falls back to manual
// entry (InlineTimeEditor) if parsing fails or the detected game doesn't
// match the box this was pasted into.
import { useState } from 'react';
import { parseShareText } from '../lib/shareParser';
import { GAMES } from '../lib/games';
import { formatSeconds } from '../lib/time';
import InlineTimeEditor from './InlineTimeEditor';

export default function PasteScoreForm({ gameId, onSave, onCancel, autoFocus = false }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [manual, setManual] = useState(false);

  function handleParse() {
    const result = parseShareText(text);
    setParsed(result);
    if (!result.ok || result.gameId !== gameId) setManual(true);
  }

  const label = GAMES.find(g => g.id === gameId)?.label || gameId;

  if (manual) {
    const mismatch = parsed?.ok && parsed.gameId !== gameId;
    return (
      <div className="paste-score-form">
        <div className="score-box-error">
          {mismatch
            ? `That looked like ${GAMES.find(g => g.id === parsed.gameId)?.label || parsed.gameId}, not ${label} — enter the time directly instead.`
            : parsed?.error}
        </div>
        <InlineTimeEditor onSave={onSave} onCancel={onCancel} autoFocus={autoFocus} />
      </div>
    );
  }

  if (parsed?.ok) {
    return (
      <div className="paste-score-form">
        <div className="paste-score-preview">
          {label} #{parsed.puzzleNum} — {formatSeconds(parsed.timeSeconds)}
          {parsed.qualifier ? ` (${parsed.qualifier})` : ''}
        </div>
        <div className="paste-score-actions">
          <button type="button" className="score-box-btn" onClick={() => onSave(parsed.timeSeconds, parsed.qualifier)}>Confirm</button>
          <button type="button" className="chip-link" onClick={() => setParsed(null)}>Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div className="paste-score-form">
      <textarea
        placeholder="Paste LinkedIn share"
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus={autoFocus}
        rows={2}
      />
      <div className="paste-score-actions">
        <button type="button" className="score-box-btn" onClick={handleParse} disabled={!text.trim()}>Parse</button>
        {onCancel && <button type="button" className="chip-link" onClick={onCancel}>Type it in instead</button>}
      </div>
    </div>
  );
}
