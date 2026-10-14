// components/Skeleton.jsx
// Placeholder shaped like what's loading, instead of a bare "Loading…".
// The words are still there for screen readers (and role="status"
// announces them); the blocks are decorative. Colours come from
// currentColor, so the same placeholder works on a white panel, the dark
// page or a coloured score box without per-surface variants.
//
//   <Skeleton variant="rows" count={5} />  — leaderboards, member lists
//   <Skeleton variant="lines" count={3} /> — a paragraph or a short list
//   <Skeleton variant="block" />            — a chart
export default function Skeleton({ variant = 'lines', count = 3, className = '' }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div className={`skeleton skeleton-${variant} ${className}`.trim()} role="status">
      <span className="sr-only">Loading…</span>
      {variant === 'block' && <div className="skeleton-bar skeleton-fill" aria-hidden="true" />}
      {variant === 'lines' && items.map(i => <div key={i} className="skeleton-bar" aria-hidden="true" />)}
      {variant === 'rows' && items.map(i => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-dot" />
          <span className="skeleton-bar" />
          <span className="skeleton-bar skeleton-bar-short" />
        </div>
      ))}
    </div>
  );
}
