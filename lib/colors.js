// lib/colors.js
// The original dashboard hardcoded a color per (known) player name
// (PLAYER_COLORS). New accounts can't be enumerated in advance here, so
// this generates a stable, distinct color per uid instead — same visual
// role (a colored dot next to each name, consistent everywhere), just not
// hand-picked.
export function colorForUid(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 62%)`;
}

// A translucent version of a player colour, for fills and borders that tint
// rather than paint. The colour itself is never changed — only an alpha is
// added. Exists because appending a hex alpha (`${color}33`) silently stopped
// working when colours moved from hex to colorForUid()'s hsl(): the result
// isn't a valid colour, so borders fell back to the text colour and chart
// fills to solid black.
export function withAlpha(color, alpha) {
  if (color.startsWith('hsl(')) return color.replace(/\)$/, ` / ${alpha})`);
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
  }
  return color;
}
