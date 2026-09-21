// lib/shareParser.js
// Parses the first line of a pasted LinkedIn puzzle-share text, e.g.:
//   "Tango #712 | 0:42 and flawless"
//   ...
//   "lnkd.in/tango."
// The trailing short link is preferred for identifying the game — it's
// stable across LinkedIn's display languages — with the leading word as a
// fallback when no recognizable link is present.
import { GAME_IDS, GAMES } from './games';

const SHORT_LINK_SLUGS = {
  queens: ['queens'],
  tango: ['tango'],
  mini: ['mini-sudoku', 'minisudoku', 'mini', 'sudoku'],
  zip: ['zip'],
  patches: ['patches'],
};

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveGameFromSlug(slug) {
  const n = normalize(slug);
  for (const [gameId, aliases] of Object.entries(SHORT_LINK_SLUGS)) {
    if (aliases.some(a => normalize(a) === n)) return gameId;
  }
  return null;
}

function resolveGameFromWord(word) {
  const n = normalize(word);
  const byId = GAME_IDS.find(id => normalize(id) === n);
  if (byId) return byId;
  const byLabel = GAMES.find(g => normalize(g.label) === n);
  return byLabel ? byLabel.id : null;
}

function timeToSeconds(str) {
  const parts = str.split(':').map(Number);
  if (parts.length < 2 || parts.some(n => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function parseShareText(rawText) {
  if (!rawText || !rawText.trim()) return { ok: false, error: 'Nothing to parse.' };
  const firstLine = rawText.split('\n')[0].trim();
  const match = firstLine.match(/^([A-Za-z][A-Za-z\s]*?)\s*#(\d+)\s*\|\s*([\d:]+)(?:\s+and\s+(.+))?$/);
  if (!match) return { ok: false, error: "Couldn't find a game, puzzle number, and time in the first line." };

  const [, leadWord, puzzleNumStr, timeStr, qualifier] = match;

  const linkMatch = rawText.match(/lnkd\.in\/([a-z0-9-]+)/i);
  const gameId = (linkMatch && resolveGameFromSlug(linkMatch[1])) || resolveGameFromWord(leadWord);
  const timeSeconds = timeToSeconds(timeStr);
  const puzzleNum = parseInt(puzzleNumStr, 10);

  if (!gameId) return { ok: false, error: `Couldn't tell which game this is ("${leadWord.trim()}").` };
  if (timeSeconds == null || timeSeconds <= 0) return { ok: false, error: `Couldn't read the time ("${timeStr}").` };

  return {
    ok: true,
    gameId,
    puzzleNum,
    timeSeconds,
    qualifier: qualifier ? qualifier.trim().replace(/\.+$/, '') : null,
  };
}
