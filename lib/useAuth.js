// lib/useAuth.js
// Email OTP (6-digit code) auth via the requestLoginCode/verifyLoginCode
// Cloud Functions — no Google/password sign-in, and no Firebase-hosted
// email-link either: an email link opened from the Mail app hands off to
// the phone's default browser rather than this installed PWA, breaking the
// "same browser" requirement that flow depends on. A typed code has no such
// dependency since the person never leaves the app.
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db, functions } from './firebase';

const AuthContext = createContext(null);

const requestLoginCodeFn = httpsCallable(functions, 'requestLoginCode');
const verifyLoginCodeFn = httpsCallable(functions, 'verifyLoginCode');

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null); // Firestore users/{uid} doc, or null
  const [profileChecked, setProfileChecked] = useState(false); // has the profile lookup finished?
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid) => {
    setProfileChecked(false);
    const snap = await getDoc(doc(db, 'users', uid));
    setProfile(snap.exists() ? snap.data() : null);
    setProfileChecked(true);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser.uid);
      } else {
        setProfile(null);
        setProfileChecked(true);
      }
      setLoading(false);
    });
    return unsub;
  }, [loadProfile]);

  // Step 1: request a 6-digit code be emailed to the given address.
  async function requestLoginCode(email) {
    await requestLoginCodeFn({ email });
  }

  // Step 2: verify the code the user typed in, and complete sign-in with the
  // custom token the function mints. Never leaves the app.
  async function verifyLoginCode(email, code) {
    const result = await verifyLoginCodeFn({ email, code });
    await signInWithCustomToken(auth, result.data.token);
  }

  async function logout() {
    await signOut(auth);
  }

  // Completes onboarding: claims a username. Atomic via transaction — the
  // usernames/{lowercased} doc doubles as the uniqueness lock, enforced again
  // server-side by firestore.rules. No upfront "games played" preference —
  // which games someone plays is self-evident from the scores they enter
  // (Phase 5), not something to collect at signup.
  async function completeOnboarding({ username }) {
    if (!user?.uid) throw new Error('You must be signed in.');
    const lowered = username.trim().toLowerCase();
    const usernameRef = doc(db, 'usernames', lowered);
    const userRef = doc(db, 'users', user.uid);

    await runTransaction(db, async (tx) => {
      const existing = await tx.get(usernameRef);
      if (existing.exists() && existing.data().uid !== user.uid) {
        throw new Error('USERNAME_TAKEN');
      }
      tx.set(usernameRef, { uid: user.uid, createdAt: serverTimestamp() });
      tx.set(userRef, {
        email: user.email,
        username: username.trim(),
        friends: [],
        createdAt: serverTimestamp(),
      }, { merge: true });
    });

    await loadProfile(user.uid);
  }

  return (
    <AuthContext.Provider value={{
      user, profile, profileChecked, loading,
      requestLoginCode, verifyLoginCode, logout,
      completeOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Fast, non-authoritative availability check for live form feedback. The
// transaction in completeOnboarding (and firestore.rules) is what actually
// enforces uniqueness — this just avoids a round trip before the user submits.
export async function checkUsernameAvailable(username) {
  const lowered = username.trim().toLowerCase();
  if (!lowered) return false;
  const snap = await getDoc(doc(db, 'usernames', lowered));
  return !snap.exists();
}

export function isValidUsername(username) {
  return /^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase());
}
