// pages/settings.jsx
// Personal settings: how you enter scores, and the order your games' score
// boxes appear in. Both save as you change them.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { orderedGames } from '../lib/games';
import { themeFor } from '../lib/theme';
import AppShell, { SCORE_ENTRY_MODES } from '../components/AppShell';

const MODE_HELP = {
  paste: 'Each game’s box takes its own LinkedIn share.',
  single: 'Paste once, above the boxes — one result or several — and the game is worked out for you.',
  type: 'Type the time into each box.',
};

export default function Settings() {
  const { user, profile, profileChecked, loading, setScoreEntryDefault, setGameOrder } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  if (!user || !profile) return null;

  const mode = profile.scoreEntryDefault || 'paste';
  const games = orderedGames(profile.gameOrder);

  async function save(fn) {
    try { await fn(); }
    catch (err) { window.alert(err.message || 'Could not save that.'); }
  }
  function move(i, by) {
    const ids = games.map(g => g.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    save(() => setGameOrder(ids));
  }

  return (
    <AppShell>
      <main className="app-main app-main-narrow">
        <div className="hero">
          <div className="hero-eyebrow">You</div>
          <h1>Settings</h1>
        </div>

        <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="entry-h">
          <h2 id="entry-h">Entering scores</h2>
          <ul className="check-list" style={{ marginTop: 14 }}>
            {SCORE_ENTRY_MODES.map(([id, label]) => (
              <li key={id}>
                <label className="check-row check-row-radio">
                  <input type="radio" name="scoreEntry" checked={mode === id} onChange={() => save(() => setScoreEntryDefault(id))} />
                  <span>
                    <span className="check-row-title">{label}</span>
                    <span className="check-row-desc">{MODE_HELP[id]}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" id="order" aria-labelledby="order-h">
          <div className="panel-head-row">
            <h2 id="order-h">Game order</h2>
            {Array.isArray(profile.gameOrder) && profile.gameOrder.length > 0 && (
              <button type="button" className="chip-link" onClick={() => save(() => setGameOrder([]))}>Reset</button>
            )}
          </div>
          <div className="section-sub">The order your score boxes appear in on Today.</div>
          <ol className="order-list">
            {games.map((g, i) => (
              <li key={g.id} className="order-row" style={{ '--game': themeFor(g.id).accent }}>
                <span className="order-num">{i + 1}</span>
                <span className="order-dot" aria-hidden="true" />
                <span className="order-name">{g.label}</span>
                <button type="button" className="order-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${g.label} up`}>↑</button>
                <button type="button" className="order-btn" onClick={() => move(i, 1)} disabled={i === games.length - 1} aria-label={`Move ${g.label} down`}>↓</button>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </AppShell>
  );
}
