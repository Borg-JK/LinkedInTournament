// pages/tournaments/search.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/useAuth';
import { searchTournaments, requestToJoin, cancelJoinRequest, hasPendingJoinRequest } from '../../lib/useTournaments';
import { GAMES } from '../../lib/games';
import TopNav from '../../components/TopNav';

function statusFor(t, uid) {
  if (t.members?.includes(uid)) return 'member';
  return null; // resolved async into a separate map (needs a read per result)
}

export default function SearchTournaments() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const router = useRouter();
  const uid = user?.uid;

  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  const runSearch = useCallback(async (value) => {
    setSearching(true);
    const found = await searchTournaments(value);
    const pendingSet = new Set();
    await Promise.all(found.map(async t => {
      if (!t.members.includes(uid) && await hasPendingJoinRequest(t.id, uid)) pendingSet.add(t.id);
    }));
    setPending(pendingSet);
    setResults(found);
    setSearching(false);
  }, [uid]);

  function onTermChange(value) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  }

  async function handleAsk(tournamentId) {
    setBusyId(tournamentId);
    try {
      await requestToJoin(tournamentId, uid);
      setPending(prev => new Set(prev).add(tournamentId));
    } catch (err) {
      window.alert(err.message || 'Could not send a join request.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(tournamentId) {
    setBusyId(tournamentId);
    try {
      await cancelJoinRequest(tournamentId, uid);
      setPending(prev => { const next = new Set(prev); next.delete(tournamentId); return next; });
    } catch (err) {
      window.alert(err.message || 'Could not cancel that request.');
    } finally {
      setBusyId(null);
    }
  }

  if (!profile) return null;

  return (
    <div className="app-page page-warm">
      <TopNav />
      <main className="app-main app-main-medium">
        <div className="hero">
          <div className="hero-eyebrow">Discover</div>
          <h1>Find a tournament</h1>
          <p>Search by name and ask to join.</p>
        </div>

        <section className="panel panel-accent">
          <input
            type="text"
            className="search-input"
            placeholder="Search tournament name…"
            value={term}
            onChange={e => onTermChange(e.target.value)}
          />

          {searching && <div className="list-empty">Searching…</div>}
          {!searching && term.trim() && results.length === 0 && (
            <div className="list-empty">No tournaments found.</div>
          )}

          {!searching && results.length > 0 && (
            <ul className="people-list">
              {results.map(t => {
                const status = statusFor(t, uid);
                const isPending = pending.has(t.id);
                return (
                  <li key={t.id} className="people-row">
                    <a href={`/tournaments/${t.id}`} className="people-name" style={{ textDecoration: 'none' }}>
                      {t.name}
                      <span className="pill-static" style={{ display: 'block', fontWeight: 400 }}>
                        {t.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ')} · {t.members.length} member{t.members.length === 1 ? '' : 's'}
                      </span>
                    </a>
                    {status === 'member' && <span className="pill-static">Member</span>}
                    {status !== 'member' && isPending && (
                      <button className="btn-sm btn-sm-ghost" disabled={busyId === t.id} onClick={() => handleCancel(t.id)}>
                        Cancel request
                      </button>
                    )}
                    {status !== 'member' && !isPending && (
                      <button className="btn-sm" disabled={busyId === t.id} onClick={() => handleAsk(t.id)}>
                        Ask to join
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
