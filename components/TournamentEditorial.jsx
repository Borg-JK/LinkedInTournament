// components/TournamentEditorial.jsx
// The full-page tournament experience, replacing the app shell entirely
// while a member is looking at a tournament — ported from the original
// dashboard's per-tournament page (header, section tabs, per-game theming).
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { usePlayerGameScores } from '../lib/useScores';
import { useTournamentMemberJoinDates } from '../lib/useTournaments';
import { resolveUser } from '../lib/users';
import { todayIso } from '../lib/games';
import { themeFor } from '../lib/theme';
import { effectivePeriodEnd, revealStatus } from '../lib/reveal';
import StandingsTab from './StandingsTab';
import HallOfFameTab from './HallOfFameTab';
import BattleTab from './BattleTab';
import ScoringTab from './ScoringTab';
import TournamentChat from './TournamentChat';
import Skeleton from './Skeleton';

const SECTIONS = [
  { id: 'standings', num: '01', label: 'Standings' },
  { id: 'hall',      num: '02', label: 'Hall of Fame' },
  { id: 'battle',    num: '03', label: 'Battle' },
  { id: 'scoring',   num: '04', label: 'Scoring' },
  { id: 'chat',      num: '05', label: 'Chat' },
];

function useMemberNames(memberUids) {
  const [names, setNames] = useState({});
  const key = (memberUids || []).slice().sort().join(',');
  useEffect(() => {
    if (!memberUids || memberUids.length === 0) return;
    let cancelled = false;
    (async () => {
      const withNames = await Promise.all(memberUids.map(async uid => [uid, (await resolveUser(uid)).username]));
      if (!cancelled) setNames(Object.fromEntries(withNames));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

export default function TournamentEditorial({ tournament, myUid, manageHref }) {
  const router = useRouter();
  const [section, setSection] = useState('standings');
  // On a phone the tabs scroll sideways; keep the open one in view (a link
  // straight to Chat would otherwise open with its tab off-screen).
  useEffect(() => {
    document.querySelector('.t-section-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [section]);

  // A link can open a section directly: /tournaments/{id}?section=chat.
  useEffect(() => {
    if (router.isReady && SECTIONS.some(s => s.id === router.query.section)) setSection(router.query.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  const [themeGame, setThemeGame] = useState(tournament.games.length > 1 ? 'overall' : tournament.games[0]);
  const names = useMemberNames(tournament.members);

  // Only Standings has a per-game selector to theme the page against — the
  // other sections always use the dark "overall" look.
  useEffect(() => {
    if (section !== 'standings') setThemeGame('overall');
  }, [section]);

  // Mirror the active theme onto <html> while this page is mounted. The
  // palettes are declared there (see globals.css), so this is what lets the
  // document canvas take the game's color too — without it, overscrolling
  // the page rubber-bands into the app's own background and the theme
  // visibly breaks at the edges. (The browser's theme-color stays the
  // navigation's LinkedIn blue, which is what sits at the top of the screen.)
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', themeGame);
    return () => html.removeAttribute('data-theme');
  }, [themeGame]);

  const pairs = tournament.members.flatMap(uid => tournament.games.map(gameId => ({ uid, gameId })));
  const byUidGame = usePlayerGameScores(pairs);
  const dataReady = tournament.members.every(uid => tournament.games.every(g => byUidGame[uid]?.[g] !== undefined));
  const joinedAtByUid = useTournamentMemberJoinDates(tournament.id);

  const theme = themeFor(themeGame);
  const today = todayIso();
  const periodEnd = effectivePeriodEnd(tournament, today);
  const status = revealStatus(tournament, today);

  const tabProps = {
    tournament, names, byUidGame, dataReady, myUid, periodEnd, joinedAtByUid,
    onGameThemeChange: setThemeGame,
  };

  return (
    <div className="editorial" data-theme={themeGame}>
      <div className="editorial-inner">
        <div className="tournament-header">
          <div>
            <div className="tournament-eyebrow">Tournament</div>
            <h1 className="tournament-title">{tournament.name}</h1>
            <p className="tournament-sub">
              Standings for qualifying players who showed up at least {tournament.eligibilityThresholdPct}% of the time.
            </p>
          </div>
          <a href="/" className="editorial-back-btn">← Back to games</a>
        </div>

        <div className="tournament-section-tabs">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              className={`t-section-tab${section === s.id ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="t-section-tab-num">{s.num}</span>
              <span className="t-section-tab-label">{s.label}</span>
            </button>
          ))}
          {manageHref && (
            <a href={manageHref} className="t-section-tab t-section-tab-manage">
              <span className="t-section-tab-label">Manage ⚙</span>
            </a>
          )}
        </div>

        {section === 'standings' && status && (
          <div className="reveal-banner">
            {status.asOf
              ? `This month's standings are as of ${status.asOf}${status.nextRevealDate ? ` — next reveal ${status.nextRevealDate}` : ' — frozen until next month'}.`
              : `Nothing revealed yet this month — next reveal ${status.nextRevealDate}.`}
          </div>
        )}

        {section === 'chat' ? (
          // The chat doesn't need the scores, so it doesn't wait for them.
          <TournamentChat tournament={tournament} />
        ) : !dataReady ? (
          <div className="leaderboard-card"><Skeleton variant="rows" count={5} /></div>
        ) : (
          <>
            {section === 'standings' && <StandingsTab {...tabProps} />}
            {section === 'hall' && <HallOfFameTab {...tabProps} />}
            {section === 'battle' && <BattleTab {...tabProps} />}
            {section === 'scoring' && <ScoringTab {...tabProps} />}
          </>
        )}
      </div>
    </div>
  );
}
