// lib/useFeed.js
// The friends feed: every score you and your friends uploaded for today's
// and yesterday's puzzles, newest first, plus the reactions and comments on
// each one.
//
// Posts are the existing scores/{uid}/{game}/{date} docs — nothing new is
// written when someone uploads a time. Reactions and comments live under
// each score (see firestore.rules: only the poster and their friends can see
// or add them).
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, doc, setDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';
import { useFriends } from './useFriends';
import { usePlayerGameScores } from './useScores';
import { GAMES, GAME_IDS, puzzleNumberFor, activePuzzleDayIso, addDaysIso } from './games';

// The six reactions on offer. Must match the list in firestore.rules,
// which rejects anything else.
export const REACTIONS = ['🔥', '👏', '😮', '😂', '🙌', '💀'];

// The feed covers the same two puzzle days you can enter scores for:
// today's puzzle and yesterday's. A puzzle that rolls out of that window
// leaves the feed with its reactions and comments — they stay stored on the
// score, they just aren't shown.
export const FEED_LIMIT = 80;
export const COMMENT_MAX = 500;

const GAME_ORDER = Object.fromEntries(GAME_IDS.map((id, i) => [id, i]));

export function useFeed() {
  const { user, profile } = useAuth();
  const { friends } = useFriends();
  const myUid = user?.uid;

  const people = useMemo(() => {
    if (!myUid) return [];
    return [{ uid: myUid, username: profile?.username || 'You' }, ...friends.map(f => ({ uid: f.uid, username: f.username }))];
  }, [myUid, profile?.username, friends]);

  const pairs = useMemo(() => people.flatMap(p => GAME_IDS.map(gameId => ({ uid: p.uid, gameId }))), [people]);
  const byUidGame = usePlayerGameScores(pairs);
  const ready = pairs.length > 0 && pairs.every(({ uid, gameId }) => byUidGame[uid]?.[gameId] !== undefined);

  const posts = useMemo(() => {
    if (!ready) return [];
    const liveDay = activePuzzleDayIso();
    const days = new Set([liveDay, addDaysIso(liveDay, -1)]);
    const nameOf = Object.fromEntries(people.map(p => [p.uid, p.username]));
    const mine = byUidGame[myUid] || {};
    const out = [];
    for (const { uid, gameId } of pairs) {
      for (const e of byUidGame[uid]?.[gameId] || []) {
        if (!days.has(e.date)) continue;
        const myEntry = uid === myUid ? null : (mine[gameId] || []).find(m => m.date === e.date);
        out.push({
          id: `${uid}/${gameId}/${e.date}`,
          uid,
          name: nameOf[uid],
          isMine: uid === myUid,
          gameId,
          gameLabel: GAMES.find(g => g.id === gameId)?.label || gameId,
          date: e.date,
          puzzleNum: puzzleNumberFor(gameId, e.date),
          timeSeconds: e.timeSeconds,
          submittedAt: e.submittedAt,
          // Against your own time on the same puzzle, when you've played it.
          vsMine: myEntry ? e.timeSeconds - myEntry.timeSeconds : null,
        });
      }
    }
    // Newest first; ties (same instant) broken by date, then name, then game,
    // so the order is stable between renders.
    out.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      || a.name.localeCompare(b.name) || GAME_ORDER[a.gameId] - GAME_ORDER[b.gameId]);
    return out.slice(0, FEED_LIMIT);
  }, [ready, pairs, people, byUidGame, myUid]);

  return { posts, ready };
}

// One reaction per person per post; the doc id is the reactor's uid, so
// choosing a different emoji replaces yours and choosing yours again removes it.
export function useReactions(post) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState(null); // [{ uid, emoji }]
  const { uid, gameId, date } = post;

  useEffect(() => {
    return onSnapshot(collection(db, 'scores', uid, gameId, date, 'reactions'),
      snap => setReactions(snap.docs.map(d => ({ uid: d.id, emoji: d.data().emoji }))),
      err => { console.error(`Couldn't load reactions for ${uid}/${gameId}/${date}:`, err); setReactions([]); });
  }, [uid, gameId, date]);

  const mine = reactions?.find(r => r.uid === user?.uid)?.emoji || null;

  const react = useCallback(async (emoji) => {
    const ref = doc(db, 'scores', uid, gameId, date, 'reactions', user.uid);
    if (mine === emoji) await deleteDoc(ref);
    else await setDoc(ref, { emoji, at: serverTimestamp() });
  }, [uid, gameId, date, user?.uid, mine]);

  return { reactions, mine, react };
}

export function useComments(post) {
  const { user } = useAuth();
  const [comments, setComments] = useState(null); // [{ id, authorUid, text, createdAt }]
  const { uid, gameId, date } = post;

  useEffect(() => {
    const q = query(collection(db, 'scores', uid, gameId, date, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(q,
      snap => setComments(snap.docs.map(d => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return { id: d.id, authorUid: data.authorUid, text: data.text, createdAt: data.createdAt?.toMillis?.() ?? Date.now() };
      })),
      err => { console.error(`Couldn't load comments for ${uid}/${gameId}/${date}:`, err); setComments([]); });
  }, [uid, gameId, date]);

  const addComment = useCallback(async (text) => {
    const clean = text.trim().slice(0, COMMENT_MAX);
    if (!clean) return;
    await addDoc(collection(db, 'scores', uid, gameId, date, 'comments'), {
      authorUid: user.uid, text: clean, createdAt: serverTimestamp(),
    });
  }, [uid, gameId, date, user?.uid]);

  const deleteComment = useCallback(async (commentId) => {
    await deleteDoc(doc(db, 'scores', uid, gameId, date, 'comments', commentId));
  }, [uid, gameId, date]);

  return { comments, addComment, deleteComment };
}
