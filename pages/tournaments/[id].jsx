// pages/tournaments/[id].jsx
// Members get the full-page editorial experience (TournamentEditorial).
// Non-members get a compact join/preview panel in the normal app shell —
// there's nothing to show them yet.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { useTournament, requestToJoin, cancelJoinRequest, hasPendingJoinRequest } from '../../lib/useTournaments';
import TopNav from '../../components/TopNav';
import TournamentEditorial from '../../components/TournamentEditorial';

export default function TournamentDetail() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { tournament, loading } = useTournament(typeof id === 'string' ? id : null);
  const uid = user?.uid;

  const [myJoinPending, setMyJoinPending] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  const isOwner = !!tournament && tournament.ownerId === uid;
  const isMember = !!tournament && tournament.members.includes(uid);

  useEffect(() => {
    if (!tournament || isMember || !uid) { setMyJoinPending(false); return; }
    hasPendingJoinRequest(tournament.id, uid).then(setMyJoinPending);
  }, [tournament, isMember, uid]);

  async function handleAskToJoin() {
    setBusy(true);
    try {
      await requestToJoin(tournament.id, uid);
      setMyJoinPending(true);
    } catch (err) {
      window.alert(err.message || 'Could not send a join request.');
    } finally { setBusy(false); }
  }

  async function handleCancelMyRequest() {
    setBusy(true);
    try {
      await cancelJoinRequest(tournament.id, uid);
      setMyJoinPending(false);
    } catch (err) {
      window.alert(err.message || 'Could not cancel your request.');
    } finally { setBusy(false); }
  }

  if (!profile || loading) return null;

  if (!tournament) {
    return (
      <div className="app-page">
        <TopNav />
        <main className="app-main app-main-narrow">
          <div className="panel">
            <h2>Not found</h2>
            <div className="section-sub">This tournament doesn't exist.</div>
          </div>
        </main>
      </div>
    );
  }

  if (isMember) {
    return <TournamentEditorial tournament={tournament} myUid={uid} manageHref={isOwner ? `/tournaments/${tournament.id}/manage` : null} />;
  }

  return (
    <div className="app-page">
      <TopNav />
      <main className="app-main app-main-narrow">
        <div className="hero">
          <h1>{tournament.name}</h1>
        </div>
        <section className="panel">
          <h2>Join this tournament</h2>
          <div className="section-sub">{tournament.members.length} member{tournament.members.length === 1 ? '' : 's'}</div>
          {myJoinPending ? (
            <button className="btn-sm btn-sm-ghost" disabled={busy} onClick={handleCancelMyRequest}>Cancel request</button>
          ) : (
            <button className="btn-sm" disabled={busy} onClick={handleAskToJoin}>Ask to join</button>
          )}
        </section>
      </main>
    </div>
  );
}
