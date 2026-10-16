// lib/feedSeen.js
// When you last opened the feed, for the nav badge ("4 new"). Per device on
// purpose — it's a convenience, not data worth syncing — and every storage
// access is guarded, since private windows and blocked site data throw.
import { useState, useEffect, useMemo } from 'react';
import { useFeed } from './useFeed';

const KEY = 'lt.feedSeenAt';
const EVENT = 'lt:feed-seen';

function readSeenAt() {
  try { return Number(window.localStorage.getItem(KEY)) || 0; } catch { return 0; }
}

export function markFeedSeen() {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

// Friends' posts newer than your last visit. Your own never count.
export function useFeedBadge() {
  const { posts } = useFeed();
  const [seenAt, setSeenAt] = useState(0);
  useEffect(() => {
    setSeenAt(readSeenAt());
    const update = () => setSeenAt(readSeenAt());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return useMemo(() => posts.filter(p => !p.isMine && p.submittedAt > seenAt).length, [posts, seenAt]);
}
