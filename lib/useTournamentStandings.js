// lib/useTournamentStandings.js
import { useMemo } from 'react';
import { usePlayerGameScores } from './useScores';
import { computeTournamentStandings } from './standings';
import { todayIso } from './games';
import { effectivePeriodEnd } from './reveal';

// Live-recomputes a tournament's standings from the shared scores pool.
// Every (member, game) pair gets a deduplicated real-time listener (see
// usePlayerGameScores) so a submission — by this user or a fellow member —
// updates the ranking without a manual refresh.
export function useTournamentStandings(tournament) {
  const pairs = useMemo(() => {
    if (!tournament) return [];
    const list = [];
    for (const uid of tournament.members) {
      for (const gameId of tournament.games) {
        list.push({ uid, gameId });
      }
    }
    return list;
  }, [tournament?.id, tournament?.members?.join(','), tournament?.games?.join(',')]);

  const byUidGame = usePlayerGameScores(pairs);

  return useMemo(() => {
    if (!tournament) return { ranked: [], sortDir: 'desc', ready: false };
    // Wait until every member/game pair has reported at least once, so we
    // don't briefly show a wrong ranking computed from partial data.
    const ready = tournament.members.every(uid =>
      tournament.games.every(gameId => byUidGame[uid]?.[gameId] !== undefined)
    );
    if (!ready) return { ranked: [], sortDir: 'desc', ready: false };
    const result = computeTournamentStandings(tournament, byUidGame, effectivePeriodEnd(tournament, todayIso()));
    return { ...result, ready: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament, byUidGame]);
}
