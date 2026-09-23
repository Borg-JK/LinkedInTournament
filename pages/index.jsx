// pages/index.jsx
// Your game history (Phase 6) lands here too.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useTournaments, useTournamentInvites, JOIN_POLICIES } from '../lib/useTournaments';
import { useTournamentStandings } from '../lib/useTournamentStandings';
import { SCORING_METRICS } from '../lib/scoring';
import { REVEAL_POLICIES, DEFAULT_REVEAL_POLICY, DEFAULT_REVEAL_INTERVAL_DAYS } from '../lib/reveal';
import { GAMES } from '../lib/games';
import TopNav from '../components/TopNav';
import ScoreBoxes from '../components/ScoreBoxes';
import DailyCompareWidget from '../components/DailyCompareWidget';
import PersonalHistoryTab from '../components/PersonalHistoryTab';
import SharedScoreIntake from '../components/SharedScoreIntake';

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TournamentInfoPopover({ tournament, uid, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const gameLabels = tournament.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ');
  const isOwner = tournament.ownerId === uid;

  return (
    <div className="tournament-info-popover" ref={ref} onClick={e => e.stopPropagation()}>
      <div className="tournament-info-title">{tournament.name}</div>
      <dl className="config-list">
        <dt>Games</dt><dd>{gameLabels}</dd>
        <dt>Start date</dt><dd>{tournament.startDate}</dd>
        <dt>Scoring</dt><dd>{SCORING_METRICS.find(m => m.id === tournament.scoringMetric)?.label}</dd>
        <dt>Eligibility</dt><dd>{tournament.eligibilityThresholdPct}%</dd>
        <dt>Joining</dt><dd>{JOIN_POLICIES.find(p => p.id === tournament.joinPolicy)?.label}</dd>
        <dt>Reveal</dt>
        <dd>
          {REVEAL_POLICIES.find(p => p.id === (tournament.revealPolicy || DEFAULT_REVEAL_POLICY))?.label}
          {tournament.revealPolicy === 'interval' ? ` (every ${tournament.revealIntervalDays || DEFAULT_REVEAL_INTERVAL_DAYS} days)` : ''}
        </dd>
      </dl>
      {isOwner && (
        <a href={`/tournaments/${tournament.id}/manage`} className="chip-link" style={{ display: 'inline-block', marginTop: 12 }}>
          Manage tournament →
        </a>
      )}
    </div>
  );
}

function TournamentRow({ tournament, uid }) {
  const { ranked, ready } = useTournamentStandings(tournament);
  const mine = ranked.find(r => r.uid === uid);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <li className="tournament-card-wrap">
      <a href={`/tournaments/${tournament.id}`} className="tournament-card">
        <span className="tournament-card-name">{tournament.name}</span>
        <span className="tournament-card-games">
          {tournament.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ')}
        </span>
        {!ready ? (
          <span className="pill-static">…</span>
        ) : mine ? (
          <span className="placement-pill placement-pill-lg">#{mine.rank} of {ranked.length}</span>
        ) : (
          <span className="pill-static">Not yet ranked</span>
        )}
      </a>

      <button
        type="button"
        className="tournament-info-btn"
        aria-label={`${tournament.name} settings`}
        aria-expanded={infoOpen}
        onClick={() => setInfoOpen(o => !o)}
      >
        <InfoIcon />
      </button>

      {infoOpen && <TournamentInfoPopover tournament={tournament} uid={uid} onClose={() => setInfoOpen(false)} />}
    </li>
  );
}

export default function Home() {
  const { user, profile, profileChecked, loading } = useAuth();
  const { tournaments, loading: tLoading } = useTournaments();
  const { invites, loading: invitesLoading, acceptInvite, declineInvite } = useTournamentInvites();
  const [busyId, setBusyId] = useState(null);
  const [homeTab, setHomeTab] = useState('today');
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
        <div className="home-tabs">
          <button type="button" className={`home-tab${homeTab === 'today' ? ' active' : ''}`} onClick={() => setHomeTab('today')}>Today</button>
          <button type="button" className={`home-tab${homeTab === 'history' ? ' active' : ''}`} onClick={() => setHomeTab('history')}>History</button>
        </div>

        {homeTab === 'today' ? (
          <>
            <SharedScoreIntake />

            {!invitesLoading && invites.length > 0 && (
              <section className="panel panel-accent" style={{ marginBottom: 24 }}>
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

            <div className="home-columns">
              <div className="home-main">
                <ScoreBoxes />

                <section className="panel panel-accent">
                  <div className="panel-head-row">
                    <h2>Tournaments</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href="/tournaments/search" className="btn-sm btn-sm-ghost">Find</a>
                      <a href="/tournaments/new" className="btn-sm">+ New</a>
                    </div>
                  </div>

                  {tLoading ? (
                    <div className="list-empty">Loading…</div>
                  ) : tournaments.length === 0 ? (
                    <div className="panel-empty">No tournaments yet — create one, or find one to ask to join.</div>
                  ) : (
                    <ul className="tournament-card-list">
                      {tournaments.map(t => <TournamentRow key={t.id} tournament={t} uid={user.uid} />)}
                    </ul>
                  )}
                </section>
              </div>

              <DailyCompareWidget />
            </div>
          </>
        ) : (
          <div className="home-main">
            <PersonalHistoryTab />
          </div>
        )}
      </main>
    </div>
  );
}
