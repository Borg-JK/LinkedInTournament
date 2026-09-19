// pages/index.jsx
// Phase 1 shell only — score boxes, tournament list with placements, and the
// personal history tab are built out in Phases 5 and 6.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';

export default function Home() {
  const { user, profile, profileChecked, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) { router.replace('/signin'); return; }
    if (!profile) { router.replace('/onboarding'); return; }
  }, [loading, profileChecked, user, profile, router]);

  if (loading || !profileChecked || !user || !profile) {
    return (
      <div className="page">
        <div className="subtitle" style={{ marginTop: 64 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="signed-in-bar">
        <span>Signed in as <strong>{profile.username}</strong></span>
        <button className="link-btn" onClick={logout}>Sign out</button>
      </div>

      <div className="card">
        <div className="brand">LinkedIn Tournament</div>
        <div className="subtitle">
          Games you play: {(profile.gamesPlayed || []).join(', ') || 'none yet'}
        </div>
        <a className="link-btn" href="/settings">Edit games played</a>
      </div>
    </div>
  );
}
