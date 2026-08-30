'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'theme';

// What the page is actually showing right now: an explicit choice if one was
// made, otherwise whatever the browser asked for.
function resolvedTheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The live theme is browser state, not React state — the inline script in
// app/layout.js sets it before React exists, and the OS can change it under us.
// useSyncExternalStore is the way to read that without a render-time guess:
// the server snapshot is null, so the server and the first client render agree
// on an empty icon slot, and the real value arrives with hydration.
const listeners = new Set();

function subscribe(onChange) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  // Only matters while no explicit choice is stored; once one is,
  // document.documentElement.dataset.theme wins inside resolvedTheme() anyway.
  media.addEventListener('change', onChange);
  listeners.add(onChange);
  return () => {
    media.removeEventListener('change', onChange);
    listeners.delete(onChange);
  };
}

function setTheme(next) {
  document.documentElement.dataset.theme = next;
  // Read back by the inline script in app/layout.js on the next page load,
  // which is what stops the wrong theme painting for a frame.
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  listeners.forEach(l => l());
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, resolvedTheme, () => null);

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm theme-toggle"
      onClick={() => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark')}
      title={label}
      aria-label={label}
    >
      {/* Fixed-size slot either way, so filling it in after hydration doesn't
          shuffle the rest of the navbar sideways. */}
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
          </svg>
        ) : theme === 'light' ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
