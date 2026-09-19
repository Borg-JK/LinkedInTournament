// pages/_app.jsx
import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
