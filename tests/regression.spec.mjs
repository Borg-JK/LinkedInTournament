// tests/regression.spec.mjs
// Behaviour lock for the redesign. Walks every view and every read-only
// control against the seeded emulators (scripts/seed-emulator.mjs) with the
// clock frozen, and records:
//
//   1. tests/baseline/functional.json — every table row, chart dataset,
//      score, placement, winner and count the app renders. A normal run
//      compares against it exactly; any difference fails the test.
//   2. Full-page screenshots of every view at phone, tablet and desktop
//      widths, into redesign-screenshots/before (baseline run) or
//      redesign-screenshots/after (every other run).
//
//   npm run test:regression          — compare against the baseline
//   npm run test:regression:update   — record a new baseline
//
// Only data is compared, never wording or layout: table cells, chart data,
// and the values inside score boxes, cards and stat lines. Headings and
// explanatory copy are free to change; numbers are not.
//
// Controls that write to the database (entering or deleting a score,
// pinning, recolouring, inviting) are deliberately not clicked — doing so
// would change the data every later step reads. Their forms are opened and
// cancelled for the screenshots instead.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const UPDATE = process.env.UPDATE_BASELINE === '1';
const BASELINE = path.join('tests', 'baseline', 'functional.json');
const SCREENS = path.join('redesign-screenshots', UPDATE ? 'before' : 'after');

// Noon on the seed's last day, Amsterdam time — after the 09:00 publish
// cutoff, so the live puzzle day is the 13th. Must stay in the past; see the
// note on LAST_DAY in scripts/seed-emulator.mjs.
const FROZEN_NOW = new Date('2026-10-13T12:00:00+02:00');
const BEFORE_PUBLISH = new Date('2026-10-13T08:30:00+02:00');

const LOGIN_EMAIL = 'borg@test.local';
const NEW_USER_EMAIL = 'new@test.local';
const OOB_URL = 'http://127.0.0.1:9099/emulator/v1/projects/demo-lt/oobCodes';

const VIEWPORTS = [
  { name: 'phone',   width: 390,  height: 844,  isMobile: true,  hasTouch: true,  deviceScaleFactor: 2 },
  { name: 'tablet',  width: 768,  height: 1024, isMobile: true,  hasTouch: true,  deviceScaleFactor: 1 },
  { name: 'desktop', width: 1440, height: 900,  isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

// ── Session ──────────────────────────────────────────────────────────────

async function newPage(browser, viewport, now = FROZEN_NOW) {
  const { name, width, height, ...rest } = viewport;
  const context = await browser.newContext({ viewport: { width, height }, ...rest });
  // setFixedTime pins Date without faking timers, so Firestore's own
  // timeouts and the dev server's HMR keep working.
  await context.clock.setFixedTime(now);
  const page = await context.newPage();
  // A view that comes up blank usually threw; say so instead of leaving
  // only a locator timeout to go on.
  page.on('pageerror', err => console.log(`[pageerror ${page.url()}] ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error') console.log(`[console.error ${page.url()}] ${msg.text()}`); });
  return { context, page };
}

async function oobLinkFor(email) {
  const res = await fetch(OOB_URL);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter(c => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  if (mine.length === 0) throw new Error(`No sign-in link issued for ${email}`);
  return mine[mine.length - 1].oobLink;
}

// The real flow: request a link, then paste it — the emulator holds the
// "email" instead of sending it.
async function signIn(page, email) {
  await page.goto('/signin');
  await page.fill('#email', email);
  await page.locator('form:has(#email) button[type="submit"]').click();
  await page.waitForSelector('#pastedLink');
  await page.fill('#pastedLink', await oobLinkFor(email));
  await page.locator('form:has(#pastedLink) button[type="submit"]').click();
  await page.waitForURL(u => !new URL(u).pathname.startsWith('/signin'), { timeout: 60_000 });
}

// ── Waiting for data ─────────────────────────────────────────────────────

// A pause measured in this Node process, not inside the page. Chrome
// throttles a background page's timers to roughly one wake-up a minute once
// it has been hidden for five minutes — and headless pages count as hidden —
// so page.waitForTimeout(100) could take 30s late in a long run.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Data streams in over Firestore listeners, so "network idle" means
// nothing. Instead wait until no loading placeholder is on screen and the
// page's text has stopped changing.
async function settle(page, { quietMs = 400 } = {}) {
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return !t.includes('Loading…') && !/(^|\s)…(\s|$)/m.test(t);
  }, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  // "Settled" = the same text on consecutive checks, for at least quietMs.
  // The give-up limit is a number of checks, not a stopwatch: when macOS
  // stretches this process's timers (App Nap, while the editor running the
  // suite is in the background), each check simply comes later and the run
  // takes longer — a wall-clock deadline used to expire after two checks.
  let last = null;
  let lastDiff = null;
  let stableSince = Date.now();
  let same = 0;
  for (let checks = 1; checks <= 600; checks++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (t !== last) {
      if (last !== null) {
        const a = last.split('\n');
        const b = t.split('\n');
        lastDiff = a.map((line, i) => (line !== b[i] ? `${line}  ->  ${b[i]}` : null)).filter(Boolean).slice(0, 6);
      }
      last = t;
      same = 0;
      stableSince = Date.now();
    } else if (++same >= 2 && Date.now() - stableSince >= quietMs) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Page never settled on ${page.url()} after 600 checks. Last change:\n  ${(lastDiff || ['(none)']).join('\n  ')}`);
}

// Chart.js times its animations off Date.now(), which the frozen clock pins
// — so left alone every chart sits on its first frame forever (bars at zero
// width, lines flat on the axis). Stop each one and redraw its final frame
// without animation. Test-only: the app and its charts are untouched.
async function settleCharts(page) {
  if (!(await page.locator('canvas').count())) return;
  await sleep(300);
  await page.evaluate(() => {
    const charts = Object.values(window.__ltCharts || {});
    // Off for every chart, including ones created after this (via the
    // shared defaults): with animation off, Chart.js draws synchronously,
    // so a later resize — which clears the canvas — redraws at once rather
    // than waiting on an animation loop the frozen clock never advances.
    if (charts[0]) charts[0].constructor.defaults.animation = false;
    for (const chart of charts) {
      if (!chart.canvas?.isConnected) continue;
      chart.stop();
      chart.options.animation = false;
      chart.update('none');
    }
  });
  await sleep(150);
}

// ── Extraction ───────────────────────────────────────────────────────────

// Everything data-bearing currently rendered. Runs in the page.
function extractInPage() {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const visible = el => el.getClientRects().length > 0;
  const all = (sel, root = document) => [...root.querySelectorAll(sel)].filter(visible);
  const text = (root, sel) => {
    const el = root.querySelector(sel);
    return el && visible(el) ? norm(el.textContent) : null;
  };
  // Numbers, times, puzzle numbers and ratios out of a sentence — so the
  // wording around them can change without the check failing.
  const nums = s => norm(s).match(/#?\d+(?::\d{2})?(?:\.\d+)?%?/g) || [];

  const charts = Object.values(window.__ltCharts || {})
    .filter(c => c.canvas && c.canvas.isConnected)
    .sort((a, b) => a.id - b.id)
    .map(c => ({
      type: c.config.type,
      labels: (c.data.labels || []).map(String),
      datasets: c.data.datasets.map(d => ({ label: d.label ?? null, data: d.data })),
    }));

  return {
    tables: all('table').map(t => all('tbody tr', t).map(tr => [...tr.children].map(td => norm(td.textContent)))),
    charts,
    scoreBoxes: all('.score-box').map(b => ({
      game: text(b, '.score-box-game'), num: text(b, '.score-box-num'), time: text(b, '.score-box-time'),
    })),
    dayCards: all('.day-fill-card').map(c => ({
      game: text(c, '.day-fill-card-game'), num: text(c, '.day-fill-card-num'), time: text(c, '.day-fill-card-time'),
    })),
    tournamentCards: all('.tournament-card').map(c => ({
      name: text(c, '.tournament-card-name'), games: text(c, '.tournament-card-games'), placement: text(c, '.placement-pill'),
    })),
    compareRows: all('.daily-compare-row').map(r => [
      text(r, '.daily-compare-rank'), text(r, '.daily-compare-name'), text(r, '.daily-compare-time'),
    ]),
    people: all('.people-name').map(el => norm(el.textContent)),
    battleCards: all('.battle-card').map(c => ({
      name: text(c, '.battle-card-name'),
      stats: all('.battle-stat-value', c).map(el => norm(el.textContent)),
      bars: all('.battle-game-bar-head', c).map(h => [...h.children].map(el => norm(el.textContent))),
    })),
    trophies: all('.trophy').map(t => ({
      game: text(t, '.trophy-game'), name: text(t, '.trophy-name'), pts: text(t, '.trophy-pts'),
    })),
    hallMonths: all('.hall-month-label').map(el => norm(el.textContent)),
    feedPosts: all('.feed-post').map(p => ({
      // The game sits beside the name now; joined back up with the puzzle
      // number and age so the record reads as before ("Queens #896 · …").
      name: text(p, '.feed-post-name'), meta: [text(p, '.feed-post-game'), text(p, '.feed-post-meta')].filter(Boolean).join(' '),
      time: text(p, '.feed-post-time'), vs: text(p, '.feed-post-vs'),
      reactions: all('.feed-react', p).map(b => `${norm(b.textContent)}${b.getAttribute('aria-pressed') === 'true' ? ' (mine)' : ''}`),
      comments: all('.feed-comment-body', p).map(el => norm(el.textContent)),
    })),
    notifications: all('.notif-item').map(el => [text(el, '.notif-text'), text(el, '.notif-when')]),
    chat: all('.chat-msg').map(m => [text(m, '.chat-name'), text(m, '.chat-text'), m.classList.contains('chat-msg-mine')]),
    chatDays: all('.chat-day').map(el => norm(el.textContent)),
    quickPaste: all('.quick-paste-found li').map(el => norm(el.textContent)),
    feedTournaments: all('.feed-tournament-chip').map(el => `${norm(el.textContent)}${el.getAttribute('aria-selected') === 'true' ? ' (selected)' : ''}`),
    feedNote: text(document, '.feed-reveal-note'),
    pills: all('.pill-static').map(el => norm(el.textContent)),
    config: all('.config-list dd').map(el => norm(el.textContent)),
    numbersInCopy: {
      banners: all('.reveal-banner').map(el => nums(el.textContent)),
      dayCount: all('.score-day-count').map(el => nums(el.textContent)),
      subs: all('.section-sub').map(el => nums(el.textContent)).filter(a => a.length),
      metas: all('.lb-meta').map(el => nums(el.textContent)).filter(a => a.length),
      hallStatus: all('.hall-month-status').map(el => norm(el.textContent)),
    },
  };
}

async function extract(page) {
  return page.evaluate(extractInPage);
}

async function optionValues(locator) {
  return locator.evaluate(sel => [...sel.options].map(o => o.value));
}

// ── Walk ─────────────────────────────────────────────────────────────────

async function recordHomeToday(page, out) {
  await page.goto('/');
  await settle(page);
  out['home/today/live-day'] = await extract(page);

  await page.locator('.score-day-tab', { hasText: 'Yesterday' }).click();
  await settle(page);
  out['home/today/yesterday'] = await extract(page);
  await page.locator('.score-day-tab', { hasText: 'Today' }).click();
  await settle(page);

  const compare = page.locator('.daily-compare select');
  for (const value of await optionValues(compare)) {
    await compare.selectOption(value);
    await settle(page, { quietMs: 250 });
    out[`home/today/compare/${value}`] = { compareRows: (await extract(page)).compareRows };
  }

  // The info popover on each tournament card (read-only). It opens over
  // its own button, so close it with Escape (as a person would) rather than
  // clicking the now-covered button again.
  const infoButtons = page.locator('.tournament-info-btn');
  for (let i = 0; i < await infoButtons.count(); i++) {
    await infoButtons.nth(i).click();
    await page.locator('.tournament-info-popover').waitFor();
    await settle(page, { quietMs: 250 });
    out[`home/today/tournament-info/${i}`] = { config: (await extract(page)).config };
    await page.keyboard.press('Escape');
    await page.locator('.tournament-info-popover').waitFor({ state: 'detached' });
  }
}

async function recordHomeHistory(page, out) {
  // History is its own destination in the app shell's nav.
  await page.goto('/?view=history');
  await settle(page);

  const month = page.locator('.history-control select');
  for (const m of await optionValues(month)) {
    await month.selectOption(m);
    await settle(page, { quietMs: 250 });
    const pills = page.locator('.history-game-tab');
    for (let i = 0; i < await pills.count(); i++) {
      const name = (await pills.nth(i).textContent()).trim();
      await pills.nth(i).click();
      await settle(page, { quietMs: 250 });
      const { charts, numbersInCopy } = await extract(page);
      out[`home/history/${m}/chart/${name}`] = { charts, statLine: numbersInCopy.subs };
    }
    const day = page.locator('.day-fill-panel select');
    for (const d of await optionValues(day)) {
      await day.selectOption(d);
      await settle(page, { quietMs: 200 });
      out[`home/history/${m}/day/${d}`] = { dayCards: (await extract(page)).dayCards };
    }
  }
}

async function openSection(page, label) {
  await page.locator('.t-section-tab', { has: page.locator('.t-section-tab-label', { hasText: label }) }).first().click();
  await settle(page);
}

async function recordTournament(page, out, id, { scoreHistoryDays = true } = {}) {
  await page.goto(`/tournaments/${id}`);
  await settle(page);
  const key = `tournament/${id}`;

  // Not a member: just the join panel.
  if (await page.locator('.t-section-tab').count() === 0) {
    out[`${key}/non-member`] = await extract(page);
    return;
  }

  // Standings — every month × every game, plus every Score History day.
  const month = page.locator('.editorial-controls select');
  for (const m of await optionValues(month)) {
    await month.selectOption(m);
    await settle(page, { quietMs: 250 });
    const pills = page.locator('.editorial-controls .ed-game-tab');
    for (let i = 0; i < await pills.count(); i++) {
      const name = (await pills.nth(i).textContent()).trim();
      await pills.nth(i).click();
      await settle(page, { quietMs: 250 });
      await settleCharts(page);
      out[`${key}/standings/${m}/${name}`] = await extract(page);

      const historySelect = page.locator('.leaderboard-card select');
      if (scoreHistoryDays && await historySelect.count()) {
        for (const d of await optionValues(historySelect)) {
          await historySelect.selectOption(d);
          await settle(page, { quietMs: 150 });
          const { tables } = await extract(page);
          out[`${key}/standings/${m}/${name}/score-history/${d}`] = { table: tables[tables.length - 1] };
        }
      }
    }
  }

  await openSection(page, 'Hall of Fame');
  out[`${key}/hall-of-fame`] = await extract(page);

  // Battle — every month × every pairing, and every game for the weekday chart.
  await openSection(page, 'Battle');
  const [bMonth, p1, p2] = [0, 1, 2].map(i => page.locator('.battle-controls select').nth(i));
  const players = (await optionValues(p1)).filter(Boolean);
  for (const m of await optionValues(bMonth)) {
    await bMonth.selectOption(m);
    for (let a = 0; a < players.length; a++) {
      for (let b = a + 1; b < players.length; b++) {
        await p1.selectOption(players[a]);
        await p2.selectOption(players[b]);
        await settle(page, { quietMs: 250 });
        await settleCharts(page);
        out[`${key}/battle/${m}/${players[a]}-vs-${players[b]}`] = await extract(page);
      }
    }
  }
  const chartGame = page.locator('.leaderboard-card .lb-header select');
  if (await chartGame.count()) {
    for (const g of await optionValues(chartGame)) {
      await chartGame.selectOption(g);
      await settle(page, { quietMs: 250 });
      await settleCharts(page);
      out[`${key}/battle/weekday-chart/${g}`] = { charts: (await extract(page)).charts };
    }
  }

  await openSection(page, 'Scoring');
  out[`${key}/scoring`] = await extract(page);
}

// The feed, and its two interactions against the real security rules:
// one reaction per person (choosing another emoji moves your vote, choosing
// yours again takes it back) and a comment posted then deleted. Each action
// is undone, so the data ends exactly as seeded.
async function recordFeed(page, out) {
  await page.goto('/feed');
  // The page is blank until sign-in restores, and blank text is "stable" to
  // settle(); wait for the feed itself first.
  await page.locator('.feed-post, .feed-empty').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  out['feed'] = await extract(page);

  // Ana's Queens post: Borg's seeded reaction there is 🔥.
  const post = page.locator('.feed-post', { has: page.locator('.feed-post-name', { hasText: /^Ana$/ }) })
    .filter({ has: page.locator('.feed-post-game', { hasText: 'Queens' }) }).first();
  const reactionsOf = async () => (await extract(page)).feedPosts.find(p => p.name === 'Ana' && p.meta.startsWith('Queens')).reactions;
  const tap = async emoji => {
    await post.locator('.feed-react', { hasText: emoji }).click();
    await settle(page, { quietMs: 400 });
  };
  await tap('👏');
  out['feed/reaction-switched'] = { reactions: await reactionsOf() };
  await tap('👏');
  out['feed/reaction-removed'] = { reactions: await reactionsOf() };
  await tap('🔥');
  out['feed/reaction-restored'] = { reactions: await reactionsOf() };

  await post.locator('.feed-reply-open').click();
  await post.locator('.feed-reply-input').fill('nice one');
  await post.locator('.feed-reply-send').click();
  await post.locator('.feed-comment-body', { hasText: 'nice one' }).waitFor();
  await settle(page, { quietMs: 300 });
  out['feed/comment-added'] = { comments: (await extract(page)).feedPosts.find(p => p.name === 'Ana' && p.meta.startsWith('Queens')).comments };
  page.once('dialog', d => d.accept());
  await post.locator('.feed-comment', { hasText: 'nice one' }).locator('.feed-comment-delete').click();
  await post.locator('.feed-comment-body', { hasText: 'nice one' }).waitFor({ state: 'detached' });
  await settle(page, { quietMs: 300 });
  out['feed/comment-deleted'] = { comments: (await extract(page)).feedPosts.find(p => p.name === 'Ana' && p.meta.startsWith('Queens')).comments };

  // The tournament side: it opens on the first tournament in the home
  // page's order (SKIM, pinned), and each chip switches to another.
  await page.locator('.feed-switch-btn', { hasText: 'Tournaments' }).click();
  await page.locator('.feed-post, .feed-empty').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  const chips = page.locator('.feed-tournament-chip');
  for (let i = 0; i < await chips.count(); i++) {
    const name = (await chips.nth(i).textContent()).trim();
    await chips.nth(i).click();
    await page.locator('.feed-post, .feed-empty').first().waitFor({ timeout: 90 * 1000 });
    await settle(page);
    const { feedPosts, feedTournaments, feedNote } = await extract(page);
    out[`feed/tournament/${name}`] = { feedPosts, feedTournaments, feedNote };
  }

  // SKIM's chat, on SKIM's own page: the seeded conversation, then a
  // message sent and deleted (Borg owns SKIM and wrote it). Only who said
  // what is recorded — a sent message carries the server's real time,
  // which changes run to run.
  await page.goto('/tournaments/t_skim?section=chat');
  await page.locator('.chat-msg, .chat-empty').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  {
    const { chat, chatDays } = await extract(page);
    out['tournament/t_skim/chat'] = { chat, chatDays };
  }
  await page.locator('.chat-input').fill('gg all');
  await page.locator('.chat-send').click();
  await page.locator('.chat-text', { hasText: 'gg all' }).waitFor();
  await settle(page, { quietMs: 300 });
  out['tournament/t_skim/chat/sent'] = { chat: (await extract(page)).chat };
  page.once('dialog', d => d.accept());
  await page.locator('.chat-msg', { hasText: 'gg all' }).locator('.chat-delete').click();
  await page.locator('.chat-text', { hasText: 'gg all' }).waitFor({ state: 'detached' });
  await settle(page, { quietMs: 300 });
  out['tournament/t_skim/chat/deleted'] = { chat: (await extract(page)).chat };
}

// Settings: the game order (Zip moved to the top shows on Today) and the
// single paste box, which reads which game each pasted share is from.
// Everything is put back afterwards, so later states see the seeded data.
async function recordSettings(page, out) {
  const orderNames = async () => (await page.locator('.order-name').allTextContents()).map(t => t.trim());
  await page.goto('/settings');
  await page.locator('.order-row').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  out['settings'] = { order: await orderNames() };

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Move Zip up' }).click();
    await settle(page, { quietMs: 300 });
  }
  out['settings/zip-first'] = { order: await orderNames() };
  await page.goto('/');
  await page.locator('.score-box').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  out['home/game-order'] = { boxes: (await extract(page)).scoreBoxes.map(b => b.game) };

  await page.goto('/settings');
  await page.locator('.order-row').first().waitFor({ timeout: 90 * 1000 });
  await page.getByLabel('One paste box for all games').check();
  await settle(page, { quietMs: 300 });
  await page.goto('/');
  await page.locator('.quick-paste').waitFor({ timeout: 90 * 1000 });
  await settle(page);
  // A changed Queens time, an unchanged Zip time, and something that isn't a share.
  await page.locator('#quick-paste-input').fill(
    'Queens #896 | 0:20 and flawless 👑\nlnkd.in/queens.\n\nZip #575 | 0:26 🏁\nlnkd.in/zip.\nhello #12 | 0:10',
  );
  await settle(page, { quietMs: 300 });
  out['home/quick-paste/preview'] = { quickPaste: (await extract(page)).quickPaste };
  await page.locator('.quick-paste-save').click();
  await page.locator('.quick-paste-saved').waitFor();
  await settle(page, { quietMs: 300 });
  {
    const { scoreBoxes } = await extract(page);
    out['home/quick-paste/saved'] = { saved: (await page.locator('.quick-paste-saved').textContent()).trim(), scoreBoxes };
  }

  // Put it all back: Borg's real Queens time, the default order and mode.
  await page.locator('#quick-paste-input').fill('Queens #896 | 0:18\nlnkd.in/queens.');
  await page.locator('.quick-paste-save').click();
  await page.locator('.quick-paste-saved').waitFor();
  await page.goto('/settings');
  await page.locator('.order-row').first().waitFor({ timeout: 90 * 1000 });
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByLabel('Paste into each box').check();
  await settle(page, { quietMs: 300 });
  out['settings/restored'] = { order: await orderNames() };
}

// The dashboard pop-up: Borg has reactions and comments on his Queens time
// that he hasn't seen. Closing it marks them seen — for good, so a reload
// doesn't bring it back. (First thing in the run, so it isn't covering
// anything the later home states click on.)
async function recordNotifications(page, out) {
  await page.goto('/');
  await page.locator('.notif-popup').waitFor({ timeout: 90 * 1000 });
  await settle(page);
  out['home/notifications'] = { notifications: (await extract(page)).notifications };
  await page.locator('.notif-close').click();
  await page.locator('.notif-popup').waitFor({ state: 'detached' });
  // Let the "seen" mark reach the server before reloading (a write still
  // in flight is dropped when the page unloads).
  await expect.poll(notificationsSeenSaved, { timeout: 30_000 }).toBe(true);
  await page.reload();
  await page.locator('.score-box').first().waitFor({ timeout: 90 * 1000 });
  await settle(page);
  out['home/notifications/after-close'] = { notifications: (await extract(page)).notifications };
}

async function notificationsSeenSaved() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const res = await fetch(`http://${host}/v1/projects/demo-lt/databases/(default)/documents/users/u_borg`,
    { headers: { Authorization: 'Bearer owner' } });
  return res.ok && !!(await res.json()).fields?.notificationsSeenAt;
}

// Clears Borg's "seen up to" mark through the emulator's admin access, so
// the pop-up shows again for its screenshot.
async function resetNotificationsSeen() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const res = await fetch(
    `http://${host}/v1/projects/demo-lt/databases/(default)/documents/users/u_borg?updateMask.fieldPaths=notificationsSeenAt`,
    { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) },
  );
  if (!res.ok) throw new Error(`Couldn't reset notificationsSeenAt: ${res.status}`);
}

async function recordFunctional(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS[2]);
  await signIn(page, LOGIN_EMAIL);
  const out = {};

  await recordNotifications(page, out);
  await recordHomeToday(page, out);
  await recordHomeHistory(page, out);
  await recordTournament(page, out, 't_skim');
  await recordTournament(page, out, 't_ratio');
  await recordTournament(page, out, 't_solo');

  await page.goto('/friends');
  await settle(page);
  out['friends'] = await extract(page);

  await page.goto('/tournaments/search');
  await settle(page);
  out['tournaments/search'] = await extract(page);

  await page.goto('/tournaments/t_skim/manage');
  await settle(page);
  out['tournaments/t_skim/manage'] = await extract(page);

  await recordFeed(page, out);
  await recordSettings(page, out);

  await context.close();
  return out;
}

// ── Screenshots ──────────────────────────────────────────────────────────

const SCREEN_VIEWS = [
  { name: 'home-today', go: async p => { await p.goto('/'); } },
  { name: 'home-history', go: async p => { await p.goto('/?view=history'); } },
  { name: 'friends', go: async p => { await p.goto('/friends'); } },
  { name: 'feed', go: async p => { await p.goto('/feed'); } },
  { name: 'feed-tournament', go: async p => { await p.goto('/feed?view=tournaments'); } },
  { name: 'settings', go: async p => { await p.goto('/settings'); await p.locator('.order-row').first().waitFor(); } },
  { name: 'skim-chat', go: async p => { await p.goto('/tournaments/t_skim?section=chat'); await p.locator('.chat-msg').first().waitFor(); } },
  // Shown, shot, then closed again, so the dashboard shots after it are clear.
  {
    name: 'home-notifications',
    go: async p => { await resetNotificationsSeen(); await p.goto('/'); await p.locator('.notif-popup').waitFor(); },
    after: async p => {
      await p.locator('.notif-close').click();
      await p.locator('.notif-popup').waitFor({ state: 'detached' });
      await expect.poll(notificationsSeenSaved, { timeout: 30_000 }).toBe(true);
    },
  },
  { name: 'find-tournaments', go: async p => { await p.goto('/tournaments/search'); } },
  { name: 'new-tournament', go: async p => { await p.goto('/tournaments/new'); } },
  { name: 'skim-standings-overall', go: async p => { await p.goto('/tournaments/t_skim'); } },
  { name: 'skim-standings-queens', go: async p => { await p.goto('/tournaments/t_skim'); await settle(p); await p.locator('.ed-game-tab', { hasText: 'Queens' }).click(); } },
  { name: 'skim-standings-tango', go: async p => { await p.goto('/tournaments/t_skim'); await settle(p); await p.locator('.ed-game-tab', { hasText: 'Tango' }).click(); } },
  { name: 'skim-hall-of-fame', go: async p => { await p.goto('/tournaments/t_skim'); await settle(p); await openSection(p, 'Hall of Fame'); } },
  { name: 'skim-battle', go: async p => {
    await p.goto('/tournaments/t_skim'); await settle(p); await openSection(p, 'Battle');
    await p.locator('.battle-controls select').nth(1).selectOption('u_borg');
    await p.locator('.battle-controls select').nth(2).selectOption('u_long');
  } },
  { name: 'skim-scoring', go: async p => { await p.goto('/tournaments/t_skim'); await settle(p); await openSection(p, 'Scoring'); } },
  { name: 'skim-manage', go: async p => { await p.goto('/tournaments/t_skim/manage'); } },
  { name: 'ratio-standings', go: async p => { await p.goto('/tournaments/t_ratio'); } },
  { name: 'wend-only-non-member', go: async p => { await p.goto('/tournaments/t_solo'); } },
];

// A full-page screenshot makes Chromium resize the viewport to the page's
// full height mid-capture. That can change the width charts see (the
// scrollbar disappears), every responsive chart resizes, which clears its
// canvas, and the redraw lands on the next animation frame — after the
// capture. So do that resize ourselves, let the charts redraw, then capture
// at the size the page already is.
async function shoot(page, viewport, name) {
  await settle(page);
  await settleCharts(page);
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, fullHeight) });
  await sleep(250);
  await settleCharts(page);
  fs.mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENS, `${name}--${viewport.name}.png`), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
}

async function recordScreenshots(browser) {
  for (const viewport of VIEWPORTS) {
    // Signed out.
    {
      const { context, page } = await newPage(browser, viewport);
      await page.goto('/signin');
      await shoot(page, viewport, 'signin');
      await context.close();
    }
    // Signed up, not onboarded.
    {
      const { context, page } = await newPage(browser, viewport);
      await signIn(page, NEW_USER_EMAIL);
      await page.waitForURL(/\/onboarding/);
      await shoot(page, viewport, 'onboarding');
      await context.close();
    }
    // Before the 09:00 publish time — the only time the day note shows.
    {
      const { context, page } = await newPage(browser, viewport, BEFORE_PUBLISH);
      await signIn(page, LOGIN_EMAIL);
      await page.goto('/');
      await shoot(page, viewport, 'home-today-before-0900');
      await context.close();
    }
    // Everything else, one signed-in session per width.
    const { context, page } = await newPage(browser, viewport);
    await signIn(page, LOGIN_EMAIL);
    for (const view of SCREEN_VIEWS) {
      await view.go(page);
      await shoot(page, viewport, view.name);
      if (view.after) await view.after(page);
    }
    await context.close();
  }
}

// ── The test ─────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test('every view renders the same data as the baseline', async ({ browser }) => {
  const functional = await recordFunctional(browser);

  if (UPDATE || !fs.existsSync(BASELINE)) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(functional, null, 2) + '\n');
  } else {
    // Written out on every run so a failure can be diffed against the
    // baseline file directly.
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(path.join('test-results', 'functional.actual.json'), JSON.stringify(functional, null, 2) + '\n');
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    expect(Object.keys(functional).sort()).toEqual(Object.keys(baseline).sort());
    for (const key of Object.keys(baseline)) {
      expect(functional[key], `view state "${key}"`).toEqual(baseline[key]);
    }
  }
});

test('screenshots of every view at phone, tablet and desktop widths', async ({ browser }) => {
  await recordScreenshots(browser);
});
