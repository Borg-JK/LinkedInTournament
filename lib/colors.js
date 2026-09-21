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
