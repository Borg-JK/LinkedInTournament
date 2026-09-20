// pages/tournaments/[id].jsx
// Config + membership only — standings land here in Phase 5 once real score
// data exists to compute them from.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { useTournament, getTournamentMembers } from '../../lib/useTournaments';
import { resolveUser } from '../../lib/users';
import { GAMES } from '../../lib/games';
import { SCORING_METRICS } from '../../lib/scoring';
import TopNav from '../../components/TopNav';

export default function TournamentDetail() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { tournament, loading } = useTournament(typeof id === 'string' ? id : null);
  const [members, setMembers] = useState(null);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  useEffect(() => {
    if (!tournament) return;
    let cancelled = false;
    (async () => {
      const rows = await getTournamentMembers(tournament.id);
      const withNames = await Promise.all(rows.map(async r => ({ ...r, ...(await resolveUser(r.uid)) })));
      withNames.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.username.localeCompare(b.username)));
      if (!cancelled) setMembers(withNames);
    })();
    return () => { cancelled = true; };
  }, [tournament]);

  if (!profile || loading) return null;

  if (!tournament) {
    return (
      <div className="app-page">
        <TopNav />
        <main className="app-main app-main-narrow">
          <div className="panel">
            <h2>Not found</h2>
            <div className="section-sub">This tournament doesn't exist, or you're not a member.</div>
          </div>
        </main>
      </div>
    );
  }

  const metric = SCORING_METRICS.find(m => m.id === tournament.scoringMetric);
  const gameLabels = tournament.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId);

  return (
    <div className="app-page">
      <TopNav />
      <main className="app-main app-main-narrow">
        <div className="hero">
          <h1>{tournament.name}</h1>
          <p>{gameLabels.join(', ')}</p>
        </div>

        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>Standings</h2>
          <div className="panel-empty">Live standings arrive in Phase 5, once there's real score data.</div>
        </section>

        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>Configuration</h2>
          <dl className="config-list">
            <dt>Scoring</dt>
            <dd>{metric?.label || tournament.scoringMetric}</dd>
            <dt>Eligibility threshold</dt>
            <dd>{tournament.eligibilityThresholdPct}%</dd>
            <dt>Games</dt>
            <dd>{gameLabels.join(', ')}</dd>
          </dl>
        </section>

        <section className="panel">
          <h2>Members</h2>
          <div className="section-sub">{tournament.members.length} in this tournament</div>
          {!members ? (
            <div className="list-empty">Loading…</div>
          ) : (
            <ul className="people-list">
              {members.map(m => (
                <li key={m.uid} className="people-row">
                  <span className="people-name">{m.username}</span>
                  {m.role === 'owner' && <span className="pill-static">Owner</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
