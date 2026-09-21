// lib/useScores.js
// Global scores/{uid}/{game}/{date} — one fact per person per game per day,
// independent of any tournament (per the brief: tournaments never store
// their own copy of a score, they only read from this shared pool).
import { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';
import { GAME_IDS, puzzleNumberFor, todayIso } from './games';

export async function submitScore(uid, gameId, dateIso, timeSeconds, qualifier) {
  const data = {
    timeSeconds,
    puzzleNum: puzzleNumberFor(gameId, dateIso),
    submittedAt: serverTimestamp(),
  };
  if (qualifier) data.qualifier = qualifier;
  await setDoc(doc(db, 'scores', uid, gameId, dateIso), data, { merge: true });
}

export async function deleteScore(uid, gameId, dateIso) {
  await deleteDoc(doc(db, 'scores', uid, gameId, dateIso));
}

// Live "today" scores for the signed-in user, one per game — backs the
// score-entry boxes on the home page. Games aren't gated by any
// preference (Phase 1 dropped that) — every game gets a box; which ones
// someone actually uses is self-evident from what they fill in.
export function useTodayScores() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [scores, setScores] = useState({}); // gameId -> { timeSeconds, puzzleNum } | undefined
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setScores({}); setLoading(false); return; }
    setLoading(true);
    const today = todayIso();
    let pending = GAME_IDS.length;
    const unsubs = GAME_IDS.map(gameId => onSnapshot(doc(db, 'scores', uid, gameId, today), snap => {
      setScores(prev => ({ ...prev, [gameId]: snap.exists() ? snap.data() : null }));
      if (pending > 0) { pending--; if (pending === 0) setLoading(false); }
    }));
    return () => unsubs.forEach(u => u());
  }, [uid]);

  return { scores, loading };
}

// ── Shared subscription registry ────────────────────────────────────────────
// Tournament standings need every member's full history for each of the
// tournament's games. Several tournaments often share members/games, so
// this ref-counts one Firestore listener per (uid, game) pair across all
// consumers instead of each tournament opening its own — a friend group
// might have 3 overlapping tournaments, and this keeps that at N listeners
// instead of 3N.
const registry = new Map(); // "uid/game" -> { entries, listeners: Set<fn>, unsubscribe }

function keyFor(uid, gameId) { return `${uid}/${gameId}`; }

function subscribePlayerGame(uid, gameId, onChange) {
  const key = keyFor(uid, gameId);
  let entry = registry.get(key);
  if (!entry) {
    entry = { entries: [], listeners: new Set() };
    entry.unsubscribe = onSnapshot(collection(db, 'scores', uid, gameId), snap => {
      entry.entries = snap.docs.map(d => ({ date: d.id, timeSeconds: d.data().timeSeconds }));
      entry.listeners.forEach(fn => fn(entry.entries));
    });
    registry.set(key, entry);
  }
  entry.listeners.add(onChange);
  if (entry.entries.length > 0 || registry.has(key)) onChange(entry.entries);

  return () => {
    entry.listeners.delete(onChange);
    if (entry.listeners.size === 0) {
      entry.unsubscribe();
      registry.delete(key);
    }
  };
}

// Subscribes to every (uid, game) pair in `pairs` (deduped via the shared
// registry above) and calls back with { [uid]: { [game]: entries } }
// whenever any of them change.
export function usePlayerGameScores(pairs) {
  const [byUidGame, setByUidGame] = useState({});

  // Stable key so the effect only re-subscribes when the actual set of
  // pairs changes, not on every render of the caller.
  const pairsKey = pairs.map(p => keyFor(p.uid, p.gameId)).sort().join(',');

  useEffect(() => {
    if (pairs.length === 0) { setByUidGame({}); return; }
    const unsubs = pairs.map(({ uid, gameId }) => subscribePlayerGame(uid, gameId, (entries) => {
      setByUidGame(prev => ({ ...prev, [uid]: { ...prev[uid], [gameId]: entries } }));
    }));
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);

  return byUidGame;
}
