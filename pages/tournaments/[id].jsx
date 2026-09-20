// pages/tournaments/[id].jsx
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { useFriends } from '../../lib/useFriends';
import {
  useTournament, useTournaments, getTournamentMembers, updateTournamentSettings, removeMember,
  inviteToTournament, cancelInvite, hasPendingInvite, watchJoinRequests,
  approveJoinRequest, declineJoinRequest, requestToJoin, cancelJoinRequest, hasPendingJoinRequest,
  watchWaitlist, promoteFromWaitlist, JOIN_POLICIES,
} from '../../lib/useTournaments';
import { useTournamentStandings } from '../../lib/useTournamentStandings';
import { resolveUser } from '../../lib/users';
import { GAMES, GAME_IDS } from '../../lib/games';
import { SCORING_METRICS, ELIGIBILITY_STEPS } from '../../lib/scoring';
import TopNav from '../../components/TopNav';

function Leaderboard({ tournament, myUid }) {
  const { ranked, sortDir, ready } = useTournamentStandings(tournament);
  const [names, setNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const withNames = await Promise.all(ranked.map(async r => [r.uid, (await resolveUser(r.uid)).username]));
      if (!cancelled) setNames(Object.fromEntries(withNames));
    })();
    return () => { cancelled = true; };
  }, [ranked]);

  if (!ready) return <div className="list-empty">Computing standings…</div>;
  if (ranked.length === 0) {
    return <div className="panel-empty">No one has qualified yet — scores need to be entered first.</div>;
  }

  const isRatioLike = sortDir === 'asc';
  const fmt = v => (isRatioLike ? v.toFixed(3) : v);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="leaderboard">
        <thead>
          <tr>
            <th></th>
            <th>Player</th>
            {tournament.games.length > 1 && tournament.games.map(gId => (
              <th key={gId} className="leaderboard-num">{GAMES.find(g => g.id === gId)?.label || gId}</th>
            ))}
            <th>{tournament.games.length > 1 ? 'Cumulative' : (isRatioLike ? 'Avg ratio' : 'Points')}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(r => (
            <tr key={r.uid} className={r.uid === myUid ? 'leaderboard-me' : ''}>
              <td className="leaderboard-rank">{r.rank}</td>
              <td>{names[r.uid] || '…'}</td>
              {tournament.games.length > 1 && tournament.games.map(gId => {
                const cell = r.perGame?.[gId];
                return (
                  <td key={gId} className={`leaderboard-num${cell?.rank === 1 ? ' leaderboard-winner' : ''}`}>
                    {cell ? fmt(cell.value) : '—'}
                  </td>
                );
              })}
              <td>{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsForm({ tournament, onSaved, onCancel }) {
  const [name, setName] = useState(tournament.name);
  const [games, setGames] = useState(tournament.games);
  const [scoringMetric, setScoringMetric] = useState(tournament.scoringMetric);
  const [thresholdPct, setThresholdPct] = useState(tournament.eligibilityThresholdPct);
  const [startDate, setStartDate] = useState(tournament.startDate);
  const [joinPolicy, setJoinPolicy] = useState(tournament.joinPolicy);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allGamesSelected = GAME_IDS.every(id => games.includes(id));

  function toggleGame(id) {
    setGames(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Give the tournament a name.'); return; }
    if (games.length === 0) { setError('Pick at least one game.'); return; }
    setBusy(true);
    try {
      await updateTournamentSettings(tournament.id, { name, games, scoringMetric, eligibilityThresholdPct: thresholdPct, startDate, joinPolicy });
      onSaved();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="field">
        <label>Name</label>
        <input type="text" className="search-input" style={{ marginBottom: 0 }} value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label>Start date</label>
        <input type="date" className="search-input" style={{ marginBottom: 0 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>

      <div className="panel-head-row" style={{ marginTop: 18 }}>
        <span className="section-sub" style={{ margin: 0 }}>Games</span>
        <button type="button" className="chip-link" onClick={() => setGames(allGamesSelected ? [] : [...GAME_IDS])}>
          {allGamesSelected ? 'Clear all' : 'All games'}
        </button>
      </div>
      <ul className="check-list" style={{ marginBottom: 18 }}>
        {GAMES.map(g => (
          <li key={g.id}>
            <label className="check-row">
              <input type="checkbox" checked={games.includes(g.id)} onChange={() => toggleGame(g.id)} />
              {g.label}
            </label>
          </li>
        ))}
      </ul>

      <div className="section-sub">Scoring</div>
      <ul className="check-list" style={{ marginBottom: 18 }}>
        {SCORING_METRICS.map(m => (
          <li key={m.id}>
            <label className="check-row check-row-radio">
              <input type="radio" name="scoringMetric" checked={scoringMetric === m.id} onChange={() => setScoringMetric(m.id)} />
              <span>
                <span className="check-row-title">{m.label}</span>
                <span className="check-row-desc">{m.desc}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="section-sub">Eligibility threshold</div>
      <div className="stepper" style={{ marginBottom: 20 }}>
        <button type="button" className="stepper-btn"
          disabled={thresholdPct <= ELIGIBILITY_STEPS[0]}
          onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.max(0, ELIGIBILITY_STEPS.indexOf(p) - 1)])}
        >−</button>
        <span className="stepper-value">{thresholdPct}%</span>
        <button type="button" className="stepper-btn"
          disabled={thresholdPct >= ELIGIBILITY_STEPS[ELIGIBILITY_STEPS.length - 1]}
          onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.min(ELIGIBILITY_STEPS.length - 1, ELIGIBILITY_STEPS.indexOf(p) + 1)])}
        >+</button>
      </div>

      <div className="section-sub">When can people join?</div>
      <ul className="check-list" style={{ marginBottom: 20 }}>
        {JOIN_POLICIES.map(p => (
          <li key={p.id}>
            <label className="check-row check-row-radio">
              <input type="radio" name="joinPolicy" checked={joinPolicy === p.id} onChange={() => setJoinPolicy(p.id)} />
              <span>
                <span className="check-row-title">{p.label}</span>
                <span className="check-row-desc">{p.desc}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error && <div className="error">{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn-sm btn-sm-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function TournamentDetail() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const { friends } = useFriends();
  const { deleteTournament } = useTournaments();
  const router = useRouter();
  const { id } = router.query;
  const { tournament, loading } = useTournament(typeof id === 'string' ? id : null);
  const uid = user?.uid;

  const [members, setMembers] = useState(null);
  const [editing, setEditing] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [invitableFriends, setInvitableFriends] = useState(null);
  const [myJoinPending, setMyJoinPending] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  const isOwner = !!tournament && tournament.ownerId === uid;
  const isMember = !!tournament && tournament.members.includes(uid);

  const loadMembers = useCallback(async () => {
    if (!tournament) return;
    const rows = await getTournamentMembers(tournament.id);
    const withNames = await Promise.all(rows.map(async r => ({ ...r, ...(await resolveUser(r.uid)) })));
    withNames.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.username.localeCompare(b.username)));
    setMembers(withNames);
  }, [tournament]);

  useEffect(() => { if (isMember) loadMembers(); }, [isMember, loadMembers]);

  useEffect(() => {
    if (!isOwner || !tournament) return;
    return watchJoinRequests(tournament.id, async (rows) => {
      const withNames = await Promise.all(rows.map(async r => ({ ...r, ...(await resolveUser(r.uid)) })));
      setJoinRequests(withNames);
    });
  }, [isOwner, tournament]);

  useEffect(() => {
    if (!isOwner || !tournament) return;
    return watchWaitlist(tournament.id, async (rows) => {
      const withNames = await Promise.all(rows.map(async r => ({ ...r, ...(await resolveUser(r.uid)) })));
      setWaitlist(withNames);
    });
  }, [isOwner, tournament]);

  useEffect(() => {
    if (!isOwner || !tournament) { setInvitableFriends(null); return; }
    (async () => {
      const notMember = friends.filter(f => !tournament.members.includes(f.uid));
      const withStatus = await Promise.all(notMember.map(async f => ({
        ...f, invited: await hasPendingInvite(tournament.id, f.uid),
      })));
      setInvitableFriends(withStatus);
    })();
  }, [isOwner, tournament, friends]);

  useEffect(() => {
    if (!tournament || isMember || !uid) { setMyJoinPending(false); return; }
    hasPendingJoinRequest(tournament.id, uid).then(setMyJoinPending);
  }, [tournament, isMember, uid]);

  // Every owner/member action below can fail on a Firestore permission
  // error (e.g. a doc written under an older schema version missing a field
  // the current rules validate) — always surfaced, never silent, since a
  // silent failure here means the UI claims something worked when it didn't.
  async function handleInvite(targetUid) {
    setBusyUid(targetUid);
    try {
      await inviteToTournament(tournament.id, tournament.name, tournament.ownerId, targetUid);
      setInvitableFriends(prev => prev.map(f => f.uid === targetUid ? { ...f, invited: true } : f));
    } catch (err) {
      window.alert(err.message || 'Could not send that invite.');
    } finally { setBusyUid(null); }
  }

  async function handleCancelInvite(targetUid) {
    setBusyUid(targetUid);
    try {
      await cancelInvite(tournament.id, targetUid);
      setInvitableFriends(prev => prev.map(f => f.uid === targetUid ? { ...f, invited: false } : f));
    } catch (err) {
      window.alert(err.message || 'Could not cancel that invite.');
    } finally { setBusyUid(null); }
  }

  async function handleRemove(memberUid) {
    if (!window.confirm('Remove this person from the tournament?')) return;
    setBusyUid(memberUid);
    try {
      await removeMember(tournament.id, memberUid);
      await loadMembers();
    } catch (err) {
      window.alert(err.message || 'Could not remove this member.');
    } finally { setBusyUid(null); }
  }

  async function handleApprove(requesterUid) {
    setBusyUid(requesterUid);
    try {
      await approveJoinRequest(tournament.id, requesterUid);
      await loadMembers();
    } catch (err) {
      window.alert(err.message || 'Could not approve this request.');
    } finally { setBusyUid(null); }
  }

  async function handleDecline(requesterUid) {
    setBusyUid(requesterUid);
    try {
      await declineJoinRequest(tournament.id, requesterUid);
    } catch (err) {
      window.alert(err.message || 'Could not decline this request.');
    } finally { setBusyUid(null); }
  }

  async function handleAskToJoin() {
    setBusyUid('__ask__');
    try {
      await requestToJoin(tournament.id, uid);
      setMyJoinPending(true);
    } catch (err) {
      window.alert(err.message || 'Could not send a join request.');
    } finally { setBusyUid(null); }
  }

  async function handleCancelMyRequest() {
    setBusyUid('__ask__');
    try {
      await cancelJoinRequest(tournament.id, uid);
      setMyJoinPending(false);
    } catch (err) {
      window.alert(err.message || 'Could not cancel your request.');
    } finally { setBusyUid(null); }
  }

  async function handlePromote(targetUid) {
    setBusyUid(targetUid);
    try {
      await promoteFromWaitlist(tournament.id, targetUid);
      await loadMembers();
    } catch (err) {
      window.alert(err.message || 'Could not add this person now.');
    } finally { setBusyUid(null); }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${tournament.name}" for everyone? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTournament(tournament.id);
      router.replace('/');
    } catch (err) {
      window.alert(err.message || 'Could not delete this tournament.');
      setDeleting(false);
    }
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

        {!isMember && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Join this tournament</h2>
            <div className="section-sub">{tournament.members.length} member{tournament.members.length === 1 ? '' : 's'}</div>
            {myJoinPending ? (
              <button className="btn-sm btn-sm-ghost" disabled={busyUid === '__ask__'} onClick={handleCancelMyRequest}>
                Cancel request
              </button>
            ) : (
              <button className="btn-sm" disabled={busyUid === '__ask__'} onClick={handleAskToJoin}>
                Ask to join
              </button>
            )}
          </section>
        )}

        {isMember && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Standings</h2>
            <Leaderboard tournament={tournament} myUid={uid} />
          </section>
        )}

        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head-row">
            <h2>Configuration</h2>
            {isOwner && !editing && (
              <button className="chip-link" onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>
          {editing ? (
            <SettingsForm
              tournament={tournament}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <dl className="config-list">
              <dt>Start date</dt>
              <dd>{tournament.startDate}</dd>
              <dt>Scoring</dt>
              <dd>{metric?.label || tournament.scoringMetric}</dd>
              <dt>Eligibility threshold</dt>
              <dd>{tournament.eligibilityThresholdPct}%</dd>
              <dt>Joining</dt>
              <dd>{JOIN_POLICIES.find(p => p.id === tournament.joinPolicy)?.label || tournament.joinPolicy}</dd>
              <dt>Games</dt>
              <dd>{gameLabels.join(', ')}</dd>
            </dl>
          )}
        </section>

        {isOwner && waitlist.length > 0 && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Waitlist</h2>
            <div className="section-sub">Joining at the start of next month — approve early if you'd rather not wait.</div>
            <ul className="people-list">
              {waitlist.map(w => (
                <li key={w.uid} className="people-row">
                  <span className="people-name">{w.username}</span>
                  <button className="btn-sm" disabled={busyUid === w.uid} onClick={() => handlePromote(w.uid)}>
                    Add now
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isOwner && joinRequests.length > 0 && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Join requests</h2>
            <div className="section-sub">{joinRequests.length} pending</div>
            <ul className="people-list">
              {joinRequests.map(r => (
                <li key={r.uid} className="people-row">
                  <span className="people-name">{r.username}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" disabled={busyUid === r.uid} onClick={() => handleApprove(r.uid)}>Approve</button>
                    <button className="btn-sm btn-sm-ghost" disabled={busyUid === r.uid} onClick={() => handleDecline(r.uid)}>Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isMember && (
          <section className="panel" style={{ marginBottom: isOwner ? 20 : 0 }}>
            <h2>Members</h2>
            <div className="section-sub">{tournament.members.length} in this tournament</div>
            {!members ? (
              <div className="list-empty">Loading…</div>
            ) : (
              <ul className="people-list">
                {members.map(m => (
                  <li key={m.uid} className="people-row">
                    <span className="people-name">{m.username}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {m.role === 'owner' && <span className="pill-static">Owner</span>}
                      {isOwner && m.role !== 'owner' && (
                        <button className="btn-sm btn-sm-ghost" disabled={busyUid === m.uid} onClick={() => handleRemove(m.uid)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isOwner && (
          <section className="panel">
            <h2>Invite friends</h2>
            {!invitableFriends ? (
              <div className="list-empty">Loading…</div>
            ) : invitableFriends.length === 0 ? (
              <div className="panel-empty">Everyone on your friends list is already in, or already invited.</div>
            ) : (
              <ul className="people-list">
                {invitableFriends.map(f => (
                  <li key={f.uid} className="people-row">
                    <span className="people-name">{f.username}</span>
                    {f.invited ? (
                      <button className="btn-sm btn-sm-ghost" disabled={busyUid === f.uid} onClick={() => handleCancelInvite(f.uid)}>
                        Cancel invite
                      </button>
                    ) : (
                      <button className="btn-sm" disabled={busyUid === f.uid} onClick={() => handleInvite(f.uid)}>
                        Invite
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isOwner && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button className="btn-sm btn-sm-ghost" style={{ color: 'var(--loss)' }} disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting…' : 'Delete tournament'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
