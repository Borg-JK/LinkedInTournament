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

// Data streams in over Firestore listeners, so "network idle" means
// nothing. Instead wait until no loading placeholder is on screen and the
// page's text has stopped changing.
async function settle(page, { quietMs = 400 } = {}) {
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return !t.includes('Loading…') && !/(^|\s)…(\s|$)/m.test(t);
  }, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  let last = null;
  let lastDiff = null;
  let stableSince = Date.now();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const t = await page.evaluate(() => document.body.innerText);
    if (t !== last) {
      if (last !== null) {
        const a = last.split('\n');
        const b = t.split('\n');
        lastDiff = a.map((line, i) => (line !== b[i] ? `${line}  ->  ${b[i]}` : null)).filter(Boolean).slice(0, 6);
      }
      last = t;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) return;
    await page.waitForTimeout(100);
  }
  // Say what kept changing — "never settled" alone can't be debugged.
  throw new Error(`Page never settled on ${page.url()}. Last change:\n  ${(lastDiff || ['(none)']).join('\n  ')}`);
}

// Chart.js times its animations off Date.now(), which the frozen clock pins
// — so left alone every chart sits on its first frame forever (bars at zero
// width, lines flat on the axis). Stop each one and redraw its final frame
// without animation. Test-only: the app and its charts are untouched.
async function settleCharts(page) {
  if (!(await page.locator('canvas').count())) return;
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (const chart of Object.values(window.__ltCharts || {})) {
      if (!chart.canvas?.isConnected) continue;
      chart.stop();
      chart.update('none');
    }
  });
  await page.waitForTimeout(100);
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
  await page.goto('/');
  await settle(page);
  await page.locator('.home-tab', { hasText: 'History' }).click();
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

async function recordFunctional(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS[2]);
  await signIn(page, LOGIN_EMAIL);
  const out = {};

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

  await context.close();
  return out;
}

// ── Screenshots ──────────────────────────────────────────────────────────

const SCREEN_VIEWS = [
  { name: 'home-today', go: async p => { await p.goto('/'); } },
  { name: 'home-history', go: async p => { await p.goto('/'); await settle(p); await p.locator('.home-tab', { hasText: 'History' }).click(); } },
  { name: 'friends', go: async p => { await p.goto('/friends'); } },
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

async function shoot(page, viewport, name) {
  await settle(page);
  await settleCharts(page);
  fs.mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENS, `${name}--${viewport.name}.png`), fullPage: true, animations: 'disabled' });
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
