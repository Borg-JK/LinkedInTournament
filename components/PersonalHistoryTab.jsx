// components/PersonalHistoryTab.jsx
// Your own game history and trends, independent of any tournament — reads
// only your own scores/{uid}/... data.
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
import { buildMonthlyHistory, averageByMonthForGame, buildDayPicker } from '../lib/personalHistory';
import { monthLabel } from '../lib/months';
import InlineTimeEditor from './InlineTimeEditor';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

// "Mon 5 Oct · 4/6" — the counts are the whole point of the dropdown, so
// they're in the option text itself rather than hidden until you pick one.
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
  const [chartGame, setChartGame] = useState(GAMES[0].id);
  const [historyGame, setHistoryGame] = useState(GAMES[0].id);
  const [editingKey, setEditingKey] = useState(null); // `${gameId}|${date}`
  // Which past day the "fill in a day" picker is showing. Defaults to the
  // live puzzle day, which before 09:00 is still yesterday's date.
  const [liveDay] = useState(() => activePuzzleDayIso());
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

  const trend = useMemo(() => (ready ? averageByMonthForGame(entriesByGame[chartGame] || []) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, byUidGame, chartGame]);

  const theme = themeFor(chartGame);

  if (!ready) return <div className="list-empty">Loading…</div>;

  // 120 days back is far enough to cover "I forgot for a while" without
  // turning the dropdown into something you have to scroll forever.
  const dayOptions = buildDayPicker(entriesByGame, liveDay, 120);
  const pickedCounts = dayOptions.find(d => d.date === pickedDay);

  const dayFillPanel = (
    <section className="panel panel-accent" style={{ marginBottom: 24 }}>
      <div className="panel-head-row" style={{ flexWrap: 'wrap', rowGap: 10 }}>
        <h2>Fill in a day</h2>
        <select
          className="daily-compare-select"
          style={{ width: 'auto', marginBottom: 0 }}
          value={pickedDay}
          onChange={e => setPickedDay(e.target.value)}
        >
          {dayOptions.map(d => (
            <option key={d.date} value={d.date}>
              {dayOptionLabel(d, liveDay)}
            </option>
          ))}
        </select>
      </div>
      <div className="section-sub">
        Any day you like — the dropdown says how many games you logged on each, so a day you
        forgot is easy to spot. {pickedCounts ? `${pickedCounts.filled} of ${pickedCounts.total} filled in on this one.` : ''}
      </div>

      <ul className="day-fill-list">
        {GAMES.map(g => {
          const entry = (entriesByGame[g.id] || []).find(e => e.date === pickedDay) || null;
          const key = `${g.id}|${pickedDay}`;
          const isEditing = editingKey === key;
          const gTheme = themeFor(g.id);
          return (
            <li key={g.id} className="day-fill-row">
              <span className="day-fill-game">
                <span className="player-dot" style={{ background: gTheme.accent }} />
                {g.label}
                <span className="lb-meta"> #{puzzleNumberFor(g.id, pickedDay)}</span>
              </span>

              {isEditing ? (
                <InlineTimeEditor
                  initialSeconds={entry?.timeSeconds}
                  onSave={seconds => handleSaveEdit(g.id, pickedDay, seconds)}
                  onCancel={() => setEditingKey(null)}
                  className="history-entry-form"
                  saveLabel={entry ? 'Save' : 'Add'}
                  autoFocus
                />
              ) : entry ? (
                <span className="day-fill-actions">
                  <span className="history-entry-time">{formatSeconds(entry.timeSeconds)}</span>
                  <button className="chip-link" onClick={() => setEditingKey(key)}>Edit</button>
                  <button className="chip-link chip-link-danger" onClick={() => handleDeleteEntry(g.id, pickedDay)}>Delete</button>
                </span>
              ) : (
                <span className="day-fill-actions">
                  <span className="day-fill-empty">not filled in</span>
                  <button className="chip-link" onClick={() => setEditingKey(key)}>+ Add</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  if (monthly.length === 0) {
    return (
      <>
        <div className="panel-empty">No scores yet — enter a time above and your history builds up here.</div>
        {dayFillPanel}
      </>
    );
  }

  return (
    <>
      {dayFillPanel}

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head-row">
          <h2>Trend</h2>
          <select className="daily-compare-select" style={{ width: 'auto', marginBottom: 0 }} value={chartGame} onChange={e => setChartGame(e.target.value)}>
            {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <div className="section-sub">Average time per month</div>
        {trend.length < 2 ? (
          <div className="panel-empty">Play a couple more months to see a trend here.</div>
        ) : (
          <div style={{ height: 240 }}>
            <Line
              data={{
                labels: trend.map(t => monthLabel(t.month)),
                datasets: [{
                  label: GAMES.find(g => g.id === chartGame)?.label,
                  data: trend.map(t => t.avgSeconds),
                  borderColor: theme.accent,
                  backgroundColor: 'transparent',
                  tension: 0.3,
                  pointRadius: 4,
                  borderWidth: 2.5,
                }],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: c => ` ${formatSeconds(c.parsed.y)}` } },
                },
                scales: { y: { ticks: { callback: v => formatSeconds(v) } } },
              }}
            />
          </div>
        )}
      </section>

      {monthly.map(({ month, games }) => {
        const stats = games[historyGame];
        const label = GAMES.find(g => g.id === historyGame)?.label || historyGame;
        return (
          <section className="panel" key={month} style={{ marginBottom: 20 }}>
            <div className="panel-head-row" style={{ flexWrap: 'wrap', rowGap: 10 }}>
              <h2 style={{ marginBottom: 0 }}>{monthLabel(month)}</h2>
              <div className="history-game-tabs">
                {GAMES.map(g => {
                  const gTheme = themeFor(g.id);
                  const active = historyGame === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`history-game-tab${active ? ' active' : ''}`}
                      style={{
                        '--hg-accent': gTheme.accent,
                        '--hg-text': gTheme.onDark ? '#fff' : '#1a1508',
                      }}
                      onClick={() => setHistoryGame(g.id)}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {stats ? (
              <>
                <div className="section-sub" style={{ margin: '10px 0 10px' }}>
                  Avg {formatSeconds(stats.avgSeconds)} · Best {formatSeconds(stats.bestSeconds)} ·
                  {' '}{stats.daysPlayed}/{stats.activeDays} days played
                  {stats.daysMissed > 0 ? ` · ${stats.daysMissed} missed` : ''}
                </div>
                <ul className="history-entry-list">
                  {stats.entries.map(e => {
                    const key = `${historyGame}|${e.date}`;
                    const isEditing = editingKey === key;
                    return (
                      <li key={e.date} className="history-entry-row">
                        <span className="history-entry-date">{e.date}</span>
                        <span className="lb-meta">#{puzzleNumberFor(historyGame, e.date)}</span>
                        {isEditing ? (
                          <InlineTimeEditor
                            initialSeconds={e.timeSeconds}
                            onSave={seconds => handleSaveEdit(historyGame, e.date, seconds)}
                            onCancel={() => setEditingKey(null)}
                            className="history-entry-form"
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className="history-entry-time">{formatSeconds(e.timeSeconds)}</span>
                            <button className="chip-link" onClick={() => setEditingKey(key)}>Edit</button>
                            <button className="chip-link chip-link-danger" onClick={() => handleDeleteEntry(historyGame, e.date)}>Delete</button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="panel-empty" style={{ marginTop: 10 }}>No {label} entries this month.</div>
            )}
          </section>
        );
      })}

    </>
  );
}
