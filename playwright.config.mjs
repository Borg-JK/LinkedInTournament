// playwright.config.mjs
// Regression suite for the redesign: run with `npm run test:regression`,
// which starts the Firebase emulators, seeds them (scripts/seed-emulator.mjs)
// and then runs this. The dev server below talks only to those emulators.
import { defineConfig } from '@playwright/test';

const PORT = 3123;

export default defineConfig({
  testDir: 'tests',
  // The worst-case stress run (break-ui) needs its own seed, so it only runs
  // when asked; the regression suite never sees that data.
  testMatch: process.env.WORST_CASE === '1' ? 'worst-case.spec.mjs' : 'regression.spec.mjs',
  // One long serial walk through every view — the views share a signed-in
  // session and the order doesn't matter, so parallelism would only add
  // flakiness against a single emulator.
  workers: 1,
  fullyParallel: false,
  timeout: 30 * 60 * 1000,
  reporter: 'list',
  use: {
    // Without these a single stuck click or navigation waits out the whole
    // test timeout instead of failing at the step that broke.
    actionTimeout: 15 * 1000,
    navigationTimeout: 90 * 1000,
    baseURL: `http://127.0.0.1:${PORT}`,
    // Dates render through toLocaleDateString, so both of these have to be
    // pinned for the text to come out the same on every machine.
    locale: 'en-GB',
    timezoneId: 'Europe/Amsterdam',
  },
  // A production build, not `next dev`: dev mode runs React StrictMode's
  // double-mount, which behaves differently from what users get (it silently
  // empties the friends list — see lib/useFriends.js's mounted ref). Testing
  // the real build is the point. It also keeps the dev badge out of the
  // screenshots.
  webServer: {
    command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/signin`,
    timeout: 420 * 1000,
    reuseExistingServer: false,
    stdout: 'ignore',
    env: {
      NEXT_PUBLIC_USE_EMULATORS: '1',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-lt',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-lt.firebaseapp.com',
      NEXT_DIST_DIR: '.next-regression',
    },
  },
});
