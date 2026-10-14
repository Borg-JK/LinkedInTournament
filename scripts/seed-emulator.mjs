// scripts/seed-emulator.mjs
// Fills the local Firebase emulators with a fixed, fictional friend group for
// the Playwright regression suite (tests/regression.spec.js). Never touches
// real Firebase: firebase-admin only talks to the emulators when
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set, and
// `firebase emulators:exec` (see the test:regression script) sets both.
//
// Everything here is deterministic — fixed uids, fixed dates, and times from
// a seeded PRNG — so two runs produce byte-identical standings. The suite
// pins the browser clock to FROZEN_NOW to match.
//
// The data deliberately includes the worst cases the redesign has to survive:
// a very long username, a member with zero entries, a day only one person
// played, and exact ties.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusing to seed: emulator hosts are not set. Run via `npm run test:regression`.');
  process.exit(1);
}

const { puzzleNumberFor, addDaysIso } = await import('../lib/games.js');

export const PROJECT_ID = 'demo-lt';
export const LOGIN_EMAIL = 'borg@test.local';
// Signed up but never finished onboarding — lands on /onboarding.
export const NEW_USER_EMAIL = 'new@test.local';

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const PLAYERS = [
  { uid: 'u_borg',  username: 'Borg',  email: LOGIN_EMAIL,         skill: 0.80, turnout: 1.00 },
  { uid: 'u_ana',   username: 'Ana',   email: 'ana@test.local',    skill: 0.95, turnout: 0.85 },
  { uid: 'u_nick',  username: 'Nick',  email: 'nick@test.local',   skill: 1.15, turnout: 0.70 },
  { uid: 'u_jacco', username: 'JaccoW', email: 'jacco@test.local', skill: 0.95, turnout: 0.60 },
  { uid: 'u_long',  username: 'Maximiliana-Charlotte_vanderWesthuizen', email: 'long@test.local', skill: 1.30, turnout: 0.45 },
  { uid: 'u_zero',  username: 'Zed',   email: 'zed@test.local',    skill: 1.00, turnout: 0.00 },
];

const GAMES = ['queens', 'tango', 'mini', 'zip', 'patches', 'wend'];
const BASE_SECONDS = { queens: 28, tango: 40, mini: 45, zip: 22, patches: 35, wend: 75 };

const FIRST_DAY = '2026-09-01';
// The suite freezes the browser clock at noon on this day. It must stay in
// the past: login tokens are issued at the real time, and a frozen clock
// ahead of that would see every fresh token as already expired.
const LAST_DAY = '2026-10-13';
// One day where only the signed-in player played anything.
const SOLO_DAY = '2026-10-10';
// Days where Ana and JaccoW post identical Queens times.
const TIE_DAYS = new Set(['2026-09-08', '2026-09-22', '2026-10-06']);

// mulberry32: tiny, seedable, and stable across Node versions.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function days(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

const tsAt = iso => Timestamp.fromDate(new Date(`${iso}T10:00:00Z`));

async function clearEmulators() {
  // Each run starts from nothing, so a half-finished earlier run can't leak in.
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

async function seed() {
  await clearEmulators();
  const writer = db.bulkWriter();

  for (const p of PLAYERS) {
    await auth.createUser({ uid: p.uid, email: p.email, emailVerified: true });
    writer.set(db.doc(`users/${p.uid}`), { email: p.email, username: p.username, friends: [], createdAt: tsAt(FIRST_DAY) });
    writer.set(db.doc(`usernames/${p.username.toLowerCase()}`), { uid: p.uid, createdAt: tsAt(FIRST_DAY) });
  }

  await auth.createUser({ uid: 'u_new', email: NEW_USER_EMAIL, emailVerified: true });

  // Borg is friends with everyone; Nick and Ana are friends with each other
  // too, so mutual-friend suggestions have something to show.
  const friendPairs = [
    ...PLAYERS.filter(p => p.uid !== 'u_borg').map(p => ['u_borg', p.uid]),
    ['u_nick', 'u_ana'],
  ];
  for (const [a, b] of friendPairs) {
    writer.set(db.doc(`users/${a}/friends/${b}`), { since: tsAt(FIRST_DAY) });
    writer.set(db.doc(`users/${b}/friends/${a}`), { since: tsAt(FIRST_DAY) });
  }

  // Scores.
  const rand = prng(20261013);
  for (const date of days(FIRST_DAY, LAST_DAY)) {
    for (const game of GAMES) {
      if (game === 'wend' && date < '2026-10-01') continue; // Wend launched Oct 1
      for (const p of PLAYERS) {
        const roll = rand();
        const jitter = rand();
        if (date === SOLO_DAY && p.uid !== 'u_borg') continue;
        if (roll >= p.turnout) continue;
        let seconds = Math.max(6, Math.round(BASE_SECONDS[game] * p.skill * (0.6 + jitter * 0.9)));
        if (game === 'queens' && TIE_DAYS.has(date) && (p.uid === 'u_ana' || p.uid === 'u_jacco')) seconds = 24;
        writer.set(db.doc(`scores/${p.uid}/${game}/${date}`), {
          timeSeconds: seconds,
          puzzleNum: puzzleNumberFor(game, date),
          submittedAt: tsAt(date),
        });
      }
    }
  }
  // Ties need both players present on those days regardless of turnout.
  for (const date of TIE_DAYS) {
    for (const uid of ['u_ana', 'u_jacco']) {
      writer.set(db.doc(`scores/${uid}/queens/${date}`), {
        timeSeconds: 24, puzzleNum: puzzleNumberFor('queens', date), submittedAt: tsAt(date),
      });
    }
  }

  // Tournaments.
  const allUids = PLAYERS.map(p => p.uid);
  const tournaments = [
    {
      id: 't_skim', name: 'SKIM', ownerId: 'u_borg', members: allUids,
      games: ['queens', 'tango', 'mini', 'zip', 'patches'], scoringMetric: 'simple',
      eligibilityThresholdPct: 20, joinPolicy: 'anytime', revealPolicy: 'live', revealIntervalDays: 5,
    },
    {
      id: 't_ratio', name: 'Ratio League', ownerId: 'u_nick', members: ['u_borg', 'u_ana', 'u_nick', 'u_jacco'],
      games: ['queens', 'zip'], scoringMetric: 'ratio',
      eligibilityThresholdPct: 30, joinPolicy: 'monthly', revealPolicy: 'interval', revealIntervalDays: 5,
    },
    {
      id: 't_solo', name: 'Wend Only', ownerId: 'u_ana', members: ['u_ana', 'u_long'],
      games: ['wend'], scoringMetric: 'simple',
      eligibilityThresholdPct: 20, joinPolicy: 'anytime', revealPolicy: 'live', revealIntervalDays: 5,
    },
  ];
  for (const t of tournaments) {
    const { id, ...rest } = t;
    writer.set(db.doc(`tournaments/${id}`), {
      ...rest, nameLower: t.name.toLowerCase(), startDate: FIRST_DAY, status: 'active', createdAt: tsAt(FIRST_DAY),
    });
    for (const uid of t.members) {
      writer.set(db.doc(`tournaments/${id}/members/${uid}`), {
        joinedAt: tsAt(FIRST_DAY), role: uid === t.ownerId ? 'owner' : 'member',
      });
    }
  }

  // Borg is invited to (not yet in) Wend Only — exercises the invites panel.
  writer.set(db.doc('users/u_borg/tournamentInvites/t_solo'), {
    tournamentName: 'Wend Only', invitedBy: 'u_ana', sentAt: tsAt('2026-10-12'), status: 'pending',
  });
  // Borg pins SKIM, so the pinned state shows.
  writer.set(db.doc('users/u_borg/tournamentPrefs/t_skim'), { pinned: true });

  await writer.close();
  console.log(`Seeded ${PLAYERS.length} players, ${tournaments.length} tournaments, scores ${FIRST_DAY}..${LAST_DAY}.`);
}

await seed();
