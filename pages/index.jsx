// pages/index.jsx
// Phase 1 shell only — score boxes and your personal history land in Phase 5/6.
// Placements per tournament (not just the list) land in Phase 5 once there's
// real score data to compute them from.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useTournaments, useTournamentInvites } from '../lib/useTournaments';
import { GAMES } from '../lib/games';
import TopNav from '../components/TopNav';

export default function Home() {
  const { user, profile, profileChecked, loading } = useAuth();
  const { tournaments, loading: tLoading } = useTournaments();
  const { invites, loading: invitesLoading, acceptInvite, declineInvite } = useTournamentInvites();
  const [busyId, setBusyId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  async function handleAccept(tournamentId) {
    setBusyId(tournamentId);
    try {
      await acceptInvite(tournamentId);
    } catch (err) {
      window.alert(err.message || 'Could not accept this invite.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(tournamentId) {
    setBusyId(tournamentId);
    try {
      await declineInvite(tournamentId);
    } catch (err) {
      window.alert(err.message || 'Could not decline this invite.');
    } finally {
      setBusyId(null);
    }
  }

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

        {!invitesLoading && invites.length > 0 && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h2>Tournament invites</h2>
            <div className="section-sub">{invites.length} pending</div>
            <ul className="people-list">
              {invites.map(inv => (
                <li key={inv.tournamentId} className="people-row">
                  <span className="people-name">{inv.tournamentName}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" disabled={busyId === inv.tournamentId} onClick={() => handleAccept(inv.tournamentId)}>
                      Accept
                    </button>
                    <button className="btn-sm btn-sm-ghost" disabled={busyId === inv.tournamentId} onClick={() => handleDecline(inv.tournamentId)}>
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel">
          <div className="panel-head-row">
            <h2>Tournaments</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/tournaments/search" className="btn-sm btn-sm-ghost">Find</a>
              <a href="/tournaments/new" className="btn-sm">+ New</a>
            </div>
          </div>
          <div className="section-sub">Where you're placed, across every tournament you're in.</div>

          {tLoading ? (
            <div className="list-empty">Loading…</div>
          ) : tournaments.length === 0 ? (
            <div className="panel-empty">No tournaments yet — create one, or find one to ask to join.</div>
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
