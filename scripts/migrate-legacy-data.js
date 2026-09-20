#!/usr/bin/env node
// scripts/migrate-legacy-data.js
//
// One-time migration of the WhatsApp-parsed *_data.json history into
// Firestore: writes global scores/{uid}/{game}/{date} docs for every mapped
// player, and creates the "legacy" tournament everyone's added to. Not part
// of the deployed app — run locally by Borg, per scripts/migration-mapping.json.
//
// Usage:
//   node scripts/migrate-legacy-data.js --target=emulator [--summary-only]
//   node scripts/migrate-legacy-data.js --target=production --confirm
//
// Emulator target (default; do this first — no real data touched):
//   1. In one terminal: firebase emulators:start --only firestore
//   2. In another:      node scripts/migrate-legacy-data.js --target=emulator
//   3. Spot-check the results in the Emulator UI (usually http://localhost:4000)
//      against the live site's leaderboard for a handful of known scores.
//
// Production target (only once the emulator run looks right):
//   Firebase Console -> Project settings -> Service accounts -> Generate new
//   private key, save it somewhere local, then:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
//     node scripts/migrate-legacy-data.js --target=production --confirm

const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const ROOT = path.join(__dirname, '..');
const GAMES = [
  { file: 'queens_data.json',  id: 'queens',  numKey: 'queens_num'  },
  { file: 'tango_data.json',   id: 'tango',   numKey: 'tango_num'   },
  { file: 'mini_data.json',    id: 'mini',    numKey: 'mini_num'    },
  { file: 'zip_data.json',     id: 'zip',     numKey: 'zip_num'     },
  { file: 'patches_data.json', id: 'patches', numKey: 'patches_num' },
];

function parseArgs() {
  const args = { target: 'emulator', confirm: false, summaryOnly: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--target=')) args.target = arg.split('=')[1];
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--summary-only') args.summaryOnly = true;
  }
  return args;
}

function loadMapping() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'migration-mapping.json'), 'utf8'));
}

function loadGameData() {
  return GAMES.map(g => ({
    ...g,
    data: JSON.parse(fs.readFileSync(path.join(ROOT, g.file), 'utf8')),
  }));
}

async function main() {
  const args = parseArgs();
  const mapping = loadMapping();
  const games = loadGameData();

  // 1. Validate the mapping: every non-skip player needs a username.
  const missing = Object.entries(mapping.players)
    .filter(([, p]) => !p.skip && !p.username)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.error('These players are missing a username in scripts/migration-mapping.json:');
    missing.forEach(n => console.error(`  - ${n}`));
    console.error('Fill them in (or mark them { "skip": true }) and re-run.');
    process.exit(1);
  }

  // 2. Flag any player name found in the *_data.json files that isn't in
  // the mapping at all (a name not yet accounted for).
  const allDataNames = new Set();
  games.forEach(g => Object.keys(g.data).forEach(n => allDataNames.add(n)));
  const unmapped = [...allDataNames].filter(n => !(n in mapping.players));
  if (unmapped.length > 0) {
    console.warn('Warning: these names appear in the data but are not in migration-mapping.json (they will be skipped):');
    unmapped.forEach(n => console.warn(`  - ${n}`));
  }

  // 3. Connect to Firestore.
  if (args.target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
    initializeApp({ projectId: 'linkedintournam' });
    console.log(`Target: LOCAL EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST}) — safe, no real data touched.`);
  } else if (args.target === 'production') {
    if (!args.confirm) {
      console.error('Refusing to write to production without --confirm. Run against --target=emulator first and check the results.');
      process.exit(1);
    }
    initializeApp({ credential: applicationDefault(), projectId: 'linkedintournam' });
    console.log('Target: PRODUCTION (linkedintournam) — writing for real.');
  } else {
    console.error(`Unknown --target=${args.target}. Use "emulator" or "production".`);
    process.exit(1);
  }
  const db = getFirestore();

  // 4. Resolve usernames -> uids (via the same usernames/{lowercased} -> uid
  // lookup the app itself uses).
  async function resolveUsername(username) {
    const snap = await db.collection('usernames').doc(username.trim().toLowerCase()).get();
    if (!snap.exists) throw new Error(`Username "${username}" is not registered — ask them to sign in first.`);
    return snap.data().uid;
  }

  const uidByName = {};
  for (const [name, p] of Object.entries(mapping.players)) {
    if (p.skip) continue;
    uidByName[name] = await resolveUsername(p.username);
  }
  const ownerUid = await resolveUsername(mapping.ownerUsername);

  // 5. Build the score docs to write, and per-player/per-game counts for the summary.
  const writes = [];
  const counts = {};
  let earliestDate = null;

  for (const game of games) {
    for (const [name, entries] of Object.entries(game.data)) {
      const uid = uidByName[name];
      if (!uid) continue; // skipped or unmapped
      counts[name] = counts[name] || {};
      counts[name][game.id] = entries.length;
      for (const e of entries) {
        if (!earliestDate || e.date < earliestDate) earliestDate = e.date;
        const submittedAt = Timestamp.fromDate(new Date(`${e.date}T${e.time_submitted}`));
        writes.push({
          uid, game: game.id, date: e.date,
          data: { timeSeconds: e.time_seconds, puzzleNum: e[game.numKey], submittedAt },
        });
      }
    }
  }

  const migratedUids = Object.values(uidByName);
  const uniqueMembers = [...new Set([ownerUid, ...migratedUids])];

  // 6. Print the summary — always, regardless of target.
  console.log('\n=== Migration summary ===');
  console.log(`Players mapped: ${Object.keys(uidByName).length}`);
  for (const [name, byGame] of Object.entries(counts)) {
    const total = Object.values(byGame).reduce((a, b) => a + b, 0);
    console.log(`  ${name}: ${total} entries (${GAMES.map(g => `${g.id}=${byGame[g.id] || 0}`).join(', ')})`);
  }
  console.log(`Total score documents to write: ${writes.length}`);
  console.log(`Legacy tournament: "${mapping.legacyTournamentName}", owner=${mapping.ownerUsername}, members=${uniqueMembers.length}, startDate=${earliestDate}`);
  console.log('==========================\n');

  if (args.summaryOnly) {
    console.log('--summary-only set — no writes performed.');
    return;
  }

  // 7. Write scores in batches (Firestore caps a batch at 500 writes).
  let batch = db.batch();
  let opCount = 0;
  let totalWritten = 0;
  for (const w of writes) {
    const ref = db.collection('scores').doc(w.uid).collection(w.game).doc(w.date);
    batch.set(ref, w.data, { merge: true });
    opCount++;
    totalWritten++;
    if (opCount === 450) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
      process.stdout.write(`\rWritten ${totalWritten}/${writes.length} score docs...`);
    }
  }
  if (opCount > 0) await batch.commit();
  console.log(`\rWritten ${totalWritten}/${writes.length} score docs.        `);

  // 8. Create (or overwrite) the legacy tournament doc + members subcollection —
  // same shape the app's own createTournament() writes, so the normal UI
  // (member list, remove, edit settings) works on it unmodified.
  const legacyId = 'legacy-original-tournament';
  const name = mapping.legacyTournamentName;
  await db.collection('tournaments').doc(legacyId).set({
    name,
    nameLower: name.toLowerCase(),
    ownerId: ownerUid,
    createdAt: FieldValue.serverTimestamp(),
    games: GAMES.map(g => g.id),
    scoringMetric: 'simple',
    eligibilityThresholdPct: 50,
    startDate: earliestDate,
    joinPolicy: 'anytime',
    members: uniqueMembers,
    status: 'active',
  });
  const memberBatch = db.batch();
  for (const uid of uniqueMembers) {
    memberBatch.set(db.collection('tournaments').doc(legacyId).collection('members').doc(uid), {
      joinedAt: FieldValue.serverTimestamp(),
      role: uid === ownerUid ? 'owner' : 'member',
    });
  }
  await memberBatch.commit();
  console.log(`Legacy tournament written: tournaments/${legacyId}`);

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
