// components/GameChips.jsx — read-only display of a user's chosen games as badges
import { getGame } from '../lib/games';

export default function GameChips({ gameIds = [] }) {
  if (gameIds.length === 0) {
    return <span className="games-empty">No games selected yet</span>;
  }
  return (
    <div className="chip-row">
      {gameIds.map(id => {
        const game = getGame(id);
        return (
          <span key={id} className="badge" data-game={id}>
            {game?.label || id}
          </span>
        );
      })}
    </div>
  );
}
