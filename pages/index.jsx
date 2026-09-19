// pages/index.jsx
// Phase 1 shell only — score boxes, tournament list with placements, and the
// personal history tab are built out in Phases 5 and 6.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import TopNav from '../components/TopNav';
import GameChips from '../components/GameChips';

export default function Home() {
  const { user, profile, profileChecked, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  if (loading || !profileChecked || !user || !profile) {
    return (
      <div className="page">
        <div className="subtitle" style={{ marginTop: 64, color: 'var(--text-on-dark-muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <TopNav />
      <main className="app-main">
        <div className="hero">
          <h1>Welcome back, {profile.username}</h1>
          <p>Your account is set up. Score entry, tournaments, and your game history land here in the next phases.</p>
        </div>

        <div className="panel-grid">
          <section className="panel">
            <h2>Tournaments</h2>
            <div className="section-sub">Where you're placed, across every tournament you're in.</div>
            <div className="panel-empty">Tournament creation and standings arrive in Phase 3 &amp; 5.</div>
          </section>

          <section className="panel">
            <h2>Games you play</h2>
            <div className="section-sub">Used for daily score entry once that's live.</div>
            <GameChips gameIds={profile.gamesPlayed || []} />
          </section>
        </div>
      </main>
    </div>
  );
}
