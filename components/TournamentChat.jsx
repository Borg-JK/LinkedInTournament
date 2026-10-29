// components/TournamentChat.jsx
// A tournament's chat, for its members. Your own messages on the right;
// everyone else's on the left with their name, once per run of messages.
// You can delete your own, and the tournament's owner can delete any.
import { useState, useRef, useLayoutEffect, Fragment } from 'react';
import { useAuth } from '../lib/useAuth';
import { useTournamentChat, MESSAGE_MAX } from '../lib/useTournamentChat';
import { Avatar, useNames } from './FeedPost';
import NavIcon from './NavIcon';
import Skeleton from './Skeleton';

const dayKey = ms => new Date(ms).toDateString();
function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
const clock = ms => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function TournamentChat({ tournament }) {
  const { user } = useAuth();
  const { messages, send, remove } = useTournamentChat(tournament.id);
  const names = useNames((messages || []).map(m => m.authorUid));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const isOwner = tournament.ownerId === user?.uid;

  // Stay at the newest message as they arrive — unless you've scrolled up
  // to read back, in which case don't yank you down.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  function onScroll() {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    stickToBottom.current = true;
    try { await send(draft); setDraft(''); }
    catch (err) { window.alert(err.message || 'Could not send that message.'); }
    finally { setBusy(false); }
  }

  async function onDelete(id) {
    if (!window.confirm('Delete this message?')) return;
    try { await remove(id); }
    catch (err) { window.alert(err.message || 'Could not delete that message.'); }
  }

  return (
    <section className="chat" aria-label={`${tournament.name} chat`}>
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages === null ? (
          <Skeleton variant="rows" count={3} />
        ) : messages.length === 0 ? (
          <p className="chat-empty">No messages yet. Say something to {tournament.name}.</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const mine = m.authorUid === user?.uid;
            const runStart = newDay || prev.authorUid !== m.authorUid;
            const name = names[m.authorUid] || '…';
            return (
              <Fragment key={m.id}>
                {newDay && <div className="chat-day" role="separator">{dayLabel(m.createdAt)}</div>}
                <div className={`chat-msg${mine ? ' chat-msg-mine' : ''}${runStart ? ' chat-msg-start' : ''}`}>
                  {!mine && (runStart ? <Avatar uid={m.authorUid} name={name} size={28} /> : <span className="chat-avatar-gap" />)}
                  <div className="chat-bubble-wrap">
                    {!mine && runStart && <span className="chat-name">{name}</span>}
                    <div className="chat-bubble">
                      <span className="chat-text">{m.text}</span>
                      <span className="chat-time">{clock(m.createdAt)}</span>
                    </div>
                  </div>
                  {(mine || isOwner) && (
                    <button type="button" className="chat-delete" aria-label="Delete message" onClick={() => onDelete(m.id)}>
                      <NavIcon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          className="chat-input"
          value={draft}
          maxLength={MESSAGE_MAX}
          onChange={e => setDraft(e.target.value)}
          placeholder={`Message ${tournament.name}…`}
          aria-label={`Message ${tournament.name}`}
          enterKeyHint="send"
          autoComplete="off"
        />
        <button type="submit" className="chat-send" disabled={busy || !draft.trim()} aria-label="Send">
          <NavIcon name="send" size={18} />
        </button>
      </form>
    </section>
  );
}
