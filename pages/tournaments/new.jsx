// pages/tournaments/new.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { useFriends } from '../../lib/useFriends';
import { useTournaments } from '../../lib/useTournaments';
import { GAMES, GAME_IDS } from '../../lib/games';
import { SCORING_METRICS, DEFAULT_SCORING_METRIC, ELIGIBILITY_STEPS, DEFAULT_ELIGIBILITY_PCT } from '../../lib/scoring';
import { JOIN_POLICIES, DEFAULT_JOIN_POLICY } from '../../lib/useTournaments';
import { todayIso } from '../../lib/games';
import TopNav from '../../components/TopNav';

export default function NewTournament() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const { friends } = useFriends();
  const { createTournament } = useTournaments();
  const router = useRouter();

  const [name, setName] = useState('');
  const [games, setGames] = useState([...GAME_IDS]);
  const [scoringMetric, setScoringMetric] = useState(DEFAULT_SCORING_METRIC);
  const [thresholdPct, setThresholdPct] = useState(DEFAULT_ELIGIBILITY_PCT);
  const [startDate, setStartDate] = useState(todayIso());
  const [joinPolicy, setJoinPolicy] = useState(DEFAULT_JOIN_POLICY);
  const [inviteUids, setInviteUids] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  function toggleGame(id) {
    setGames(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  }

  function toggleInvite(uid) {
    setInviteUids(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]);
  }

  const allGamesSelected = GAME_IDS.every(id => games.includes(id));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Give the tournament a name.'); return; }
    if (games.length === 0) { setError('Pick at least one game.'); return; }
    setBusy(true);
    try {
      const id = await createTournament({ name, games, scoringMetric, eligibilityThresholdPct: thresholdPct, startDate, joinPolicy, inviteUids });
      router.replace(`/tournaments/${id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="app-page">
      <TopNav />
      <main className="app-main app-main-narrow">
        <div className="hero">
          <h1>New tournament</h1>
          <p>Choose its games, scoring, and who's in.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Name</h2>
            <input
              type="text"
              className="search-input"
              style={{ marginBottom: 0 }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Autumn League"
              autoFocus
            />
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Start date</h2>
            <div className="section-sub">When this tournament's scoring begins.</div>
            <input
              type="date"
              className="search-input"
              style={{ marginBottom: 0 }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head-row">
              <h2>Games</h2>
              <button
                type="button"
                className="chip-link"
                onClick={() => setGames(allGamesSelected ? [] : [...GAME_IDS])}
              >
                {allGamesSelected ? 'Clear all' : 'All games'}
              </button>
            </div>
            <ul className="check-list">
              {GAMES.map(g => (
                <li key={g.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={games.includes(g.id)} onChange={() => toggleGame(g.id)} />
                    {g.label}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Scoring</h2>
            <div className="section-sub">How daily results turn into standings.</div>
            <ul className="check-list">
              {SCORING_METRICS.map(m => (
                <li key={m.id}>
                  <label className="check-row check-row-radio">
                    <input
                      type="radio"
                      name="scoringMetric"
                      checked={scoringMetric === m.id}
                      onChange={() => setScoringMetric(m.id)}
                    />
                    <span>
                      <span className="check-row-title">{m.label}</span>
                      <span className="check-row-desc">{m.desc}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Eligibility threshold</h2>
            <div className="section-sub">
              Minimum participation to qualify for standings, as a share of each player's active window.
            </div>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                disabled={thresholdPct <= ELIGIBILITY_STEPS[0]}
                onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.max(0, ELIGIBILITY_STEPS.indexOf(p) - 1)])}
              >−</button>
              <span className="stepper-value">{thresholdPct}%</span>
              <button
                type="button"
                className="stepper-btn"
                disabled={thresholdPct >= ELIGIBILITY_STEPS[ELIGIBILITY_STEPS.length - 1]}
                onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.min(ELIGIBILITY_STEPS.length - 1, ELIGIBILITY_STEPS.indexOf(p) + 1)])}
              >+</button>
            </div>
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>When can people join?</h2>
            <ul className="check-list">
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
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <h2>Invite friends</h2>
            <div className="section-sub">You're added automatically as the owner. Everyone else is invited, not added — they join once they accept.</div>
            {friends.length === 0 ? (
              <div className="panel-empty">No friends yet — add some first, or create this just for yourself for now.</div>
            ) : (
              <ul className="check-list">
                {friends.map(f => (
                  <li key={f.uid}>
                    <label className="check-row">
                      <input type="checkbox" checked={inviteUids.includes(f.uid)} onChange={() => toggleInvite(f.uid)} />
                      {f.username}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && <div className="error" style={{ margin: '0 0 16px' }}>{error}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create tournament'}
          </button>
        </form>
      </main>
    </div>
  );
}
