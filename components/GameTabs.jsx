// components/GameTabs.jsx
// Per-game tabs, like the original dashboard's — but generated from
// whichever games this specific tournament actually has, plus an "Overall"
// tab only when there's more than one game to combine.
import { GAMES } from '../lib/games';
import { themeFor } from '../lib/theme';

export default function GameTabs({ gameIds, active, onChange }) {
  const tabs = gameIds.length > 1 ? ['overall', ...gameIds] : [...gameIds];

  return (
    <div className="game-tabs">
      {tabs.map(id => {
        const theme = themeFor(id);
        const label = id === 'overall' ? 'Overall' : (GAMES.find(g => g.id === id)?.label || id);
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`game-tab${isActive ? ' game-tab-active' : ''}`}
            style={isActive ? { '--tab-accent': theme.accent, '--tab-accent2': theme.accent2 } : undefined}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
