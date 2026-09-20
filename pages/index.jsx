// pages/index.jsx
// Your game history (Phase 6) lands here too.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useTournaments, useTournamentInvites } from '../lib/useTournaments';
import { useTournamentStandings } from '../lib/useTournamentStandings';
import { GAMES } from '../lib/games';
import TopNav from '../components/TopNav';
import ScoreBoxes from '../components/ScoreBoxes';

function TournamentRow({ tournament, uid }) {
  const { ranked, ready } = useTournamentStandings(tournament);
  const mine = ranked.find(r => r.uid === uid);

  return (
    <li className="people-row">
      <a href={`/tournaments/${tournament.id}`} className="people-name" style={{ textDecoration: 'none' }}>
        {tournament.name}
        <span className="pill-static" style={{ display: 'block', fontWeight: 400 }}>
          {tournament.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ')}
        </span>
      </a>
      {!ready ? (
        <span className="pill-static">…</span>
      ) : mine ? (
        <span className="placement-pill">#{mine.rank} of {ranked.length}</span>
      ) : (
        <span className="pill-static">Not yet ranked</span>
      )}
    </li>
  );
}

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
          <p>Today's puzzles — fill in whichever ones you play.</p>
        </div>

        <ScoreBoxes />

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
              {tournaments.map(t => <TournamentRow key={t.id} tournament={t} uid={user.uid} />)}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
