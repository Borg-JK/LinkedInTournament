// pages/settings.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import TopNav from '../components/TopNav';
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
    <div className="app-page">
      <TopNav />
      <main className="app-main app-main-narrow">
        <div className="hero">
          <h1>Settings</h1>
          <p>Signed in as {profile.username}.</p>
        </div>

        <section className="panel">
          <h2>Games you play</h2>
          <div className="section-sub">This decides which score-entry boxes you'll see once that's live.</div>

          <form onSubmit={handleSave}>
            <GamesPicker value={games} onChange={setGames} />

            {saved && <div className="msg" style={{ marginTop: 18 }}>Saved.</div>}

            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </section>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a className="link-btn" href="/">Back home</a>
        </div>
      </main>
    </div>
  );
}
