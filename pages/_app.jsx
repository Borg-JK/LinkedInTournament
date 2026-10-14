// pages/_app.jsx
import Head from 'next/head';
import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';

// Regression-suite hook: exposes Chart.js's live instance registry so
// tests/regression.spec.mjs can snapshot every chart's datasets. Behind the
// same build-time flag as the emulators in lib/firebase.js, and a dynamic
// import, so production neither runs it nor pulls chart.js into this bundle.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === '1' && typeof window !== 'undefined') {
  import('chart.js').then(({ Chart }) => { window.__ltCharts = Chart.instances; });
}

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      {/* Replaces Next's default `width=device-width` (see next/head's
          defaultHead). Without initial-scale, iOS can hand the page a
          viewport it has already zoomed, which is how a layout that fits
          ends up rendered a size too small. interactive-widget makes the
          on-screen keyboard shrink the layout on Android the way it already
          does on iOS, so a focused score field isn't left under the keys.
          Zoom is deliberately not disabled — 16px fields fix the cause. */}
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
          key="viewport"
        />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
