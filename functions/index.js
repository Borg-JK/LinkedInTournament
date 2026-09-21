// functions/index.js
// Email OTP sign-in — replaces Firebase's built-in email-link auth, which
// breaks when a link tapped in the Mail app hands off to the phone's
// default browser instead of this installed PWA. A typed code never
// requires leaving the app, so it has no such dependency.
//
// Email delivery goes through the Firebase "Trigger Email from Firestore"
// extension: requestLoginCode() writes a doc to the `mail` collection
// (the extension's default trigger collection) and the extension sends it
// via whatever SMTP provider it was configured with.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

exports.requestLoginCode = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }

  const ref = db.collection('emailOtps').doc(email);
  const snap = await ref.get();
  const now = Date.now();
  // Don't reveal whether this email already has an account — the response
  // shape is identical either way.
  if (snap.exists) {
    const createdAtMs = snap.data().createdAt?.toMillis?.() ?? 0;
    if (now - createdAtMs < RESEND_COOLDOWN_MS) {
      throw new HttpsError('resource-exhausted', 'Wait a moment before requesting another code.');
    }
  }

  const code = generateCode();
  await ref.set({
    code,
    expiresAt: new Date(now + CODE_TTL_MS),
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection('mail').add({
    to: email,
    message: {
      subject: `Your sign-in code: ${code}`,
      text: `Your LinkedIn Tournament sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Your LinkedIn Tournament sign-in code is:</p>`
        + `<p style="font-size:28px; font-weight:700; letter-spacing:0.15em;">${code}</p>`
        + `<p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    },
  });

  return { sent: true };
});

exports.verifyLoginCode = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  const code = String(request.data?.code || '').trim();
  if (!email || !code) {
    throw new HttpsError('invalid-argument', 'Email and code are required.');
  }

  const ref = db.collection('emailOtps').doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No code was requested for this email, or it already expired. Request a new one.');
  }

  const data = snap.data();
  const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
  if (Date.now() > expiresAtMs) {
    await ref.delete();
    throw new HttpsError('deadline-exceeded', 'That code expired. Request a new one.');
  }

  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    await ref.delete();
    throw new HttpsError('resource-exhausted', 'Too many wrong attempts. Request a new code.');
  }

  if (data.code !== code) {
    await ref.update({ attempts: FieldValue.increment(1) });
    throw new HttpsError('invalid-argument', 'That code is incorrect.');
  }

  await ref.delete();

  const auth = getAuth();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({ email, emailVerified: true });
    } else {
      throw err;
    }
  }

  const token = await auth.createCustomToken(userRecord.uid);
  return { token };
});
