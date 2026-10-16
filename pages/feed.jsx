// pages/feed.jsx
// The feed: every time you and your friends posted for today's and
// yesterday's puzzles, newest first, with reactions and comments — or the
// same for one of your tournaments' members, switched at the top.
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
import { useFeed, useTournamentFeed } from '../lib/useFeed';
import { useTournaments, useTournamentPrefs } from '../lib/useTournaments';
import { markFeedSeen } from '../lib/feedSeen';
import AppShell from '../components/AppShell';
import FeedPost from '../components/FeedPost';
import Skeleton from '../components/Skeleton';

function FeedList({ posts, ready, empty }) {
  if (!ready) return <div className="feed-list"><section className="panel"><Skeleton variant="rows" count={4} /></section></div>;
  if (posts.length === 0) return <div className="panel-empty feed-empty">{empty}</div>;
  return (
    <div className="feed-list">
      {posts.map(post => <FeedPost key={post.id} post={post} />)}
    </div>
  );
}

function FriendsFeed() {
  const { friends } = useFriends();
  const { posts, ready } = useFeed();

  // Opening the friends feed clears its badge.
  useEffect(() => { if (ready) markFeedSeen(); }, [ready]);

  return (
    <FeedList
      posts={posts}
      ready={ready}
      empty={friends.length === 0
        ? <>Add some friends and their times will show up here. <a href="/friends">Find friends</a></>
        : <>Nobody's posted a time for today's or yesterday's puzzle yet — yours will be the first.</>}
    />
  );
}

function TournamentFeed({ tournament }) {
  const { posts, ready, reveal } = useTournamentFeed(tournament);
  return (
    <>
      {reveal && (
        <p className="feed-reveal-note">
          {tournament.name} reveals times on a schedule, so only days up to its last reveal show here
          {reveal.nextRevealDate ? ` — next reveal ${reveal.nextRevealDate}` : ''}.
        </p>
      )}
      <FeedList
        posts={posts}
        ready={ready}
        empty={<>No times to show from {tournament.name} for today's or yesterday's puzzle yet.</>}
      />
    </>
  );
}

export default function FeedPage() {
  const { user, profile, profileChecked, loading } = useAuth();
  const { tournaments, loading: tLoading } = useTournaments();
  const { prefs: tournamentPrefs } = useTournamentPrefs();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  // Same order as the home page: pinned first, then newest.
  const ordered = useMemo(
    () => [...tournaments].sort((a, b) => (tournamentPrefs[b.id]?.pinned ? 1 : 0) - (tournamentPrefs[a.id]?.pinned ? 1 : 0)),
    [tournaments, tournamentPrefs],
  );

  const view = router.query.view === 'tournaments' ? 'tournaments' : 'friends';
  const selected = ordered.find(t => t.id === router.query.t) || ordered[0] || null;
  const go = query => router.replace({ pathname: '/feed', query }, undefined, { shallow: true, scroll: false });

  if (!user || !profile) return null;

  return (
    <AppShell>
      <main className="app-main app-main-feed">
        <div className="hero">
          <div className="hero-eyebrow">Today and yesterday</div>
          <h1>Feed</h1>
          <p>
            {view === 'friends'
              ? "Every time you and your friends posted for today's and yesterday's puzzles. React with one emoji, or reply."
              : "Every time someone in your tournament posted for today's and yesterday's puzzles. React with one emoji, or reply."}
          </p>
        </div>

        <div className="feed-switch" role="tablist" aria-label="Whose posts">
          {[['friends', 'Friends'], ['tournaments', 'Tournaments']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className="feed-switch-btn"
              onClick={() => go(id === 'friends' ? {} : { view: 'tournaments', ...(selected ? { t: selected.id } : {}) })}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'friends' ? (
          <FriendsFeed />
        ) : tLoading ? (
          <FeedList posts={[]} ready={false} />
        ) : !selected ? (
          <div className="panel-empty feed-empty">
            You're not in a tournament yet. <a href="/tournaments/search">Find one</a> or <a href="/tournaments/new">start one</a>.
          </div>
        ) : (
          <>
            {ordered.length > 1 && (
              <div className="feed-tournaments" role="tablist" aria-label="Tournament">
                {ordered.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === selected.id}
                    className="feed-tournament-chip"
                    onClick={() => go({ view: 'tournaments', t: t.id })}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <TournamentFeed key={selected.id} tournament={selected} />
          </>
        )}
      </main>
    </AppShell>
  );
}
