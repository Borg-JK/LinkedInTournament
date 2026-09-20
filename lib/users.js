// lib/users.js — shared uid -> { uid, username } resolver with an in-memory
// cache (usernames don't change once claimed), used anywhere a uid needs a
// display name: friends lists, friend requests, tournament member lists.
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const usernameCache = new Map();

export async function resolveUser(uid) {
  if (usernameCache.has(uid)) return usernameCache.get(uid);
  const snap = await getDoc(doc(db, 'users', uid));
  const entry = { uid, username: snap.exists() ? snap.data().username : '(unknown)' };
  usernameCache.set(uid, entry);
  return entry;
}
