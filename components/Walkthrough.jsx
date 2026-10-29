// components/Walkthrough.jsx
// The first-visit tour of Today for a brand-new account (profile.showTour,
// set at onboarding): one step per part of the page, each highlighting it
// with a short note — above all, how to log a result. Skipping or finishing
// clears the flag; Settings can bring it back.
//
// Steps point at elements by their data-tour attribute. The app shell has
// two of some (sidebar and phone tab bar), so the visible one is used; a
// step whose element isn't on the page is left out.
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/useAuth';

function stepsFor(mode, name) {
  const howToLog = {
    paste: 'Play a game on LinkedIn, then tap Share → Copy. Paste it into that game’s box here and confirm — the time and puzzle number are read for you. Rather type it? Each box has “Type it in”.',
    single: 'Play a game on LinkedIn, then tap Share → Copy. Paste it into the box at the top — one result, or several at once — and it works out which game each is. Check, then Save.',
    type: 'Play a game on LinkedIn, then type your time into that game’s box. (You can switch to pasting LinkedIn’s share text in Settings.)',
  }[mode] || '';
  return [
    { id: 'welcome', title: `Welcome, ${name}`, body: 'A quick look around before your first puzzle — about thirty seconds.' },
    { id: 'scores', target: 'scores', title: 'Log your times here', body: howToLog },
    { id: 'days', target: 'days', title: 'Today, or yesterday', body: 'New puzzles go up at 9:00. Missed one? Switch to Yesterday and fill it in — it still counts.' },
    { id: 'compare', target: 'compare', title: 'Today vs. friends', body: 'Where your time ranks among your friends, game by game.' },
    { id: 'tournaments', target: 'tournaments', title: 'Tournaments', body: 'Compete over a month. Start one with “+ New”, or Find one to join — invites show up at the top of this page.' },
    { id: 'nav', target: 'nav', title: 'Feed, friends and history', body: 'The Feed shows your friends’ times: react with an emoji or reply. Add people by username in Friends. History is your own record.' },
    { id: 'settings', target: 'settings', title: 'Make it yours', body: 'Choose one paste box for every game, put your games in your own order, or sign out — it’s all in here.' },
  ];
}

const visibleTarget = id => [...document.querySelectorAll(`[data-tour="${id}"]`)].find(el => el.getClientRects().length > 0) || null;

export default function Walkthrough() {
  const { profile, setShowTour } = useAuth();
  const [steps, setSteps] = useState(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);

  // Settle which steps apply once the page has rendered its parts.
  useEffect(() => {
    const t = setTimeout(() => {
      const all = stepsFor(profile?.scoreEntryDefault || 'paste', profile?.username || 'there');
      setSteps(all.filter(s => !s.target || visibleTarget(s.target)));
    }, 400);
    return () => clearTimeout(t);
  }, [profile?.scoreEntryDefault, profile?.username]);

  const step = steps?.[i];

  // Bring the step's element into view and track where it is.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = step.target ? visibleTarget(step.target) : null;
    if (!el) { setRect(null); return undefined; }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => { cardRef.current?.focus(); }, [i, steps]);

  const finish = useCallback(() => {
    setSteps([]);
    setShowTour(false).catch(err => console.error("Couldn't save that the tour was seen:", err));
  }, [setShowTour]);

  useEffect(() => {
    if (!steps?.length) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [steps, finish]);

  if (!step) return null;

  const last = i === steps.length - 1;
  const PAD = 8;
  const hole = rect && {
    top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  };
  // The note goes below the highlighted part if there's room, else above
  // it; if neither fits (a part taller than the screen, like the score grid
  // on a phone) it pins to the bottom of the screen, over the part. With
  // nothing highlighted it sits in the middle.
  let cardStyle = {};
  let pinned = false;
  if (hole) {
    const vh = window.innerHeight;
    const NOTE = 230; // roughly the note's height
    const below = hole.top + hole.height + 12;
    if (below + NOTE < vh) cardStyle = { top: below };
    else if (hole.top - 12 - NOTE > 0) cardStyle = { top: hole.top - 12, transform: 'translateY(-100%)' };
    else pinned = true;
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {hole
        ? <div className="tour-hole" style={hole} aria-hidden="true" />
        : <div className="tour-dim" aria-hidden="true" />}
      <div className={`tour-card${hole ? '' : ' tour-card-center'}${pinned ? ' tour-card-pinned' : ''}`} style={cardStyle} ref={cardRef} tabIndex={-1} key={step.id}>
        <span className="tour-count">{i + 1} of {steps.length}</span>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          {!last && <button type="button" className="tour-skip" onClick={finish}>Skip tour</button>}
          <span className="tour-spacer" />
          {i > 0 && <button type="button" className="btn-sm btn-sm-ghost" onClick={() => setI(n => n - 1)}>Back</button>}
          <button type="button" className="btn-sm" onClick={() => (last ? finish() : setI(n => n + 1))}>
            {last ? 'Done' : i === 0 ? 'Show me' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
