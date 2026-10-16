// tests/worst-case.spec.mjs
// break-ui stress run for the standings and head-to-head views, against the
// worst-case seed (SEED_SET=worst in scripts/seed-emulator.mjs): long,
// unbreakable, one-letter, CJK, diacritic and emoji-first usernames, a
// member with no entries, one with a single entry, a one-player day, exact
// ties, and a 63-minute time.
//
//   npm run test:worst-case
//
// Not a pass/fail behaviour lock — that's regression.spec.mjs. This writes
// screenshots to redesign-screenshots/worst-case/ and a findings file,
// test-results/worst-case-findings.json, listing every measured break:
// horizontal page overflow, text escaping its card, and squashed fixed-size
// shapes (rank badges, player dots).
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FROZEN_NOW = new Date('2026-10-13T12:00:00+02:00');
// Node-side pause — see the note on sleep() in regression.spec.mjs.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const OUT = path.join('redesign-screenshots', 'worst-case');
const T = '/tournaments/t_worst';

const WIDTHS = [
  { name: '320', width: 320, height: 720, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  // iPhone SE (2nd/3rd gen): the narrowest current iPhone, 375 x 667.
  { name: '375-se', width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '390-text200', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2, textScale: 2 },
  { name: '768', width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: '1440', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

async function signIn(page) {
  await page.goto('/signin');
  await page.fill('#email', 'borg@test.local');
  await page.locator('form:has(#email) button[type="submit"]').click();
  await page.waitForSelector('#pastedLink');
  const { oobCodes } = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-lt/oobCodes')).json();
  await page.fill('#pastedLink', oobCodes.filter(c => c.email === 'borg@test.local').pop().oobLink);
  await page.locator('form:has(#pastedLink) button[type="submit"]').click();
  await page.waitForURL(u => !new URL(u).pathname.startsWith('/signin'), { timeout: 60_000 });
}

async function settle(page) {
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return !t.includes('Loading…') && !/(^|\s)…(\s|$)/m.test(t);
  }, null, { timeout: 60_000 });
  let last = null; let since = Date.now();
  while (Date.now() - since < 400) {
    const t = await page.evaluate(() => document.body.innerText);
    if (t !== last) { last = t; since = Date.now(); }
    await sleep(100);
  }
  // Charts: animation off so they draw synchronously (see regression spec).
  await page.evaluate(() => {
    const charts = Object.values(window.__ltCharts || {});
    if (charts[0]) charts[0].constructor.defaults.animation = false;
    for (const c of charts) if (c.canvas?.isConnected) { c.stop(); c.options.animation = false; c.update('none'); }
  });
}

// Measured breaks, from the break-ui failure signatures.
function measure() {
  const out = [];
  const doc = document.documentElement;
  const inScroller = el => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const label = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the culprit: the innermost element reaching furthest right.
    let worst = null;
    for (const el of document.body.querySelectorAll('*')) {
      if (!el.getClientRects().length || inScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && (!worst || r.right > worst.r.right || (r.right === worst.r.right && worst.el.contains(el)))) worst = { el, r };
    }
    const who = worst ? `${worst.el.tagName.toLowerCase()}.${(worst.el.className || '').toString().split(' ')[0]} "${label(worst.el)}"` : '?';
    out.push({ kind: 'page-overflow', detail: `${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport — widest: ${who}` });
  }
  for (const card of document.querySelectorAll('.leaderboard-card, .battle-card, .trophy, .tournament-header, .tournament-card-wrap')) {
    const cr = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('*')) {
      if (!el.getClientRects().length || inScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > cr.right + 1 || r.left < cr.left - 1) {
        out.push({ kind: 'escapes-card', detail: `${el.tagName.toLowerCase()}.${el.className || ''} "${label(el)}" sticks out of .${card.className.split(' ')[0]} by ${Math.round(Math.max(r.right - cr.right, cr.left - r.left))}px` });
        break; // one per card is enough to name it
      }
    }
  }
  // Tables that scroll sideways inside their card. Not always a break — the
  // five-game Overall table legitimately scrolls on a phone — but a
  // two-game table that does means numbers are hidden off to the right.
  for (const sc of document.querySelectorAll('.lb-table-scroll')) {
    const over = sc.scrollWidth - sc.clientWidth;
    const cols = sc.querySelectorAll('thead th').length;
    if (over > 1) out.push({ kind: 'table-scrolls', detail: `${cols}-column table is ${over}px wider than its card` });
  }
  for (const sel of ['.rank-badge', '.player-dot', '.trophy-avatar', '.skeleton-dot']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && Math.abs(r.width - r.height) > 1) { out.push({ kind: 'squashed', detail: `${sel} is ${Math.round(r.width)}x${Math.round(r.height)}` }); break; }
    }
  }
  for (const el of document.querySelectorAll('.trophy-avatar')) {
    if (/�|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(el.textContent)) out.push({ kind: 'broken-glyph', detail: `trophy initial renders as "${el.textContent}"` });
  }
  return out;
}

const VIEWS = [
  { name: 'standings-overall', go: async p => { await p.goto(T); } },
  { name: 'standings-queens', go: async p => { await p.goto(T); await settle(p); await p.locator('.ed-game-tab', { hasText: 'Queens' }).click(); } },
  { name: 'score-history-63min-day', go: async p => {
    await p.goto(T); await settle(p); await p.locator('.ed-game-tab', { hasText: 'Queens' }).click(); await settle(p);
    await p.locator('.leaderboard-card select').selectOption('2026-10-05');
  } },
  { name: 'score-history-one-player-day', go: async p => {
    await p.goto(T); await settle(p); await p.locator('.ed-game-tab', { hasText: 'Queens' }).click(); await settle(p);
    await p.locator('.leaderboard-card select').selectOption('2026-10-10');
  } },
  { name: 'battle-long-vs-unbreakable', go: async p => {
    await p.goto(T); await settle(p); await p.locator('.t-section-tab', { hasText: 'Battle' }).click(); await settle(p);
    await p.locator('.battle-controls select').nth(1).selectOption('w_aleks');
    await p.locator('.battle-controls select').nth(2).selectOption('w_handle');
  } },
  { name: 'battle-one-letter-vs-emoji', go: async p => {
    await p.goto(T); await settle(p); await p.locator('.t-section-tab', { hasText: 'Battle' }).click(); await settle(p);
    await p.locator('.battle-controls select').nth(1).selectOption('w_j');
    await p.locator('.battle-controls select').nth(2).selectOption('w_fox');
  } },
  { name: 'battle-tied-twins', go: async p => {
    await p.goto(T); await settle(p); await p.locator('.t-section-tab', { hasText: 'Battle' }).click(); await settle(p);
    await p.locator('.battle-controls select').nth(1).selectOption('w_tie1');
    await p.locator('.battle-controls select').nth(2).selectOption('w_tie2');
  } },
  { name: 'hall-of-fame', go: async p => { await p.goto(T); await settle(p); await p.locator('.t-section-tab', { hasText: 'Hall of Fame' }).click(); } },
  { name: 'home-list', go: async p => { await p.goto('/'); } },
];

test('worst-case data across the standings and head-to-head views', async ({ browser }) => {
  test.setTimeout(20 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const findings = [];
  for (const w of WIDTHS) {
    const { name, width, height, textScale, ...rest } = w;
    const context = await browser.newContext({ viewport: { width, height }, ...rest });
    await context.clock.setFixedTime(FROZEN_NOW);
    const page = await context.newPage();
    await signIn(page);
    for (const view of VIEWS) {
      await view.go(page);
      // Text at 200% with boxes unchanged: rem-based type grows, px boxes don't.
      if (textScale) await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% !important; }` });
      await settle(page);
      for (const f of await page.evaluate(measure)) findings.push({ width: name, view: view.name, ...f });
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(height, full) });
      await sleep(250);
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `${view.name}--${name}.png`), fullPage: true });
      await page.setViewportSize({ width, height });
    }
    await context.close();
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', 'worst-case-findings.json'), JSON.stringify(findings, null, 2) + '\n');
  console.log(`\n${findings.length} measured breaks:`);
  for (const f of findings) console.log(`  [${f.width}] ${f.view}: ${f.kind} — ${f.detail}`);
});
