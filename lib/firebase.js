// lib/firebase.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Explicit local persistence so the email-link sign-in survives a redirect back
// from the user's mail client (often a different tab/window) and mobile restarts.
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app);

// Local emulators, for the Playwright regression suite only (see
// tests/regression.spec.mjs). Off unless NEXT_PUBLIC_USE_EMULATORS=1, which
// is inlined at build time — so in production this whole block is dead code
// and the app talks to real Firebase exactly as before. The global flag
// stops a dev-server hot reload from connecting twice, which throws.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === '1' && typeof window !== 'undefined' && !window.__ltEmulatorsConnected) {
  window.__ltEmulatorsConnected = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
