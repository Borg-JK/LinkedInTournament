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
import { themeFor } from '../../lib/theme';
import { colorForUid } from '../../lib/colors';
import AppShell from '../../components/AppShell';

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

  const metric = SCORING_METRICS.find(m => m.id === scoringMetric);
  const join = JOIN_POLICIES.find(p => p.id === joinPolicy);
  const reveal = REVEAL_POLICIES.find(p => p.id === revealPolicy);
  const rulesSummary = [
    `${thresholdPct}% to qualify`,
    join?.label,
    revealPolicy === 'interval' ? `${reveal?.label} (every ${revealIntervalDays} days)` : reveal?.label,
  ].filter(Boolean).join(' · ');

  return (
    <AppShell>
      <main className="app-main app-main-setup">
        <div className="hero">
          <div className="hero-eyebrow">Start something</div>
          <h1>New tournament</h1>
        </div>

        <form onSubmit={handleSubmit} className="setup">
          <div className="setup-grid">
            <section className="panel setup-card" aria-labelledby="setup-basics">
              <h2 id="setup-basics" className="setup-h">Name and games</h2>
              <div className="setup-row">
                <div className="field setup-name">
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
                <div className="field setup-start">
                  <label htmlFor="tstart">Starts</label>
                  <input id="tstart" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
              </div>

              <div className="setup-label-row">
                <span className="field-label" id="games-label">Games</span>
                <button type="button" className="chip-link" onClick={() => setGames(allGamesSelected ? [] : [...GAME_IDS])}>
                  {allGamesSelected ? 'Clear all' : 'All games'}
                </button>
              </div>
              <div className="setup-chips" role="group" aria-labelledby="games-label">
                {GAMES.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    className="setup-game"
                    style={{ '--game': themeFor(g.id).accent }}
                    aria-pressed={games.includes(g.id)}
                    onClick={() => toggleGame(g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel setup-card" aria-labelledby="setup-scoring">
              <h2 id="setup-scoring" className="setup-h">Scoring</h2>
              <div className="setup-tiles" role="radiogroup" aria-labelledby="setup-scoring">
                {SCORING_METRICS.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={scoringMetric === m.id}
                    className="setup-tile"
                    onClick={() => setScoringMetric(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="setup-desc">{metric?.desc}</p>
            </section>

            <section className="panel setup-card" aria-labelledby="setup-who">
              <h2 id="setup-who" className="setup-h">Invite</h2>
              <p className="setup-desc setup-desc-top">You're in as the owner. Friends you pick get an invite and join once they accept.</p>
              {friends.length === 0 ? (
                <div className="panel-empty">No friends yet — add some first, or make this just for yourself for now.</div>
              ) : (
                <div className="setup-chips" role="group" aria-labelledby="setup-who">
                  {friends.map(f => (
                    <button
                      key={f.uid}
                      type="button"
                      className="setup-friend"
                      aria-pressed={inviteUids.includes(f.uid)}
                      onClick={() => toggleInvite(f.uid)}
                    >
                      <span className="setup-friend-dot" style={{ background: colorForUid(f.uid) }} aria-hidden="true" />
                      {f.username}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* The rules most tournaments leave alone, folded into a line
                that says what they are. */}
            <details className="panel setup-card setup-rules">
              <summary>
                <span className="setup-h">Rules</span>
                <span className="setup-rules-summary">{rulesSummary}</span>
                <span className="setup-rules-change">Change</span>
              </summary>

              <div className="setup-rule">
                <span className="field-label">To qualify</span>
                <div className="stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Lower the threshold"
                    disabled={thresholdPct <= ELIGIBILITY_STEPS[0]}
                    onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.max(0, ELIGIBILITY_STEPS.indexOf(p) - 1)])}
                  >−</button>
                  <span className="stepper-value">{thresholdPct}%</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label="Raise the threshold"
                    disabled={thresholdPct >= ELIGIBILITY_STEPS[ELIGIBILITY_STEPS.length - 1]}
                    onClick={() => setThresholdPct(p => ELIGIBILITY_STEPS[Math.min(ELIGIBILITY_STEPS.length - 1, ELIGIBILITY_STEPS.indexOf(p) + 1)])}
                  >+</button>
                </div>
                <span className="field-help">of days played, at least</span>
              </div>

              <div className="setup-rule-block">
                <span className="field-label" id="join-label">Joining</span>
                <div className="setup-seg" role="radiogroup" aria-labelledby="join-label">
                  {JOIN_POLICIES.map(p => (
                    <button key={p.id} type="button" role="radio" aria-checked={joinPolicy === p.id} className="setup-seg-btn" onClick={() => setJoinPolicy(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="setup-desc">{join?.desc}</p>
              </div>

              <div className="setup-rule-block">
                <span className="field-label" id="reveal-label">Standings reveal</span>
                <div className="setup-seg setup-seg-wrap" role="radiogroup" aria-labelledby="reveal-label">
                  {REVEAL_POLICIES.map(p => (
                    <button key={p.id} type="button" role="radio" aria-checked={revealPolicy === p.id} className="setup-seg-btn" onClick={() => setRevealPolicy(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="setup-desc">{reveal?.desc}</p>
                {revealPolicy === 'interval' && (
                  <label className="setup-interval">
                    Every
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={revealIntervalDays}
                      onChange={e => setRevealIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                    days
                  </label>
                )}
              </div>
            </details>
          </div>

          {/* Always in reach: what you're about to make, and the button. */}
          <div className="setup-bar">
            <span className="setup-bar-summary">
              {games.length} {games.length === 1 ? 'game' : 'games'} · {metric?.label}
              {inviteUids.length > 0 ? ` · ${inviteUids.length} invited` : ''}
            </span>
            {error && <span className="setup-bar-error" role="alert">{error}</span>}
            <button className="btn setup-create" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create tournament'}
            </button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
