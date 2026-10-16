// components/FeedPost.jsx
// One upload in the friends feed: who, which puzzle, their time against
// yours, then reactions (one per person) and comments.
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/useAuth';
import { useReactions, useComments, REACTIONS, COMMENT_MAX } from '../lib/useFeed';
import { resolveUser } from '../lib/users';
import { colorForUid } from '../lib/colors';
import { firstGrapheme } from '../lib/initial';
import { themeFor } from '../lib/theme';
import { formatSeconds, timeAgo } from '../lib/time';
import NavIcon from './NavIcon';

// Names for whoever reacted or commented. They aren't necessarily your
// friends (a friend's friend can comment on their post), so they come from
// the shared uid -> username cache rather than your friends list.
function useNames(uids) {
  const [names, setNames] = useState({});
  const key = [...new Set(uids)].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    Promise.all(key ? key.split(',').map(resolveUser) : []).then(list => {
      if (!cancelled) setNames(Object.fromEntries(list.map(u => [u.uid, u.username])));
    });
    return () => { cancelled = true; };
  }, [key]);
  return names;
}

function Avatar({ uid, name, size = 38 }) {
  return (
    <span className="feed-avatar" style={{ width: size, height: size, background: colorForUid(uid), fontSize: size * 0.42 }} aria-hidden="true">
      {firstGrapheme(name).toUpperCase()}
    </span>
  );
}

function vsLabel(delta) {
  if (delta == null) return null;
  if (delta === 0) return 'Same time as you';
  return delta < 0 ? `${formatSeconds(-delta)} faster than you` : `${formatSeconds(delta)} slower than you`;
}

export default function FeedPost({ post }) {
  const { user } = useAuth();
  const { reactions, mine, react } = useReactions(post);
  const { comments, addComment, deleteComment } = useComments(post);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // The reply box opens on demand: forty posts each carrying an empty input
  // was a wall of form fields.
  const [replying, setReplying] = useState(false);
  const theme = themeFor(post.gameId);

  const counts = useMemo(() => {
    const c = Object.fromEntries(REACTIONS.map(e => [e, []]));
    for (const r of reactions || []) if (c[r.emoji]) c[r.emoji].push(r.uid);
    return c;
  }, [reactions]);

  const names = useNames([...(reactions || []).map(r => r.uid), ...(comments || []).map(c => c.authorUid)]);
  const nameFor = uid => (uid === user?.uid ? 'You' : names[uid] || '…');

  async function onReact(emoji) {
    try { await react(emoji); }
    catch (err) { window.alert(err.message || 'Could not save that reaction.'); }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try { await addComment(draft); setDraft(''); setReplying(false); }
    catch (err) { window.alert(err.message || 'Could not post that comment.'); }
    finally { setBusy(false); }
  }

  async function onDelete(id) {
    if (!window.confirm('Delete this comment?')) return;
    try { await deleteComment(id); }
    catch (err) { window.alert(err.message || 'Could not delete that comment.'); }
  }

  const faster = post.vsMine != null && post.vsMine < 0;

  return (
    // The card wears the game's own box colours — the same ones as its score
    // box on the Today page — so Queens reads as Queens before a word does.
    <article
      className={`feed-post${theme.onDark ? ' feed-post-dark' : ''}`}
      style={{ '--game': theme.accent, '--game-ink': theme.onDark ? theme.accent2 : theme.accent, '--game-bg': theme.bg, '--game-bg-soft': theme.bgSoft }}
    >
      <header className="feed-post-head">
        <Avatar uid={post.uid} name={post.name} />
        <div className="feed-post-who">
          <span className="feed-post-title">
            <span className="feed-post-name">{post.isMine ? 'You' : post.name}</span>
            <span className="feed-post-game">{post.gameLabel}</span>
          </span>
          <span className="feed-post-meta">#{post.puzzleNum} · {timeAgo(post.submittedAt)}</span>
        </div>
        <span className="feed-post-time">{formatSeconds(post.timeSeconds)}</span>
      </header>

      {post.vsMine != null && (
        <p className={`feed-post-vs${faster ? ' feed-post-vs-faster' : ''}`}>{vsLabel(post.vsMine)}</p>
      )}

      {/* One reaction each: picking another replaces yours, picking yours
          again takes it back. */}
      <div className="feed-reactions" role="group" aria-label="Reactions">
        {REACTIONS.map(emoji => {
          const who = counts[emoji];
          const isMine = mine === emoji;
          return (
            <button
              key={emoji}
              type="button"
              className={`feed-react${isMine ? ' feed-react-mine' : ''}${who.length ? '' : ' feed-react-empty'}`}
              aria-pressed={isMine}
              aria-label={`${emoji}${who.length ? `, ${who.length}` : ''}${isMine ? ', your reaction' : ''}`}
              title={who.length ? who.map(nameFor).join(', ') : undefined}
              onClick={() => onReact(emoji)}
              disabled={!reactions}
            >
              <span aria-hidden="true">{emoji}</span>
              {who.length > 0 && <span className="feed-react-n">{who.length}</span>}
            </button>
          );
        })}
      </div>

      {comments && comments.length > 0 && (
        <ul className="feed-comments">
          {comments.map(c => (
            <li key={c.id} className="feed-comment">
              <span className="feed-comment-body"><strong>{nameFor(c.authorUid)}</strong> {c.text}</span>
              <span className="feed-comment-meta">{timeAgo(c.createdAt)}</span>
              {(c.authorUid === user?.uid || post.isMine) && (
                <button type="button" className="feed-comment-delete" aria-label="Delete comment" onClick={() => onDelete(c.id)}>
                  <NavIcon name="trash" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {replying ? (
        <form className="feed-reply" onSubmit={onSubmit}>
          <input
            className="feed-reply-input"
            value={draft}
            maxLength={COMMENT_MAX}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setReplying(false); setDraft(''); } }}
            placeholder={post.isMine ? 'Add a comment…' : `Reply to ${post.name}…`}
            aria-label={post.isMine ? 'Add a comment' : `Reply to ${post.name}`}
            enterKeyHint="send"
            autoFocus
          />
          <button type="submit" className="feed-reply-send" disabled={busy || !draft.trim()}>Send</button>
        </form>
      ) : (
        <button type="button" className="feed-reply-open" onClick={() => setReplying(true)}>
          <NavIcon name="comment" size={16} />
          {post.isMine ? 'Comment' : 'Reply'}
        </button>
      )}
    </article>
  );
}
