// lib/useFriends.js
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query,
  orderBy, startAt, endAt, limit, documentId, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';
import { resolveUser } from './users';

export function useFriends() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [friends, setFriends] = useState([]);           // [{ uid, username, since }]
  const [incomingRequests, setIncomingRequests] = useState([]); // [{ uid, username, sentAt }]
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!uid) { setFriends([]); setIncomingRequests([]); setLoading(false); return; }
    setLoading(true);

    const unsubFriends = onSnapshot(collection(db, 'users', uid, 'friends'), async (snap) => {
      const rows = await Promise.all(snap.docs.map(async d => {
        const { username } = await resolveUser(d.id);
        return { uid: d.id, username, since: d.data().since };
      }));
      if (mounted.current) setFriends(rows.sort((a, b) => a.username.localeCompare(b.username)));
    });

    const unsubRequests = onSnapshot(collection(db, 'users', uid, 'friendRequests'), async (snap) => {
      const rows = await Promise.all(snap.docs.map(async d => {
        const { username } = await resolveUser(d.id);
        return { uid: d.id, username, sentAt: d.data().sentAt };
      }));
      if (mounted.current) setIncomingRequests(rows);
      setLoading(false);
    });

    return () => { unsubFriends(); unsubRequests(); };
  }, [uid]);

  // Prefix search over the usernames collection (doc id = lowercased username).
  const searchUsernames = useCallback(async (prefixRaw) => {
    const prefix = prefixRaw.trim().toLowerCase();
    if (!prefix) return [];
    const q = query(
      collection(db, 'usernames'),
      orderBy(documentId()),
      startAt(prefix),
      endAt(prefix + ''),
      limit(8),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ uid: d.data().uid, username: d.id }))
      .filter(r => r.uid !== uid);
  }, [uid]);

  // Have I already sent target a request that's still pending?
  const hasSentRequestTo = useCallback(async (targetUid) => {
    const snap = await getDoc(doc(db, 'users', targetUid, 'friendRequests', uid));
    return snap.exists();
  }, [uid]);

  const isFriend = useCallback((targetUid) => friends.some(f => f.uid === targetUid), [friends]);
  const hasIncomingFrom = useCallback((targetUid) => incomingRequests.some(r => r.uid === targetUid), [incomingRequests]);

  const acceptRequest = useCallback(async (fromUid) => {
    if (!uid) return;
    const since = serverTimestamp();
    await runTransaction(db, async (tx) => {
      tx.set(doc(db, 'users', uid, 'friends', fromUid), { since });
      tx.set(doc(db, 'users', fromUid, 'friends', uid), { since });
      tx.delete(doc(db, 'users', uid, 'friendRequests', fromUid));
      // Clean up a mirror request too, in case both sides requested each other.
      tx.delete(doc(db, 'users', fromUid, 'friendRequests', uid));
    });
  }, [uid]);

  const declineRequest = useCallback(async (fromUid) => {
    if (!uid) return;
    await runTransaction(db, async (tx) => {
      tx.delete(doc(db, 'users', uid, 'friendRequests', fromUid));
    });
  }, [uid]);

  // Sends a request, or — if the target already has a pending request to me —
  // just accepts theirs instead of creating a redundant duplicate.
  const sendFriendRequest = useCallback(async (targetUid) => {
    if (!uid || targetUid === uid) return;
    if (isFriend(targetUid)) return;
    if (hasIncomingFrom(targetUid)) { await acceptRequest(targetUid); return; }
    const already = await hasSentRequestTo(targetUid);
    if (already) return;
    await runTransaction(db, async (tx) => {
      tx.set(doc(db, 'users', targetUid, 'friendRequests', uid), {
        status: 'pending',
        sentAt: serverTimestamp(),
      });
    });
  }, [uid, isFriend, hasIncomingFrom, hasSentRequestTo, acceptRequest]);

  return {
    friends, incomingRequests, loading,
    searchUsernames, hasSentRequestTo, isFriend, hasIncomingFrom,
    sendFriendRequest, acceptRequest, declineRequest,
  };
}

// "People you may know" — friends of your friends, ranked by how many of
// your friends know them, excluding yourself and anyone you're already
// friends with. Reads each friend's own friends subcollection, which
// firestore.rules allows precisely because you're already in it.
export function useSuggestedFriends(friends) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const friendsKey = friends.map(f => f.uid).sort().join(',');

  useEffect(() => {
    if (!uid || friends.length === 0) { setSuggestions([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const friendUidSet = new Set(friends.map(f => f.uid));
      const mutualCount = {}; // candidateUid -> count of my friends who know them
      await Promise.all(friends.map(async f => {
        const snap = await getDocs(collection(db, 'users', f.uid, 'friends'));
        snap.docs.forEach(d => {
          const candidateUid = d.id;
          if (candidateUid === uid || friendUidSet.has(candidateUid)) return;
          mutualCount[candidateUid] = (mutualCount[candidateUid] || 0) + 1;
        });
      }));
      const topUids = Object.keys(mutualCount)
        .sort((a, b) => mutualCount[b] - mutualCount[a])
        .slice(0, 6);
      const withNames = await Promise.all(topUids.map(async cUid => {
        const { username } = await resolveUser(cUid);
        return { uid: cUid, username, mutualCount: mutualCount[cUid] };
      }));
      if (!cancelled) { setSuggestions(withNames); setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, friendsKey]);

  return { suggestions, loading };
}
