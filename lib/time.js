// lib/time.js
export function formatSeconds(totalSeconds) {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// Parses "M:SS", "MM:SS", or a bare number of seconds. Returns null if invalid.
export function parseTimeInput(raw) {
  const value = raw.trim();
  if (!value) return null;
  const colonMatch = value.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (colonMatch) {
    const minutes = parseInt(colonMatch[1], 10);
    const seconds = parseInt(colonMatch[2], 10);
    return minutes * 60 + seconds;
  }
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return null;
}
