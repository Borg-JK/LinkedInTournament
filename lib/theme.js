// lib/theme.js
// Per-game color themes, carried over exactly from the original dashboard's
// five CSS themes (HTML/index.html). Used to tint a tournament's per-game
// tab/panel so each game reads the same way it always did.
export const GAME_THEME = {
  queens:  { accent: '#d4af6a', accent2: '#e8c989', bg: '#0a1240', bgSoft: '#1a2354', onDark: true  },
  tango:   { accent: '#c9942a', accent2: '#e0b049', bg: '#f5e6b8', bgSoft: '#faf0d0', onDark: false },
  mini:    { accent: '#2d6a4f', accent2: '#52b788', bg: '#d8e2d0', bgSoft: '#e8efe2', onDark: false },
  zip:     { accent: '#c4521f', accent2: '#e87b4e', bg: '#f5d4ba', bgSoft: '#fae3cf', onDark: false },
  patches: { accent: '#5c7a3a', accent2: '#88a05c', bg: '#d8dcc4', bgSoft: '#e6e9d6', onDark: false },
  overall: { accent: '#d4af6a', accent2: '#e8c989', bg: '#f7f5ee', bgSoft: '#ffffff', onDark: false },
};

export function themeFor(gameId) {
  return GAME_THEME[gameId] || GAME_THEME.overall;
}
