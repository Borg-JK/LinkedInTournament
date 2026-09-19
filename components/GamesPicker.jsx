// components/GamesPicker.jsx
import { GAMES, GAME_IDS } from '../lib/games';

export default function GamesPicker({ value, onChange }) {
  const allSelected = GAME_IDS.every(id => value.includes(id));

  function toggle(id) {
    onChange(value.includes(id) ? value.filter(g => g !== id) : [...value, id]);
  }

  function toggleAll() {
    onChange(allSelected ? [] : [...GAME_IDS]);
  }

  return (
    <div>
      <div className="picker-header">
        <span className="picker-count">
          {value.length} of {GAMES.length} selected
        </span>
        <button type="button" className="chip-link" onClick={toggleAll}>
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="games-grid">
        {GAMES.map(g => {
          const selected = value.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className={`game-chip${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => toggle(g.id)}
            >
              <span className="game-chip-check" aria-hidden="true" />
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
