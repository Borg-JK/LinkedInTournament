// pages/index.jsx
// Phase 1 shell only — score boxes and your personal history land in Phase 5/6.
// Placements per tournament (not just the list) land in Phase 5 once there's
// real score data to compute them from.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useTournaments } from '../lib/useTournaments';
import { GAMES } from '../lib/games';
import TopNav from '../components/TopNav';

export default function Home() {
  const { user, profile, profileChecked, loading } = useAuth();
  const { tournaments, loading: tLoading } = useTournaments();
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
          <p>Score entry and your game history land here in Phases 5 &amp; 6.</p>
        </div>

        <section className="panel">
          <div className="panel-head-row">
            <h2>Tournaments</h2>
            <a href="/tournaments/new" className="btn-sm">+ New tournament</a>
          </div>
          <div className="section-sub">Where you're placed, across every tournament you're in.</div>

          {tLoading ? (
            <div className="list-empty">Loading…</div>
          ) : tournaments.length === 0 ? (
            <div className="panel-empty">No tournaments yet — create one to get started.</div>
          ) : (
            <ul className="people-list">
              {tournaments.map(t => (
                <li key={t.id} className="people-row">
                  <a href={`/tournaments/${t.id}`} className="people-name" style={{ textDecoration: 'none' }}>
                    {t.name}
                  </a>
                  <span className="pill-static">
                    {t.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
