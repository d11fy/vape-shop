/**
 * Theme preference.
 *
 * Stored in a plain (non-HttpOnly) cookie so the server can render the correct
 * `data-theme` on the first byte and the client can flip it instantly without a
 * round trip. `localStorage` could not do the former; a server action could not
 * do the latter without a flash.
 */

export const THEME_COOKIE = 'vs_theme';

export type Theme = 'light' | 'dark' | 'system';

const ONE_YEAR = 60 * 60 * 24 * 365;

export function readThemeCookie(): Theme {
  if (typeof document === 'undefined') return 'system';
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return value === 'dark' || value === 'light' ? value : 'system';
}

/** Persist the choice and apply it to the live document in the same tick. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }
}

/** What the user would actually see right now, resolving `system`. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
