// lib/useTournamentChat.js
// A tournament's chat: tournaments/{id}/messages, readable and writable by
// its members only (see firestore.rules). Messages can't be edited; you can
// delete your own, and the tournament's owner can delete any.
import { useState, useEffect, useCallback } from 'react';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, limitToLast, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './useAuth';

export const MESSAGE_MAX = 1000;
// The latest this many; older ones aren't loaded.
const HISTORY = 100;

export function useTournamentChat(tournamentId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null); // [{ id, authorUid, text, createdAt }], oldest first

  useEffect(() => {
    if (!tournamentId) return undefined;
    setMessages(null);
    const q = query(collection(db, 'tournaments', tournamentId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(HISTORY));
    return onSnapshot(q,
      snap => setMessages(snap.docs.map(d => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return { id: d.id, authorUid: data.authorUid, text: data.text, createdAt: data.createdAt?.toMillis?.() ?? Date.now() };
      })),
      err => { console.error(`Couldn't load the chat for ${tournamentId}:`, err); setMessages([]); });
  }, [tournamentId]);

  const send = useCallback(async (text) => {
    const clean = text.trim().slice(0, MESSAGE_MAX);
    if (!clean || !user) return;
    await addDoc(collection(db, 'tournaments', tournamentId, 'messages'), {
      authorUid: user.uid, text: clean, createdAt: serverTimestamp(),
    });
  }, [tournamentId, user]);

  const remove = useCallback(async (messageId) => {
    await deleteDoc(doc(db, 'tournaments', tournamentId, 'messages', messageId));
  }, [tournamentId]);

  return { messages, send, remove };
}
