// lib/useNotifications.js
// Reactions and comments other people left on your own times, for the
// pop-up on the dashboard. It watches your posts in the feed's window
// (today's and yesterday's puzzles — the only ones anyone can still see
// in the feed) and reports anything newer than the last time you looked.
//
// "Last time you looked" is users/{uid}.notificationsSeenAt, a server
// timestamp on your own profile, so closing the pop-up on your laptop
// means your phone doesn't show the same ones again.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';
import { usePlayerGameScores } from './useScores';
import { GAMES, GAME_IDS, activePuzzleDayIso, addDaysIso } from './games';

const millis = ts => ts?.toMillis?.() ?? null;

export function useNotifications() {
  const { user, profile } = useAuth();
  const myUid = user?.uid;

  // Seen-up-to, kept here as well as on the profile: the profile is read
  // once at sign-in, and marking seen should take effect straight away.
  const [seenAt, setSeenAt] = useState(undefined); // undefined = not known yet
  useEffect(() => {
    if (profile) setSeenAt(millis(profile.notificationsSeenAt) ?? 0);
  }, [profile]);

  const pairs = useMemo(() => (myUid ? GAME_IDS.map(gameId => ({ uid: myUid, gameId })) : []), [myUid]);
  const byUidGame = usePlayerGameScores(pairs);
  const mine = byUidGame[myUid] || {};

  // My posts in the window, as a stable key so the listeners below only
  // re-subscribe when a post appears or leaves.
  const liveDay = activePuzzleDayIso();
  const days = new Set([liveDay, addDaysIso(liveDay, -1)]);
  const posts = GAME_IDS.flatMap(gameId => (mine[gameId] || [])
    .filter(e => days.has(e.date))
    .map(e => ({ gameId, date: e.date, timeSeconds: e.timeSeconds })));
  const postsKey = posts.map(p => `${p.gameId}/${p.date}/${p.timeSeconds}`).sort().join(',');

  const [byPost, setByPost] = useState({}); // "game/date" -> { reactions, comments }
  useEffect(() => {
    if (!myUid) return undefined;
    const list = postsKey ? postsKey.split(',').map(k => { const [gameId, date, t] = k.split('/'); return { gameId, date, timeSeconds: Number(t) }; }) : [];
    const put = (key, part, value) => setByPost(prev => ({ ...prev, [key]: { ...prev[key], [part]: value } }));
    setByPost({});
    const unsubs = list.flatMap(({ gameId, date }) => {
      const key = `${gameId}/${date}`;
      const base = ['scores', myUid, gameId, date];
      const onErr = part => err => { console.error(`Couldn't load ${part} for ${key}:`, err); put(key, part, []); };
      return [
        onSnapshot(collection(db, ...base, 'reactions'), snap => put(key, 'reactions', snap.docs.map(d => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return { uid: d.id, emoji: data.emoji, at: millis(data.at) };
        })), onErr('reactions')),
        onSnapshot(collection(db, ...base, 'comments'), snap => put(key, 'comments', snap.docs.map(d => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return { id: d.id, uid: data.authorUid, text: data.text, at: millis(data.createdAt) };
        })), onErr('comments')),
      ];
    });
    return () => unsubs.forEach(u => u());
  }, [myUid, postsKey]);

  // Everything other people did on my posts, newest first.
  const all = useMemo(() => {
    const label = id => GAMES.find(g => g.id === id)?.label || id;
    const out = [];
    for (const p of posts) {
      const key = `${p.gameId}/${p.date}`;
      const post = { gameId: p.gameId, gameLabel: label(p.gameId), date: p.date, timeSeconds: p.timeSeconds };
      for (const r of byPost[key]?.reactions || []) {
        if (r.uid !== myUid && r.at != null) out.push({ id: `r:${key}:${r.uid}`, kind: 'reaction', uid: r.uid, emoji: r.emoji, at: r.at, post });
      }
      for (const c of byPost[key]?.comments || []) {
        if (c.uid !== myUid && c.at != null) out.push({ id: `c:${key}:${c.id}`, kind: 'comment', uid: c.uid, text: c.text, at: c.at, post });
      }
    }
    return out.sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byPost, postsKey, myUid]);

  const unseen = seenAt === undefined ? [] : all.filter(n => n.at > seenAt);

  const latest = all.length ? all[0].at : 0;
  const markSeen = useCallback(async () => {
    if (!myUid) return;
    // Locally, at least as late as the newest one shown — the device clock
    // and the server's needn't agree.
    setSeenAt(Math.max(Date.now(), latest));
    try {
      await updateDoc(doc(db, 'users', myUid), { notificationsSeenAt: serverTimestamp() });
    } catch (err) {
      console.error("Couldn't mark notifications as seen:", err);
    }
  }, [myUid, latest]);

  return { unseen, markSeen };
}
