/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The regression suite builds its own copy of the app (pointed at the local
  // emulators) into a separate dir, so it never touches the normal .next
  // build. Unset everywhere else, including Vercel.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Always defined at build time ('0' unless the regression suite sets it),
  // so the emulator and chart-registry blocks in lib/firebase.js and
  // pages/_app.jsx compile to `if ("1" === "0")` and get stripped from the
  // production bundle entirely — rather than shipping and being skipped at
  // runtime, which is what an undefined variable would do.
  env: {
    NEXT_PUBLIC_USE_EMULATORS: process.env.NEXT_PUBLIC_USE_EMULATORS || '0',
  },
};
module.exports = nextConfig;
