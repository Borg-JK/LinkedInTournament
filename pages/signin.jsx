// pages/signin.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';

export default function SignIn() {
  const { user, loading, sendSignInLink } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return;
    setBusy(true);
    try {
      await sendSignInLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send sign-in link. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">LinkedIn Tournament</div>
        <div className="subtitle">Sign in with your email — no password needed.</div>

        {sent ? (
          <div className="msg">
            Check <strong>{email}</strong> for a sign-in link. Open it on this device
            to finish signing in.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
