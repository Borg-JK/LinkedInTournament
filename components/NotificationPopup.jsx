// components/NotificationPopup.jsx
// The pop-up on the dashboard: who reacted to or commented on your times
// since you last looked. "View in feed" takes you there; either that or
// closing it marks them seen (see lib/useNotifications.js).
import { useNotifications } from '../lib/useNotifications';
import { formatSeconds, timeAgo } from '../lib/time';
import { Avatar, useNames } from './FeedPost';
import NavIcon from './NavIcon';

const SHOWN = 4;

export default function NotificationPopup() {
  const { unseen, markSeen } = useNotifications();
  const names = useNames(unseen.map(n => n.uid));
  if (unseen.length === 0) return null;

  const shown = unseen.slice(0, SHOWN);
  const more = unseen.length - shown.length;
  const nameOf = uid => names[uid] || '…';

  return (
    <aside className="notif-popup" role="status" aria-label="New reactions and comments">
      <div className="notif-head">
        <span className="notif-title">
          {unseen.length === 1 ? 'New on your times' : `${unseen.length} new on your times`}
        </span>
        <button type="button" className="notif-close" aria-label="Dismiss" onClick={markSeen}>
          <NavIcon name="close" size={16} />
        </button>
      </div>
      <ul className="notif-list">
        {shown.map(n => (
          <li key={n.id} className="notif-item">
            <Avatar uid={n.uid} name={nameOf(n.uid)} size={30} />
            <div className="notif-body">
              <p className="notif-text">
                <strong>{nameOf(n.uid)}</strong>{' '}
                {n.kind === 'reaction'
                  ? <>reacted <span className="notif-emoji">{n.emoji}</span> to your {n.post.gameLabel} {formatSeconds(n.post.timeSeconds)}</>
                  : <>commented on your {n.post.gameLabel} {formatSeconds(n.post.timeSeconds)}: <q>{n.text}</q></>}
              </p>
              <span className="notif-when">{timeAgo(n.at)}</span>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="notif-more">and {more} more</p>}
      <a
        href="/feed"
        className="notif-cta"
        onClick={async e => {
          // Save "seen" before leaving: a write still in flight is dropped
          // when the page unloads.
          e.preventDefault();
          await markSeen();
          window.location.assign('/feed');
        }}
      >
        View in feed
      </a>
    </aside>
  );
}
