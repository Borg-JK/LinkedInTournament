// pages/friends.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useFriends, useSuggestedFriends } from '../lib/useFriends';
import TopNav from '../components/TopNav';

function statusFor(result, { isFriend, hasIncomingFrom, sentSet }) {
  if (isFriend(result.uid)) return 'friend';
  if (hasIncomingFrom(result.uid)) return 'incoming';
  if (sentSet.has(result.uid)) return 'sent';
  return 'none';
}

export default function Friends() {
  const { user, profile, profileChecked, loading: authLoading } = useAuth();
  const router = useRouter();
  const {
    friends, incomingRequests, loading: friendsLoading,
    searchUsernames, hasSentRequestTo, isFriend, hasIncomingFrom,
    sendFriendRequest, acceptRequest, declineRequest,
  } = useFriends();
  const { suggestions, loading: suggestionsLoading } = useSuggestedFriends(friends);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [sentSet, setSentSet] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (authLoading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [authLoading, profileChecked, user, profile, router]);

  const runSearch = useCallback(async (value) => {
    setSearching(true);
    const found = await searchUsernames(value);
    const sent = new Set();
    await Promise.all(found.map(async r => {
      if (!isFriend(r.uid) && !hasIncomingFrom(r.uid) && await hasSentRequestTo(r.uid)) {
        sent.add(r.uid);
      }
    }));
    setSentSet(sent);
    setResults(found);
    setSearching(false);
  }, [searchUsernames, hasSentRequestTo, isFriend, hasIncomingFrom]);

  function onTermChange(value) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  }

  async function handleAdd(targetUid) {
    setBusyUid(targetUid);
    try {
      await sendFriendRequest(targetUid);
      setSentSet(prev => new Set(prev).add(targetUid));
    } catch (err) {
      window.alert(err.message || 'Could not send that request.');
    } finally {
      setBusyUid(null);
    }
  }

  async function handleAccept(fromUid) {
    setBusyUid(fromUid);
    try {
      await acceptRequest(fromUid);
    } catch (err) {
      window.alert(err.message || 'Could not accept that request.');
    } finally {
      setBusyUid(null);
    }
  }

  async function handleDecline(fromUid) {
    setBusyUid(fromUid);
    try {
      await declineRequest(fromUid);
    } catch (err) {
      window.alert(err.message || 'Could not decline that request.');
    } finally {
      setBusyUid(null);
    }
  }

  if (!profile) return null;

  const showingSearch = term.trim().length > 0;

  return (
    <div className="app-page page-warm">
      <TopNav />
      <main className="app-main">
        <div className="hero">
          <div className="hero-eyebrow">Your network</div>
          <h1>Friends</h1>
          <p>Find people by username, and manage requests.</p>
        </div>

        <div className="home-columns">
          <div className="home-main">
            <section className="panel panel-accent" style={{ marginBottom: 24 }}>
              <div className="section-head">
                <span className="section-head-num">01</span>
                <h2>Add a friend</h2>
              </div>
              <div className="section-sub">Search by username.</div>

              <input
                type="text"
                className="search-input"
                placeholder="Search username…"
                value={term}
                onChange={e => onTermChange(e.target.value)}
              />

              {showingSearch ? (
                <>
                  {searching && <div className="list-empty">Searching…</div>}
                  {!searching && results.length === 0 && (
                    <div className="list-empty">No one found.</div>
                  )}
                  {!searching && results.length > 0 && (
                    <ul className="people-list">
                      {results.map(r => {
                        const status = statusFor(r, { isFriend, hasIncomingFrom, sentSet });
                        return (
                          <li key={r.uid} className="people-row">
                            <span className="people-name">{r.username}</span>
                            {status === 'friend' && <span className="pill-static">Friends</span>}
                            {status === 'sent' && <span className="pill-static">Request sent</span>}
                            {status === 'incoming' && (
                              <button className="btn-sm" disabled={busyUid === r.uid} onClick={() => handleAccept(r.uid)}>
                                Accept request
                              </button>
                            )}
                            {status === 'none' && (
                              <button className="btn-sm" disabled={busyUid === r.uid} onClick={() => handleAdd(r.uid)}>
                                Add friend
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <div className="field-label" style={{ marginTop: 20 }}>People you may know</div>
                  {suggestionsLoading ? (
                    <div className="list-empty">Looking…</div>
                  ) : suggestions.length === 0 ? (
                    <div className="list-empty">No suggestions yet — add a friend or two and we'll find more.</div>
                  ) : (
                    <ul className="people-list">
                      {suggestions.map(s => (
                        <li key={s.uid} className="people-row">
                          <span className="people-name">
                            {s.username}
                            <span className="pill-static" style={{ display: 'block', fontWeight: 400 }}>
                              {s.mutualCount} mutual friend{s.mutualCount === 1 ? '' : 's'}
                            </span>
                          </span>
                          <button className="btn-sm" disabled={busyUid === s.uid} onClick={() => handleAdd(s.uid)}>
                            Add friend
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {incomingRequests.length > 0 && (
              <section className="panel panel-accent">
                <div className="section-head">
                  <span className="section-head-num">02</span>
                  <h2>Requests</h2>
                </div>
                <div className="section-sub">{incomingRequests.length} pending</div>
                <ul className="people-list">
                  {incomingRequests.map(r => (
                    <li key={r.uid} className="people-row">
                      <span className="people-name">{r.username}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-sm" disabled={busyUid === r.uid} onClick={() => handleAccept(r.uid)}>
                          Accept
                        </button>
                        <button className="btn-sm btn-sm-ghost" disabled={busyUid === r.uid} onClick={() => handleDecline(r.uid)}>
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="daily-compare">
            <div className="daily-compare-title">Your friends</div>
            <div className="section-sub" style={{ textAlign: 'center', marginBottom: 14 }}>
              {friends.length} friend{friends.length === 1 ? '' : 's'}
            </div>
            {friendsLoading ? (
              <div className="list-empty">Loading…</div>
            ) : friends.length === 0 ? (
              <div className="daily-compare-hint">No friends yet — search to add some.</div>
            ) : (
              <ul className="people-list">
                {friends.map(f => (
                  <li key={f.uid} className="people-row">
                    <span className="people-name">{f.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
