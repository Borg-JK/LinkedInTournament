// lib/chartTheme.js
// One look for every chart in the app, applied as Chart.js defaults so each
// chart's own options still win where they set something. Styling only: no
// dataset, label, scale range or data value is touched here.
//
// Imported for its side effect by every component that draws a chart.
import { Chart } from 'chart.js';

const INK = '#1a1408';
const MUTED = '#7d7468';

Chart.defaults.font.family = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = MUTED;
// Gridlines and axis lines: present enough to read values against, quiet
// enough that the data is what you see first.
Chart.defaults.borderColor = 'rgba(26, 20, 8, 0.07)';

// Plugin defaults go through defaults.set(), which creates the scope if a
// plugin isn't registered yet — this file loads before each component
// registers its plugins, and some charts never register Legend at all.

// Round legend markers in each player's colour, matching the dots used
// next to names everywhere else.
Chart.defaults.set('plugins.legend.labels', {
  usePointStyle: true,
  pointStyle: 'circle',
  padding: 14,
});

// Tooltip in the app's own dark ink rather than Chart.js's stock black box.
Chart.defaults.set('plugins.tooltip', {
  backgroundColor: INK,
  titleColor: '#f5f1e8',
  bodyColor: 'rgba(245, 241, 232, 0.82)',
  borderColor: 'rgba(240, 217, 138, 0.25)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 10,
  boxPadding: 5,
  usePointStyle: true,
  titleFont: { weight: '600' },
});

// Motion. A chart draws in once, briefly, when it first appears — that's
// the "here's your data" moment. Switching month, game or player is
// something people do over and over, so those updates don't animate at all
// (each chart passes updateMode="none"; see the components). Hovering a
// point is instant too.
Chart.defaults.set('animation', { duration: 250, easing: 'easeOutQuart' });
Chart.defaults.set('transitions.active.animation', { duration: 0 });

// Reduced motion: no chart animation of any kind.
if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  Chart.defaults.animation = false;
}

export default Chart;
