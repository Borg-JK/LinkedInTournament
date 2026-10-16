// pages/feed.jsx
// The friends feed: every time you and your friends posted for today's and
// yesterday's puzzles, newest first, with reactions and comments.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
import { useFeed } from '../lib/useFeed';
import { markFeedSeen } from '../lib/feedSeen';
import AppShell from '../components/AppShell';
import FeedPost from '../components/FeedPost';
import Skeleton from '../components/Skeleton';

export default function FeedPage() {
  const { user, profile, profileChecked, loading } = useAuth();
  const { friends } = useFriends();
  const { posts, ready } = useFeed();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  // Opening the feed clears its badge.
  useEffect(() => { if (ready) markFeedSeen(); }, [ready]);

  if (!user || !profile) return null;

  return (
    <AppShell>
      <main className="app-main app-main-feed">
        <div className="hero">
          <div className="hero-eyebrow">Today and yesterday</div>
          <h1>Feed</h1>
          <p>Every time you and your friends posted for today's and yesterday's puzzles. React with one emoji, or reply.</p>
        </div>

        {!ready ? (
          <div className="feed-list"><section className="panel"><Skeleton variant="rows" count={4} /></section></div>
        ) : posts.length === 0 ? (
          <div className="panel-empty feed-empty">
            {friends.length === 0
              ? <>Add some friends and their times will show up here. <a href="/friends">Find friends</a></>
              : <>Nobody's posted a time for today's or yesterday's puzzle yet — yours will be the first.</>}
          </div>
        ) : (
          <div className="feed-list">
            {posts.map(post => <FeedPost key={post.id} post={post} />)}
          </div>
        )}
      </main>
    </AppShell>
  );
}
