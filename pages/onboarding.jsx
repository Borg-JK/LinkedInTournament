// pages/onboarding.jsx
// Shown once, right after first sign-in, before a users/{uid} doc exists.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth, checkUsernameAvailable, isValidUsername } from '../lib/useAuth';

export default function Onboarding() {
  const { user, profile, profileChecked, loading, completeOnboarding } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (profile) { router.replace('/'); }
  }, [loading, profileChecked, user, profile, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const trimmed = username.trim();
    if (!isValidUsername(trimmed)) {
      setError('Username must be 3–20 characters: letters, numbers, underscores only.');
      return;
    }
    setBusy(true);
    try {
      const available = await checkUsernameAvailable(trimmed);
      if (!available) {
        setError('That username is taken — try another.');
        setBusy(false);
        return;
      }
      await completeOnboarding({ username: trimmed });
      router.replace('/');
    } catch (err) {
      setError(err.message === 'USERNAME_TAKEN'
        ? 'That username is taken — try another.'
        : (err.message || 'Something went wrong. Try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">Welcome</div>
        <div className="subtitle">Pick a username to finish setting up your account.</div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              required
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. borgk"
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
