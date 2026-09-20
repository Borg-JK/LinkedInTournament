// components/TopNav.jsx
// Full-width app header for authenticated pages: brand on the left, a
// settings-gear dropdown (games played, sign out) on the right.
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { useFriends } from '../lib/useFriends';
import { useTournamentInvites, useWaitlist } from '../lib/useTournaments';

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.91 2.91l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19.6a2.06 2.06 0 1 1-4.12 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.91-2.91l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.4a2.06 2.06 0 1 1 0-4.12h.09A1.7 1.7 0 0 0 6.05 6.8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.06 2.06 0 1 1 2.91-2.91l.06.06a1.7 1.7 0 0 0 1.87.34H10.6A1.7 1.7 0 0 0 11.63 1V.91a2.06 2.06 0 1 1 4.12 0V1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.91 2.91l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09c.24.7.83 1.23 1.56 1.42H19.6a2.06 2.06 0 1 1 0 4.12h-.09c-.73.02-1.32.55-1.56 1.03Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
        transform="translate(0.3 0.3) scale(0.86)"
      />
    </svg>
  );
}

export default function TopNav() {
  const { profile, logout } = useAuth();
  const { incomingRequests } = useFriends();
  const { invites: tournamentInvites } = useTournamentInvites();
  useWaitlist(); // lazily promotes any waitlisted memberships whose wait is over
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <a href="/" className="topnav-brand">LinkedIn Tournament</a>

        <div className="topnav-links">
          <a href="/" className="topnav-link">
            Tournaments
            {tournamentInvites.length > 0 && (
              <span className="nav-badge">{tournamentInvites.length}</span>
            )}
          </a>
          <a href="/tournaments/search" className="topnav-link">Find</a>
          <a href="/friends" className="topnav-link">
            Friends
            {incomingRequests.length > 0 && (
              <span className="nav-badge">{incomingRequests.length}</span>
            )}
          </a>
        </div>

        <div className="topnav-right" ref={ref}>
          <span className="topnav-user">{profile?.username}</span>
          <button
            type="button"
            className="gear-btn"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Settings menu"
            onClick={() => setOpen(o => !o)}
          >
            <GearIcon />
          </button>

          {open && (
            <div className="dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="dropdown-item dropdown-item-danger"
                onClick={logout}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
