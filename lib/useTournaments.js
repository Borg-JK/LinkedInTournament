// lib/useTournaments.js
import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, deleteDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, startAt, endAt, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';

export const JOIN_POLICIES = [
  { id: 'anytime', label: 'Anytime', desc: 'People join the moment they’re accepted.' },
  { id: 'monthly', label: 'Only at the start of the month',
    desc: 'Accepted mid-month, they wait — and join automatically once the next month begins.' },
];
export const DEFAULT_JOIN_POLICY = 'anytime';

// First day of next calendar month, as a Firestore Timestamp — when someone
// accepted under a 'monthly' join policy actually becomes a member.
function nextMonthStart() {
  const now = new Date();
  return Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

// tournaments/{id} holds config + membership only — no scores. Standings are
// always computed on the fly (Phase 5) from the global scores collection,
// filtered to this doc's games + members.
//
// Nobody is added unilaterally: an owner-sent invite needs the invitee to
// accept, and a self-service join request needs the owner to approve. Under
// a 'monthly' joinPolicy, an acceptance/approval parks the person on a
// waitlist instead of adding them immediately — they self-promote once the
// next month starts (see useWaitlist() below; there's no server-side
// scheduler in this app, so promotion happens lazily, next time they load
// the app, rather than the instant the month turns over).
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

  const createTournament = useCallback(async ({ name, games, scoringMetric, eligibilityThresholdPct, startDate, joinPolicy, inviteUids = [] }) => {
    if (!uid) throw new Error('You must be signed in.');
    const trimmedName = name.trim();
    const id = doc(collection(db, 'tournaments')).id; // local id, no network call

    await setDoc(doc(db, 'tournaments', id), {
      name: trimmedName,
      nameLower: trimmedName.toLowerCase(),
      ownerId: uid,
      createdAt: serverTimestamp(),
      games,
      scoringMetric,
      eligibilityThresholdPct,
      startDate,
      joinPolicy,
      members: [uid],
      status: 'active',
    });

    // Owner's own member doc, written once the parent exists (see firestore.rules).
    await setDoc(doc(db, 'tournaments', id, 'members', uid), {
      joinedAt: serverTimestamp(),
      role: 'owner',
    });

    // Invite everyone else selected — they're not members until they accept.
    await Promise.all(inviteUids.filter(u => u !== uid).map(u => setDoc(
      doc(db, 'users', u, 'tournamentInvites', id),
      { tournamentName: trimmedName, invitedBy: uid, sentAt: serverTimestamp(), status: 'pending' },
    )));

    return id;
  }, [uid]);

  const deleteTournament = useCallback(async (id) => {
    const [members, joinRequests, waitlist] = await Promise.all([
      getDocs(collection(db, 'tournaments', id, 'members')),
      getDocs(collection(db, 'tournaments', id, 'joinRequests')),
      getDocs(collection(db, 'tournaments', id, 'waitlist')),
    ]);
    await Promise.all([
      ...members.docs.map(d => deleteDoc(d.ref)),
      ...joinRequests.docs.map(d => deleteDoc(d.ref)),
      ...waitlist.docs.map(d => deleteDoc(d.ref)),
    ]);
    // Any still-pending invites under invitees' own trees are left as-is —
    // accepting one for a deleted tournament fails safely (the parent doc
    // is gone) and the UI self-cleans a stale invite on that failure.
    await deleteDoc(doc(db, 'tournaments', id));
  }, []);

  return { tournaments, loading, createTournament, deleteTournament };
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

// Prefix search over tournament names (nameLower), same pattern as username search.
export async function searchTournaments(prefixRaw) {
  const prefix = prefixRaw.trim().toLowerCase();
  if (!prefix) return [];
  const q = query(
    collection(db, 'tournaments'),
    orderBy('nameLower'),
    startAt(prefix),
    endAt(prefix + ''),
    limit(8),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Owner actions ──────────────────────────────────────────────────────────

export async function updateTournamentSettings(id, { name, games, scoringMetric, eligibilityThresholdPct, startDate, joinPolicy }) {
  const trimmedName = name.trim();
  await updateDoc(doc(db, 'tournaments', id), {
    name: trimmedName,
    nameLower: trimmedName.toLowerCase(),
    games,
    scoringMetric,
    eligibilityThresholdPct,
    startDate,
    joinPolicy,
  });
}

export async function removeMember(tournamentId, memberUid) {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'members', memberUid));
  await updateDoc(doc(db, 'tournaments', tournamentId), { members: arrayRemove(memberUid) });
}

export async function inviteToTournament(tournamentId, tournamentName, ownerUid, targetUid) {
  await setDoc(doc(db, 'users', targetUid, 'tournamentInvites', tournamentId), {
    tournamentName, invitedBy: ownerUid, sentAt: serverTimestamp(), status: 'pending',
  });
}

export async function cancelInvite(tournamentId, targetUid) {
  await deleteDoc(doc(db, 'users', targetUid, 'tournamentInvites', tournamentId));
}

export async function hasPendingInvite(tournamentId, targetUid) {
  const snap = await getDoc(doc(db, 'users', targetUid, 'tournamentInvites', tournamentId));
  return snap.exists();
}

export function watchWaitlist(tournamentId, cb) {
  return onSnapshot(collection(db, 'tournaments', tournamentId, 'waitlist'), snap => {
    cb(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

// Owner-only: admit a waitlisted person right away instead of waiting for
// next month. Allowed by the same "owner has full members control" rule
// branch as removeMember()/approveJoinRequest().
export async function promoteFromWaitlist(tournamentId, targetUid) {
  await addMemberNow(tournamentId, targetUid, 'member');
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'waitlist', targetUid));
  await deleteDoc(doc(db, 'users', targetUid, 'waitlisted', tournamentId));
}

export function watchJoinRequests(tournamentId, cb) {
  return onSnapshot(collection(db, 'tournaments', tournamentId, 'joinRequests'), snap => {
    cb(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

// Puts someone straight into `members`, bypassing the waitlist even under a
// 'monthly' policy — used for the owner's own invite-accept/join-approve
// paths when the tournament is 'anytime', shared with the waitlist promotion
// helpers below.
async function addMemberNow(tournamentId, targetUid, role) {
  await updateDoc(doc(db, 'tournaments', tournamentId), { members: arrayUnion(targetUid) });
  await setDoc(doc(db, 'tournaments', tournamentId, 'members', targetUid), {
    joinedAt: serverTimestamp(), role,
  });
}

async function addToWaitlist(tournamentId, tournamentName, targetUid) {
  const eligibleFrom = nextMonthStart();
  await setDoc(doc(db, 'tournaments', tournamentId, 'waitlist', targetUid), { addedAt: serverTimestamp(), eligibleFrom });
  await setDoc(doc(db, 'users', targetUid, 'waitlisted', tournamentId), { tournamentName, eligibleFrom });
}

export async function approveJoinRequest(tournamentId, requesterUid) {
  const snap = await getDoc(doc(db, 'tournaments', tournamentId));
  const tournament = snap.data();
  if (tournament.joinPolicy === 'monthly') {
    await addToWaitlist(tournamentId, tournament.name, requesterUid);
  } else {
    await addMemberNow(tournamentId, requesterUid, 'member');
  }
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'joinRequests', requesterUid));
}

export async function declineJoinRequest(tournamentId, requesterUid) {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'joinRequests', requesterUid));
}

// ── Non-member actions ──────────────────────────────────────────────────────

export async function requestToJoin(tournamentId, requesterUid) {
  await setDoc(doc(db, 'tournaments', tournamentId, 'joinRequests', requesterUid), {
    status: 'pending', requestedAt: serverTimestamp(),
  });
}

export async function cancelJoinRequest(tournamentId, requesterUid) {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'joinRequests', requesterUid));
}

export async function hasPendingJoinRequest(tournamentId, uid) {
  const snap = await getDoc(doc(db, 'tournaments', tournamentId, 'joinRequests', uid));
  return snap.exists();
}

// ── Invitee actions (accept/decline an owner-sent invite) ──────────────────

export function useTournamentInvites() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setInvites([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(collection(db, 'users', uid, 'tournamentInvites'), snap => {
      setInvites(snap.docs.map(d => ({ tournamentId: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [uid]);

  const acceptInvite = useCallback(async (tournamentId) => {
    if (!uid) return;
    const snap = await getDoc(doc(db, 'tournaments', tournamentId));
    if (!snap.exists()) {
      // Stale invite for a deleted tournament — self-clean and bail.
      await deleteDoc(doc(db, 'users', uid, 'tournamentInvites', tournamentId));
      throw new Error('This tournament no longer exists.');
    }
    const tournament = snap.data();
    if (tournament.joinPolicy === 'monthly') {
      await addToWaitlist(tournamentId, tournament.name, uid);
    } else {
      await addMemberNow(tournamentId, uid, 'member');
    }
    await deleteDoc(doc(db, 'users', uid, 'tournamentInvites', tournamentId));
  }, [uid]);

  const declineInvite = useCallback(async (tournamentId) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'tournamentInvites', tournamentId));
  }, [uid]);

  return { invites, loading, acceptInvite, declineInvite };
}

// ── Waitlist self-promotion ─────────────────────────────────────────────────
// Call once per app load (see components/TopNav.jsx) to promote anyone whose
// wait is over. Lazy by design — see the module doc comment above.
export function useWaitlist() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [waiting, setWaiting] = useState([]);

  useEffect(() => {
    if (!uid) { setWaiting([]); return; }
    return onSnapshot(collection(db, 'users', uid, 'waitlisted'), snap => {
      setWaiting(snap.docs.map(d => ({ tournamentId: d.id, ...d.data() })));
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || waiting.length === 0) return;
    const now = Timestamp.now();
    waiting
      .filter(w => w.eligibleFrom && w.eligibleFrom.toMillis() <= now.toMillis())
      .forEach(async (w) => {
        try {
          await addMemberNow(w.tournamentId, uid, 'member');
          await deleteDoc(doc(db, 'tournaments', w.tournamentId, 'waitlist', uid));
          await deleteDoc(doc(db, 'users', uid, 'waitlisted', w.tournamentId));
        } catch {
          // Tournament may have been deleted while waiting — nothing to promote into.
          await deleteDoc(doc(db, 'users', uid, 'waitlisted', w.tournamentId)).catch(() => {});
        }
      });
  }, [uid, waiting]);

  return waiting;
}
