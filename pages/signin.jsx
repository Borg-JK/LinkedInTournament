// pages/signin.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';

export default function SignIn() {
  const { user, loading, sendSignInLink, completeSignInFromLink } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pastedLink, setPastedLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

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

  // Tapping the emailed link from a phone's Mail app often hands off to the
  // default browser instead of this installed PWA, breaking the "same
  // browser" requirement that flow depends on. Pasting the link text here
  // instead completes sign-in without ever leaving the app.
  async function handlePasteLink(e) {
    e.preventDefault();
    setLinkError('');
    if (!pastedLink.trim()) return;
    setLinkBusy(true);
    try {
      await completeSignInFromLink(pastedLink.trim(), email.trim());
    } catch (err) {
      setLinkError(
        err.message === 'NEEDS_EMAIL'
          ? 'Enter the email address you signed in with above.'
          : (err.message || 'That link looks invalid or has expired.')
      );
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">LinkedIn Tournament</div>
        <div className="subtitle">Sign in with your email — no password needed.</div>

        {sent ? (
          <>
            <div className="msg">
              Check <strong>{email}</strong> for a sign-in link.
            </div>
            <div className="section-sub" style={{ marginBottom: 14 }}>
              Tapping it usually works, but if it opens a different browser and
              you end up back here, copy the link instead and paste it below —
              no need to leave this page.
            </div>
            <form onSubmit={handlePasteLink}>
              <div className="field">
                <label htmlFor="pastedLink">Sign-in link</label>
                <textarea
                  id="pastedLink"
                  required
                  rows={3}
                  value={pastedLink}
                  onChange={e => setPastedLink(e.target.value)}
                  placeholder="Paste the link from the email here…"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              {linkError && <div className="error">{linkError}</div>}
              <button className="btn" type="submit" disabled={linkBusy || !pastedLink.trim()}>
                {linkBusy ? 'Signing in…' : 'Paste & sign in'}
              </button>
            </form>
          </>
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
