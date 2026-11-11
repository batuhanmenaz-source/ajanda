const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const Icon = {
  Today: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>),
  Calendar: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  Megaphone: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><path d="M3 11v3a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" /></svg>),
  Note: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></svg>),
  Briefcase: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></svg>),
  Home: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></svg>),
  Phone: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" {...base} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>),
  Plus: (p) => (<svg width="26" height="26" viewBox="0 0 24 24" {...base} strokeWidth="2.4" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  Close: (p) => (<svg width="20" height="20" viewBox="0 0 24 24" {...base} strokeWidth="2.2" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  Check: (p) => (<svg width="12" height="12" viewBox="0 0 24 24" {...base} stroke="#fff" strokeWidth="3.2" {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>),
  Left: (p) => (<svg width="20" height="20" viewBox="0 0 24 24" {...base} {...p}><path d="M15 18l-6-6 6-6" /></svg>),
  Right: (p) => (<svg width="20" height="20" viewBox="0 0 24 24" {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>),
  Trash: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>),
  Refresh: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>),
  Logout: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>),
  Google: (p) => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" {...p}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
};
