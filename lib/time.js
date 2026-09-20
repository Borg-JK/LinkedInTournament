// lib/time.js
export function formatSeconds(totalSeconds) {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// ── Auto-formatting M:SS entry ──────────────────────────────────────────────
// Backs a masked time input: the user just types digits (1 to 4 of them,
// nothing required beyond what they type) and the colon appears on its own,
// always splitting the last two digits off as seconds — the same mental
// model as a stopwatch/timer keypad. "28" -> 0:28, "105" -> 1:05,
// "1234" -> 12:34. A 5th digit shifts the buffer left, dropping the oldest.

const MAX_TIME_DIGITS = 4;

// Extracts and caps the raw digit buffer from whatever's currently in the
// input (after a keystroke). Takes the *last* 4 digits so new digits always
// enter from the right, matching how the display reformats.
export function digitsFromInput(raw) {
  return raw.replace(/\D/g, '').slice(-MAX_TIME_DIGITS);
}

// Renders a raw digit buffer as "M:SS" while typing. 1-2 digits show plain
// (still ambiguous — could become minutes any time a 3rd digit is typed),
// 3-4 digits split the last two off as seconds.
export function formatDigitsForDisplay(digits) {
  if (digits.length <= 2) return digits;
  const seconds = digits.slice(-2);
  const minutes = String(parseInt(digits.slice(0, -2), 10));
  return `${minutes}:${seconds}`;
}

// Converts a raw digit buffer to total seconds for saving. 1-2 digits are
// taken as seconds outright (puzzle times are never under 10 seconds, so a
// bare "28" unambiguously means 0:28, not an in-progress "2 minutes...").
export function digitsToSeconds(digits) {
  if (!digits) return null;
  if (digits.length <= 2) return parseInt(digits, 10);
  const seconds = parseInt(digits.slice(-2), 10);
  const minutes = parseInt(digits.slice(0, -2), 10);
  return minutes * 60 + seconds;
}

// The inverse of digitsToSeconds — pre-fills the masked input's buffer from
// an already-saved value, e.g. when opening a box to edit it.
export function secondsToDigits(totalSeconds) {
  const s = Math.round(totalSeconds);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}${String(seconds).padStart(2, '0')}`;
}
