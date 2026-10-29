// components/AppShell.jsx
// The frame around every signed-in page: a sidebar on desktop, a top bar
// and a bottom tab bar on a phone — the shape of an installed app, which is
// how most people open this (the home-screen shortcut). Replaces TopNav.
//
// The settings menu (score-entry default, sign out) moved here unchanged:
// it opens from your name at the foot of the sidebar, or the gear in the
// phone's top bar.
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
import { useTournamentInvites, useWaitlist } from '../lib/useTournaments';
import { useFeedBadge } from '../lib/feedSeen';
import NavIcon from './NavIcon';

// Which section a page belongs to. Tournament pages (new, manage, a
// non-member's view) sit under Today, where your tournaments are listed.
function sectionFor(pathname, query) {
  if (pathname === '/' && query.view === 'history') return 'history';
  if (pathname.startsWith('/feed')) return 'feed';
  if (pathname.startsWith('/friends')) return 'friends';
  if (pathname.startsWith('/tournaments/search')) return 'find';
  return 'today';
}

// How scores get entered (profile.scoreEntryDefault); also on /settings.
export const SCORE_ENTRY_MODES = [
  ['paste', 'Paste into each box'],
  ['single', 'One paste box for all games'],
  ['type', 'Type it in'],
];

function SettingsMenu({ up = false, onClose }) {
  const { profile, logout, setScoreEntryDefault } = useAuth();
  const mode = profile?.scoreEntryDefault || 'paste';
  async function choose(next) {
    try { await setScoreEntryDefault(next); }
    catch (err) { window.alert(err.message || 'Could not save that preference.'); }
  }
  return (
    <div className={`dropdown${up ? ' dropdown-up' : ''}`} role="menu">
      <div className="dropdown-section-label">Score entry default</div>
      {SCORE_ENTRY_MODES.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="menuitemradio"
          aria-checked={mode === id}
          className={`dropdown-item${mode === id ? ' dropdown-item-active' : ''}`}
          onClick={() => choose(id)}
        >
          {mode === id ? '✓ ' : ''}{label}
        </button>
      ))}
      <a href="/settings" role="menuitem" className="dropdown-item">Arrange games…</a>
      <div className="dropdown-divider" />
      <button type="button" role="menuitem" className="dropdown-item dropdown-item-danger" onClick={() => { onClose(); logout(); }}>
        Sign out
      </button>
    </div>
  );
}

export default function AppShell({ children }) {
  const { pathname, query } = useRouter();
  const { profile } = useAuth();
  const { incomingRequests } = useFriends();
  const { invites } = useTournamentInvites();
  useWaitlist(); // lazily promotes any waitlisted memberships whose wait is over
  const feedBadge = useFeedBadge();
  const [menu, setMenu] = useState(null); // 'side' | 'top' | null
  const sideRef = useRef(null);
  const topRef = useRef(null);
  const current = sectionFor(pathname, query);

  useEffect(() => {
    function onDocClick(e) {
      const inside = [sideRef, topRef].some(r => r.current && r.current.contains(e.target));
      if (!inside) setMenu(null);
    }
    function onKey(e) { if (e.key === 'Escape') setMenu(null); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const NAV = [
    { id: 'today', label: 'Today', icon: 'today', href: '/', badge: invites.length },
    { id: 'feed', label: 'Feed', icon: 'feed', href: '/feed', badge: feedBadge },
    { id: 'find', label: 'Find', icon: 'find', href: '/tournaments/search' },
    { id: 'friends', label: 'Friends', icon: 'friends', href: '/friends', badge: incomingRequests.length },
    { id: 'history', label: 'History', icon: 'history', href: '/?view=history' },
  ];
  const here = id => (current === id ? 'page' : undefined);

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <a href="/" className="shell-brand">LinkedIn<br />Tournament</a>
        <nav className="shell-nav" aria-label="Sections" data-tour="nav">
          {NAV.map(n => (
            <a key={n.id} href={n.href} className="shell-nav-item" aria-current={here(n.id)}>
              <NavIcon name={n.icon} />
              <span>{n.label}</span>
              {n.badge > 0 && <span className="shell-badge">{n.badge}</span>}
            </a>
          ))}
        </nav>
        <div className="shell-me" ref={sideRef} data-tour="settings">
          <button
            type="button"
            className="shell-me-btn"
            aria-haspopup="menu"
            aria-expanded={menu === 'side'}
            aria-label="Settings menu"
            onClick={() => setMenu(m => (m === 'side' ? null : 'side'))}
          >
            <span className="shell-me-name">{profile?.username}</span>
            <NavIcon name="gear" size={18} />
          </button>
          {menu === 'side' && <SettingsMenu up onClose={() => setMenu(null)} />}
        </div>
      </aside>

      <header className="shell-topbar">
        <a href="/" className="topnav-brand">LinkedIn Tournament</a>
        <div className="topnav-right" ref={topRef} data-tour="settings">
          <button
            type="button"
            className="gear-btn"
            aria-haspopup="menu"
            aria-expanded={menu === 'top'}
            aria-label="Settings menu"
            onClick={() => setMenu(m => (m === 'top' ? null : 'top'))}
          >
            <NavIcon name="gear" />
          </button>
          {menu === 'top' && <SettingsMenu onClose={() => setMenu(null)} />}
        </div>
      </header>

      <div className="shell-content">{children}</div>

      <nav className="shell-tabbar" aria-label="Sections" data-tour="nav">
        {NAV.map(n => (
          <a key={n.id} href={n.href} className="shell-tab" aria-current={here(n.id)}>
            <span className="shell-tab-icon">
              <NavIcon name={n.icon} size={22} />
              {n.badge > 0 && <span className="shell-tab-badge">{n.badge}</span>}
            </span>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
