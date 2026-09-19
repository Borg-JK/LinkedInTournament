// pages/auth/callback.jsx
// Landing page for the link Firebase emails during sign-in. Completes the
// email-link sign-in flow, prompting for the email address if this browser
// doesn't already have it stashed (e.g. link opened on a different device).
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';

export default function AuthCallback() {
  const { completeSignInFromLink } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState('working'); // working | needsEmail | error | done
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    run();
  }, []);

  async function run(emailOverride) {
    setStatus('working');
    setError('');
    try {
      await completeSignInFromLink(window.location.href, emailOverride);
      setStatus('done');
      router.replace('/');
    } catch (err) {
      if (err.message === 'NEEDS_EMAIL') {
        setStatus('needsEmail');
      } else {
        setStatus('error');
        setError(err.message || 'This sign-in link is invalid or has expired.');
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (email.trim()) run(email.trim());
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">LinkedIn Tournament</div>

        {status === 'working' && <div className="subtitle">Signing you in…</div>}

        {status === 'needsEmail' && (
          <>
            <div className="subtitle">
              Confirm the email address you used to request this link.
            </div>
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
              <button className="btn" type="submit">Finish signing in</button>
            </form>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error" style={{ marginTop: 0 }}>{error}</div>
            <a className="link-btn" href="/signin">Request a new link</a>
          </>
        )}
      </div>
    </div>
  );
}
