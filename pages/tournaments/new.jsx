// pages/tournaments/new.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { useFriends } from '../../lib/useFriends';
import { useTournaments } from '../../lib/useTournaments';
import { GAMES, GAME_IDS } from '../../lib/games';
import { SCORING_METRICS, DEFAULT_SCORING_METRIC, ELIGIBILITY_STEPS, DEFAULT_ELIGIBILITY_PCT } from '../../lib/scoring';
import { JOIN_POLICIES, DEFAULT_JOIN_POLICY } from '../../lib/useTournaments';
import { REVEAL_POLICIES, DEFAULT_REVEAL_POLICY, DEFAULT_REVEAL_INTERVAL_DAYS } from '../../lib/reveal';
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
  const [revealPolicy, setRevealPolicy] = useState(DEFAULT_REVEAL_POLICY);
  const [revealIntervalDays, setRevealIntervalDays] = useState(DEFAULT_REVEAL_INTERVAL_DAYS);
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
      const id = await createTournament({
        name, games, scoringMetric, eligibilityThresholdPct: thresholdPct, startDate, joinPolicy,
        revealPolicy, revealIntervalDays, inviteUids,
      });
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
          <div className="hero-eyebrow">Start something</div>
          <h1>New tournament</h1>
          <p>Choose its games, scoring, and who's in.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <span className="section-head-num">01</span>
              <h2>The basics</h2>
            </div>
            <div className="section-sub">What it's called, and when scoring begins.</div>

            <div className="field">
              <label htmlFor="tname">Name</label>
              <input
                id="tname"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Autumn League"
                autoFocus
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="tstart">Start date</label>
              <input
                id="tstart"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <span className="section-head-num">02</span>
              <h2>Games &amp; scoring</h2>
            </div>
            <div className="section-sub">Which puzzles count, and how daily results turn into standings.</div>

            <div className="panel-head-row" style={{ marginTop: 18 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Games</span>
              <button
                type="button"
                className="chip-link"
                onClick={() => setGames(allGamesSelected ? [] : [...GAME_IDS])}
              >
                {allGamesSelected ? 'Clear all' : 'All games'}
              </button>
            </div>
            <ul className="check-list" style={{ marginBottom: 22 }}>
              {GAMES.map(g => (
                <li key={g.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={games.includes(g.id)} onChange={() => toggleGame(g.id)} />
                    {g.label}
                  </label>
                </li>
              ))}
            </ul>

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
            <div className="section-head">
              <span className="section-head-num">03</span>
              <h2>How it plays</h2>
            </div>
            <div className="section-sub">Participation, joining, and how much suspense the reveal has.</div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                Eligibility threshold
              </span>
              <span className="section-sub" style={{ margin: 0, textAlign: 'right', maxWidth: 260 }}>
                Minimum participation to qualify for standings
              </span>
            </div>
            <div className="stepper" style={{ marginBottom: 26 }}>
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

            <div className="field-label">
              When can people join?
            </div>
            <ul className="check-list" style={{ marginBottom: 26 }}>
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

            <div className="field-label">
              Standings reveal
            </div>
            <ul className="check-list">
              {REVEAL_POLICIES.map(p => (
                <li key={p.id}>
                  <label className="check-row check-row-radio">
                    <input type="radio" name="revealPolicy" checked={revealPolicy === p.id} onChange={() => setRevealPolicy(p.id)} />
                    <span>
                      <span className="check-row-title">{p.label}</span>
                      <span className="check-row-desc">{p.desc}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {revealPolicy === 'interval' && (
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label>Reveal every</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    style={{ width: 90 }}
                    value={revealIntervalDays}
                    onChange={e => setRevealIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                  <span className="section-sub" style={{ margin: 0 }}>days</span>
                </div>
              </div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <span className="section-head-num">04</span>
              <h2>Who's in</h2>
            </div>
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
