// components/GamesPicker.jsx
import { GAMES } from '../lib/games';

export default function GamesPicker({ value, onChange }) {
  function toggle(id) {
    onChange(value.includes(id) ? value.filter(g => g !== id) : [...value, id]);
  }

  return (
    <div>
      {GAMES.map(g => (
        <label key={g.id} className="checkrow">
          <input
            type="checkbox"
            checked={value.includes(g.id)}
            onChange={() => toggle(g.id)}
          />
          {g.label}
        </label>
      ))}
    </div>
  );
}
