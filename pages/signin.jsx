// pages/signin.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';

export default function SignIn() {
  const { user, loading, requestLoginCode, verifyLoginCode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function handleSendCode(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return;
    setBusy(true);
    try {
      await requestLoginCode(email.trim());
      setStep('code');
    } catch (err) {
      setError(err.message || 'Could not send a code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    if (!code.trim()) return;
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code.trim());
    } catch (err) {
      setError(err.message || 'That code is incorrect. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setBusy(true);
    try {
      await requestLoginCode(email.trim());
    } catch (err) {
      setError(err.message || 'Could not resend the code yet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">LinkedIn Tournament</div>
        <div className="subtitle">Sign in with your email — no password needed.</div>

        {step === 'email' ? (
          <form onSubmit={handleSendCode}>
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
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <div className="msg">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below —
              it expires in 10 minutes.
            </div>
            <div className="field">
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.3rem' }}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <button type="button" className="chip-link" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                Use a different email
              </button>
              <button type="button" className="chip-link" disabled={busy} onClick={handleResend}>
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
