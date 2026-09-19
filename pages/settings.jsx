// pages/settings.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import GamesPicker from '../components/GamesPicker';

export default function Settings() {
  const { user, profile, profileChecked, loading, updateGamesPlayed } = useAuth();
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
    setGames(profile.gamesPlayed || []);
  }, [loading, profileChecked, user, profile, router]);

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await updateGamesPlayed(games);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="page">
      <div className="card">
        <div className="brand">Settings</div>
        <div className="subtitle">Signed in as {profile.username}</div>

        <form onSubmit={handleSave}>
          <div className="field">
            <label>Games you play</label>
            <GamesPicker value={games} onChange={setGames} />
          </div>

          {saved && <div className="msg">Saved.</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="card-footer">
          <a className="link-btn" href="/">Back home</a>
        </div>
      </div>
    </div>
  );
}
