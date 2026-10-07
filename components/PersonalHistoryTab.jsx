// components/PersonalHistoryTab.jsx
// Your own game history and trends, independent of any tournament — reads
// only your own scores/{uid}/... data.
//
// One month and one game drive the whole tab, picked once at the top,
// rather than every month being stacked as its own section: the chart, the
// entry list and the day picker below all answer questions about that one
// month.
import { useState, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAuth } from '../lib/useAuth';
import { usePlayerGameScores, submitScore, deleteScore } from '../lib/useScores';
import { GAMES, puzzleNumberFor, todayIso, activePuzzleDayIso } from '../lib/games';
import { formatSeconds } from '../lib/time';
import { themeFor } from '../lib/theme';
import { buildMonthlyHistory, monthDays, buildDayPicker, dailyTimesForGame } from '../lib/personalHistory';
import { monthsBetween, monthLabel } from '../lib/months';
import InlineTimeEditor from './InlineTimeEditor';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

// "Wed 7 Oct · 3/6" — the counts are the whole point of the day dropdown,
// so they ride in the option text rather than appearing only once picked.
function dayOptionLabel(day, liveDay) {
  const [y, m, d] = day.date.split('-').map(Number);
  const when = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const suffix = day.date === liveDay ? ' (today)' : '';
  const filled = day.filled === 0 ? 'nothing yet' : `${day.filled}/${day.total}`;
  return `${when}${suffix} · ${filled}`;
}

export default function PersonalHistoryTab() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [editingKey, setEditingKey] = useState(null); // `${gameId}|${date}`
  // The live puzzle day, which before 09:00 is still yesterday's date.
  const [liveDay] = useState(() => activePuzzleDayIso());
  const [game, setGame] = useState(GAMES[0].id);
  const [month, setMonth] = useState(() => activePuzzleDayIso().slice(0, 7));
  const [pickedDay, setPickedDay] = useState(() => activePuzzleDayIso());

  async function handleSaveEdit(gameId, date, seconds) {
    await submitScore(uid, gameId, date, seconds);
    setEditingKey(null);
  }

  async function handleDeleteEntry(gameId, date) {
    const label = GAMES.find(g => g.id === gameId)?.label || gameId;
    if (!window.confirm(`Delete your ${label} time for ${date}?`)) return;
    await deleteScore(uid, gameId, date);
    if (editingKey === `${gameId}|${date}`) setEditingKey(null);
  }

  const pairs = useMemo(() => (uid ? GAMES.map(g => ({ uid, gameId: g.id })) : []), [uid]);
  const byUidGame = usePlayerGameScores(pairs);
  const ready = GAMES.every(g => byUidGame[uid]?.[g.id] !== undefined);

  const entriesByGame = {};
  if (ready) GAMES.forEach(g => { entriesByGame[g.id] = byUidGame[uid]?.[g.id] || []; });

  const monthly = useMemo(() => (ready ? buildMonthlyHistory(entriesByGame, todayIso()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, byUidGame]);

  if (!ready) return <div className="list-empty">Loading…</div>;

  // Every month from the first score ever logged through the current one, so
  // a month you sat out is still selectable rather than missing.
  const allDates = GAMES.flatMap(g => entriesByGame[g.id].map(e => e.date));
  const firstEver = allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : liveDay;
  const months = monthsBetween(firstEver, liveDay); // newest first
  const activeMonth = months.includes(month) ? month : months[0];

  // Days of the selected month, stopped at today for the current one.
  const dates = monthDays(activeMonth, liveDay);
  const dayRows = buildDayPicker(entriesByGame, dates);
  const dayRowsNewestFirst = [...dayRows].reverse();
  // Switching month leaves the previously picked day outside it — fall back
  // to the most recent day of whatever month is now showing.
  const activeDay = dates.includes(pickedDay) ? pickedDay : dates[dates.length - 1];
  const activeDayRow = dayRows.find(d => d.date === activeDay);

  const theme = themeFor(game);
  const gameLabel = GAMES.find(g => g.id === game)?.label || game;
  const stats = monthly.find(m => m.month === activeMonth)?.games[game] || null;

  const series = dailyTimesForGame(entriesByGame[game] || [], dates);
  const playedCount = series.filter(v => v != null).length;

  const gameTabs = (
    <div className="history-game-tabs">
      {GAMES.map(g => {
        const gTheme = themeFor(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={`history-game-tab${game === g.id ? ' active' : ''}`}
            style={{ '--hg-accent': gTheme.accent, '--hg-text': gTheme.onDark ? '#fff' : '#1a1508' }}
            onClick={() => setGame(g.id)}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="history-controls">
        <label className="history-control">
          <span className="history-control-label">Month</span>
          <select
            className="daily-compare-select"
            style={{ width: 'auto', marginBottom: 0 }}
            value={activeMonth}
            onChange={e => setMonth(e.target.value)}
          >
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        {gameTabs}
      </div>

      <section className="panel panel-accent" style={{ marginBottom: 24 }}>
        <h2>{gameLabel} · {monthLabel(activeMonth)}</h2>
        <div className="section-sub">
          Your time every day this month — a gap is a day you didn&apos;t play.
        </div>
        {playedCount === 0 ? (
          <div className="panel-empty">No {gameLabel} times logged in {monthLabel(activeMonth)}.</div>
        ) : (
          <div style={{ height: 260 }}>
            <Line
              data={{
                labels: dates.map(d => Number(d.slice(8, 10))),
                datasets: [{
                  label: gameLabel,
                  data: series,
                  borderColor: theme.accent,
                  backgroundColor: theme.accent,
                  tension: 0.25,
                  pointRadius: 3.5,
                  borderWidth: 2.5,
                  spanGaps: false,
                }],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      title: items => `${monthLabel(activeMonth)} ${items[0].label}`,
                      label: c => ` ${formatSeconds(c.parsed.y)}`,
                    },
                  },
                },
                scales: {
                  x: { title: { display: true, text: 'Day of month' }, ticks: { maxTicksLimit: 16 } },
                  y: { ticks: { callback: v => formatSeconds(v) } },
                },
              }}
            />
          </div>
        )}

        {stats && (
          <div className="section-sub" style={{ margin: '14px 0 0' }}>
            Avg {formatSeconds(stats.avgSeconds)} · Best {formatSeconds(stats.bestSeconds)} ·
            {' '}{stats.daysPlayed}/{stats.activeDays} days played
            {stats.daysMissed > 0 ? ` · ${stats.daysMissed} missed` : ''}
          </div>
        )}
      </section>

      <section className="panel panel-accent day-fill-panel">
        <div className="panel-head-row" style={{ flexWrap: 'wrap', rowGap: 10 }}>
          <h2>Fill in a day</h2>
          <select
            className="daily-compare-select"
            style={{ width: 'auto', marginBottom: 0 }}
            value={activeDay || ''}
            onChange={e => setPickedDay(e.target.value)}
          >
            {dayRowsNewestFirst.map(d => (
              <option key={d.date} value={d.date}>{dayOptionLabel(d, liveDay)}</option>
            ))}
          </select>
        </div>
        <div className="section-sub">
          Pick any day of {monthLabel(activeMonth)} — the dropdown says how many games you logged on
          each, so a day you forgot is easy to spot.
          {activeDayRow ? ` ${activeDayRow.filled} of ${activeDayRow.total} filled in on this one.` : ''}
        </div>

        <div className="day-fill-grid">
          {GAMES.map(g => {
            const entry = (entriesByGame[g.id] || []).find(e => e.date === activeDay) || null;
            const key = `${g.id}|${activeDay}`;
            const isEditing = editingKey === key;
            const gTheme = themeFor(g.id);
            return (
              <div
                key={g.id}
                className={`day-fill-card${entry ? '' : ' day-fill-card-missing'}`}
                style={{ '--df-accent': gTheme.accent }}
              >
                <div className="day-fill-card-head">
                  <span className="day-fill-card-game">{g.label}</span>
                  <span className="day-fill-card-num">#{puzzleNumberFor(g.id, activeDay)}</span>
                </div>

                {isEditing ? (
                  <InlineTimeEditor
                    initialSeconds={entry?.timeSeconds}
                    onSave={seconds => handleSaveEdit(g.id, activeDay, seconds)}
                    onCancel={() => setEditingKey(null)}
                    saveLabel={entry ? 'Save' : 'Add'}
                    autoFocus
                  />
                ) : entry ? (
                  <>
                    <div className="day-fill-card-time">{formatSeconds(entry.timeSeconds)}</div>
                    <div className="day-fill-card-actions">
                      <button className="chip-link" onClick={() => setEditingKey(key)}>Edit</button>
                      <button className="chip-link chip-link-danger" onClick={() => handleDeleteEntry(g.id, activeDay)}>Delete</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="day-fill-card-empty">Not filled in</div>
                    <button type="button" className="day-fill-card-add" onClick={() => setEditingKey(key)}>
                      Add a time
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </>
  );
}
