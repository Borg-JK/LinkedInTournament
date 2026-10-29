// components/NavIcon.jsx
// The handful of line icons the app shell and feed use — one stroke width,
// drawn in currentColor so they take the colour of the text around them.
const PATHS = {
  today: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  feed: <path d="M5 6h14M5 12h14M5 18h9" />,
  find: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></>,
  friends: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.6a4.5 4.5 0 0 1 5 4.4" /></>,
  history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" /></>,
  comment: <path d="M5 5h14v10H9l-4 4V5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  send: <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />,
};

export default function NavIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
