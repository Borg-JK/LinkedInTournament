// tests/feed-rules.mjs
// Security-rules tests for feed reactions and comments, against the
// Firestore emulator with the real firestore.rules. Every case acts as a
// specific signed-in user and checks the rules allow or deny it.
//
//   npm run test:rules
//
// Talks to the emulator's REST API with unsigned tokens (which the emulator
// accepts), so it needs no extra dependency. Server timestamps go through
// the same REQUEST_TIME transform the client SDK's serverTimestamp() uses.
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/demo-lt/databases/(default)/documents`;
const COMMIT = `http://${HOST}/v1/projects/demo-lt/databases/(default)/documents:commit`;
const DOC = path => `projects/demo-lt/databases/(default)/documents/${path}`;

function token(uid) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid, user_id: uid, aud: 'demo-lt', iss: 'https://securetoken.google.com/demo-lt',
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'emailLink' },
  })}.`;
}

const str = v => ({ stringValue: v });

// Write one document; `serverTime` names fields set to the request time.
async function write(uid, path, fields, { serverTime = [], update = false } = {}) {
  const res = await fetch(COMMIT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(uid)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        update: { name: DOC(path), fields },
        ...(update ? { currentDocument: { exists: true } } : {}),
        ...(serverTime.length ? { updateTransforms: serverTime.map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}),
      }],
    }),
  });
  return res.ok;
}
async function del(uid, path) {
  const res = await fetch(COMMIT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(uid)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ delete: DOC(path) }] }),
  });
  return res.ok;
}
// As the emulator's admin ("owner" token), bypassing the rules: used to
// change a tournament's members the way the owner's own flow would.
async function adminSetMembers(tournamentPath, uids) {
  const res = await fetch(`${BASE}/${tournamentPath}?updateMask.fieldPaths=members`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { members: { arrayValue: { values: uids.map(str) } } } }),
  });
  if (!res.ok) throw new Error(`admin update of ${tournamentPath} failed: ${res.status}`);
}
async function read(uid, path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token(uid)}` } });
  return res.ok;
}

// Ana's real seeded Queens score; Borg and Nick are her friends,
// Maximiliana (u_long) is Borg's friend but not hers.
const POST = 'scores/u_ana/queens/2026-10-13';
const REACT = uid => `${POST}/reactions/${uid}`;
const COMMENTS = `${POST}/comments`;

let failures = 0;
async function expect(label, promise, want) {
  const got = await promise;
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${want ? 'allowed' : 'denied '}  ${label}${ok ? '' : `  (got ${got ? 'allowed' : 'denied'})`}`);
}

console.log('— reactions');
await expect('a friend reacts to a post', write('u_borg', REACT('u_borg'), { emoji: str('🔥') }, { serverTime: ['at'] }), true);
await expect('reacting again replaces it (one per person)', write('u_borg', REACT('u_borg'), { emoji: str('👏') }, { serverTime: ['at'] }), true);
await expect('a friend reads the reactions', read('u_nick', REACT('u_borg')), true);
await expect('the poster reacts to their own post', write('u_ana', REACT('u_ana'), { emoji: str('🙌') }, { serverTime: ['at'] }), true);
await expect('an emoji outside the six', write('u_nick', REACT('u_nick'), { emoji: str('🍆') }, { serverTime: ['at'] }), false);
await expect('reacting as someone else', write('u_borg', REACT('u_nick'), { emoji: str('🔥') }, { serverTime: ['at'] }), false);
await expect('a made-up timestamp instead of the server time', write('u_nick', REACT('u_nick'), { emoji: str('🔥'), at: { timestampValue: '2020-01-01T00:00:00Z' } }), false);
await expect('an extra field on a reaction', write('u_nick', REACT('u_nick'), { emoji: str('🔥'), note: str('x') }, { serverTime: ['at'] }), false);
await expect('a friend of a friend reacts', write('u_long', REACT('u_long'), { emoji: str('🔥') }, { serverTime: ['at'] }), false);
await expect('a friend of a friend reads the reactions', read('u_long', REACT('u_borg')), false);
await expect('reacting to a score that doesn\'t exist', write('u_borg', 'scores/u_ana/queens/2020-01-01/reactions/u_borg', { emoji: str('🔥') }, { serverTime: ['at'] }), false);
await expect('removing someone else\'s reaction', del('u_nick', REACT('u_borg')), false);
await expect('removing your own reaction', del('u_borg', REACT('u_borg')), true);

console.log('— comments');
const c = id => `${COMMENTS}/${id}`;
await expect('a friend comments as themselves', write('u_borg', c('c1'), { authorUid: str('u_borg'), text: str('how is that even possible') }, { serverTime: ['createdAt'] }), true);
await expect('a friend reads comments', read('u_nick', c('c1')), true);
await expect('commenting as someone else', write('u_borg', c('c2'), { authorUid: str('u_nick'), text: str('hi') }, { serverTime: ['createdAt'] }), false);
await expect('an empty comment', write('u_borg', c('c3'), { authorUid: str('u_borg'), text: str('') }, { serverTime: ['createdAt'] }), false);
await expect('a 501-character comment', write('u_borg', c('c4'), { authorUid: str('u_borg'), text: str('x'.repeat(501)) }, { serverTime: ['createdAt'] }), false);
await expect('a 500-character comment', write('u_borg', c('c5'), { authorUid: str('u_borg'), text: str('x'.repeat(500)) }, { serverTime: ['createdAt'] }), true);
await expect('an extra field on a comment', write('u_borg', c('c6'), { authorUid: str('u_borg'), text: str('hi'), pinned: { booleanValue: true } }, { serverTime: ['createdAt'] }), false);
await expect('editing a comment afterwards', write('u_borg', c('c1'), { authorUid: str('u_borg'), text: str('edited') }, { serverTime: ['createdAt'], update: true }), false);
await expect('a friend of a friend comments', write('u_long', c('c7'), { authorUid: str('u_long'), text: str('hi') }, { serverTime: ['createdAt'] }), false);
await expect('a friend of a friend reads comments', read('u_long', c('c1')), false);
await expect('deleting someone else\'s comment', del('u_nick', c('c1')), false);
await expect('the poster deletes a comment on their score', del('u_ana', c('c5')), true);
await expect('deleting your own comment', del('u_borg', c('c1')), true);

console.log('— tournament-mates');
// Maximiliana isn't Ana's friend, but they're both in Wend Only (t_solo).
// Nick isn't in Wend Only, and Ratio League (t_ratio) doesn't have Maximiliana.
const MATE = 'users/u_ana/mates/u_long';
await expect('naming a tournament you\'re not both in', write('u_long', MATE, { via: str('t_ratio') }), false);
await expect('naming a tournament for someone else', write('u_borg', MATE, { via: str('t_solo') }), false);
await expect('claiming to be in a tournament with them when you aren\'t', write('u_nick', 'users/u_ana/mates/u_nick', { via: str('t_solo') }), false);
await expect('an extra field on a mate record', write('u_long', MATE, { via: str('t_solo'), x: str('y') }), false);
await expect('recording a tournament you share', write('u_long', MATE, { via: str('t_solo') }), true);
await expect('a tournament-mate reads the reactions', read('u_long', REACT('u_nick')), true);
await expect('a tournament-mate reacts', write('u_long', REACT('u_long'), { emoji: str('👏') }, { serverTime: ['at'] }), true);
await expect('a tournament-mate comments', write('u_long', c('m1'), { authorUid: str('u_long'), text: str('nice') }, { serverTime: ['createdAt'] }), true);
await expect('a stranger can\'t read someone else\'s mate record', read('u_nick', MATE), false);
await adminSetMembers('tournaments/t_solo', ['u_ana']);
await expect('after leaving the tournament: reading the reactions', read('u_long', REACT('u_nick')), false);
await expect('after leaving the tournament: reacting', write('u_long', REACT('u_long'), { emoji: str('🔥') }, { serverTime: ['at'] }), false);
await adminSetMembers('tournaments/t_solo', ['u_ana', 'u_long']);
await expect('the mate removes their own reaction', del('u_long', REACT('u_long')), true);
await expect('the poster deletes the mate\'s comment', del('u_ana', c('m1')), true);
await expect('the mate removes their mate record', del('u_long', MATE), true);
await expect('without the record, back to no access', read('u_long', REACT('u_nick')), false);

console.log('— unchanged');
await expect('any signed-in user can still read the score itself', read('u_long', POST), true);

console.log(failures === 0 ? '\nAll rules cases pass.' : `\n${failures} rules case(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
