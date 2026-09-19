// pages/friends.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
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
    } finally {
      setBusyUid(null);
    }
  }

  async function handleAccept(fromUid) {
    setBusyUid(fromUid);
    try { await acceptRequest(fromUid); } finally { setBusyUid(null); }
  }

  async function handleDecline(fromUid) {
    setBusyUid(fromUid);
    try { await declineRequest(fromUid); } finally { setBusyUid(null); }
  }

  if (!profile) return null;

  return (
    <div className="app-page">
      <TopNav />
      <main className="app-main app-main-narrow">
        <div className="hero">
          <h1>Friends</h1>
          <p>Find people by username, and manage requests.</p>
        </div>

        <section className="panel" style={{ marginBottom: 24 }}>
          <h2>Add a friend</h2>
          <div className="section-sub">Search by username.</div>

          <input
            type="text"
            className="search-input"
            placeholder="Search username…"
            value={term}
            onChange={e => onTermChange(e.target.value)}
          />

          {searching && <div className="list-empty">Searching…</div>}

          {!searching && term.trim() && results.length === 0 && (
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
        </section>

        {incomingRequests.length > 0 && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h2>Requests</h2>
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

        <section className="panel">
          <h2>Your friends</h2>
          <div className="section-sub">{friends.length} friend{friends.length === 1 ? '' : 's'}</div>
          {friendsLoading ? (
            <div className="list-empty">Loading…</div>
          ) : friends.length === 0 ? (
            <div className="panel-empty">No friends yet — search above to add some.</div>
          ) : (
            <ul className="people-list">
              {friends.map(f => (
                <li key={f.uid} className="people-row">
                  <span className="people-name">{f.username}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
