// lib/shareParser.js
// Parses a pasted LinkedIn puzzle-share text, e.g.:
//   "Tango #712 | 0:42 and flawless"
//   ...
//   "lnkd.in/tango."
// The trailing short link is preferred for identifying the game — it's
// stable across LinkedIn's display languages — with the leading word as a
// fallback when no recognizable link is present.
//
// The two patterns below (and the alternate "Nr./n.º" puzzle-number marker)
// are ported from parse_chat.py's `pattern`/`pattern2` — the WhatsApp-era
// scraper that had to deal with every real format variant this app's
// friend group actually saw over months of non-English LinkedIn locales
// and both Android/iOS share sheets:
//   - most of the time, number and time share a line with a "|" between
//     them, with LinkedIn's own punctuation/spacing around it varying more
//     than you'd guess (parse_chat.py tolerates *any* non-digit filler
//     there, not just whitespace) — that's `WITH_PIPE` below.
//   - sometimes there's no "|" at all and the time is simply on the next
//     line — that's `NO_PIPE`.
//   - the puzzle-number marker itself isn't always "#": Spanish/Portuguese
//     LinkedIn shows "Nr.", "N.", or "n.º" instead.
import { GAME_IDS, GAMES } from './games';

const NUM_MARKER = '(?:#|[Nn][r.]\\.?|n\\.\\u00ba)';
const WITH_PIPE = new RegExp(
  `^([A-Za-z][A-Za-z\\s]*?)\\s*${NUM_MARKER}\\s*(\\d+)[^\\d\\n]*\\|[^\\d]*([\\d:]+)(?:\\s+and\\s+(.+))?`,
  'i',
);
const NO_PIPE = new RegExp(
  `^([A-Za-z][A-Za-z\\s]*?)\\s*${NUM_MARKER}\\s*(\\d+)\\s*\\n\\s*([\\d:]+)`,
  'i',
);

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
  const text = rawText.replace(/^\s+/, '');
  const match = text.match(WITH_PIPE) || text.match(NO_PIPE);
  if (!match) return { ok: false, error: "Couldn't find a game, puzzle number, and time." };

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
