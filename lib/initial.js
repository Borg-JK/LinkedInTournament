// lib/initial.js
// The first user-perceived character of a name, for avatars. charAt(0)
// returns half an emoji ("🦊 Fox" gives a lone surrogate, drawn as a broken
// glyph) and the first code point of a ZWJ sequence like 👩🏽‍💻.
export function firstGrapheme(name) {
  const text = (name || '').trim();
  if (!text) return '?';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next().value.segment;
  }
  return Array.from(text)[0];
}
