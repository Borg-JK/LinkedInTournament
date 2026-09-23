// lib/useAuth.js
// Firebase email-link (passwordless) auth. No Google/password sign-in — this is
// the only auth method for the app, per the Phase 1 brief.
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext(null);

// Local storage key used to round-trip the email address across the redirect to
// the user's mail client and back — Firebase's email-link flow needs it to
// complete sign-in and doesn't carry it in the link itself by default.
const PENDING_EMAIL_KEY = 'linkedin-tournament-pending-email';

function getSiteUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || '';
}

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

  // Step 1: request a sign-in link be emailed to the given address.
  async function sendSignInLink(email) {
    const actionCodeSettings = {
      url: `${getSiteUrl()}/auth/callback`,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    try {
      window.localStorage.setItem(PENDING_EMAIL_KEY, email);
    } catch {}
  }

  // Step 2: complete sign-in from the link the user clicked, called on the
  // /auth/callback page. Returns the signed-in user, or throws.
  async function completeSignInFromLink(href, emailOverride) {
    if (!isSignInWithEmailLink(auth, href)) {
      throw new Error('This sign-in link is invalid or has expired.');
    }
    let email = emailOverride;
    try {
      email = email || window.localStorage.getItem(PENDING_EMAIL_KEY);
    } catch {}
    if (!email) {
      throw new Error('NEEDS_EMAIL'); // caller should prompt for the email (e.g. opened on a different device)
    }
    const cred = await signInWithEmailLink(auth, email, href);
    try {
      window.localStorage.removeItem(PENDING_EMAIL_KEY);
    } catch {}
    return cred.user;
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

  // Whether an unfilled score box opens straight to the paste-a-LinkedIn-
  // share flow (the default) or the typed masked-digit entry — a personal
  // preference, not something to gate behind a full settings page.
  async function setScoreEntryDefault(mode) {
    if (!user?.uid) throw new Error('You must be signed in.');
    setProfile(prev => (prev ? { ...prev, scoreEntryDefault: mode } : prev));
    await setDoc(doc(db, 'users', user.uid), { scoreEntryDefault: mode }, { merge: true });
  }

  return (
    <AuthContext.Provider value={{
      user, profile, profileChecked, loading,
      sendSignInLink, completeSignInFromLink, logout,
      completeOnboarding, setScoreEntryDefault,
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
