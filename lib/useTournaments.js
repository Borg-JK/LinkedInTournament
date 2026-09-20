// lib/useTournaments.js
import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, getDocs, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';

// tournaments/{id} holds config + membership only — no scores. Standings are
// always computed on the fly (Phase 5) from the global scores collection,
// filtered to this doc's games + members.
export function useTournaments() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setTournaments([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'tournaments'), where('members', 'array-contains', uid));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setTournaments(rows);
      setLoading(false);
    });
  }, [uid]);

  // Config (games/scoringMetric/eligibilityThresholdPct) and membership are
  // fixed at creation — see firestore.rules. No edit/invite-more-later flow
  // yet; that's a natural follow-up once this is in real use.
  const createTournament = useCallback(async ({ name, games, scoringMetric, eligibilityThresholdPct, memberUids }) => {
    if (!uid) throw new Error('You must be signed in.');
    const id = doc(collection(db, 'tournaments')).id; // local id, no network call
    const members = Array.from(new Set([uid, ...memberUids]));

    await setDoc(doc(db, 'tournaments', id), {
      name: name.trim(),
      ownerId: uid,
      createdAt: serverTimestamp(),
      games,
      scoringMetric,
      eligibilityThresholdPct,
      members,
      status: 'active',
    });

    // Member subcollection docs are written only after the parent exists,
    // so firestore.rules can check ownerId via get() on the parent doc.
    await Promise.all(members.map(m => setDoc(doc(db, 'tournaments', id, 'members', m), {
      joinedAt: serverTimestamp(),
      role: m === uid ? 'owner' : 'member',
    })));

    return id;
  }, [uid]);

  return { tournaments, loading, createTournament };
}

export function useTournament(id) {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setTournament(null); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(doc(db, 'tournaments', id), snap => {
      setTournament(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
  }, [id]);

  return { tournament, loading };
}

export async function getTournamentMembers(id) {
  const snap = await getDocs(collection(db, 'tournaments', id, 'members'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
