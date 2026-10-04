// pages/_app.jsx
import Head from 'next/head';
import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      {/* Replaces Next's default `width=device-width` (see next/head's
          defaultHead). Without initial-scale, iOS can hand the page a
          viewport it has already zoomed, which is how a layout that fits
          ends up rendered a size too small. */}
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
          key="viewport"
        />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
