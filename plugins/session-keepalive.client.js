import { defineNuxtPlugin } from '#imports';
import { useEpaperApi, tokenExpiry } from '~/composables/useEpaperApi';

/**
 * Keeps a signed-in reader's session alive for as long as a tab is open.
 *
 * The access token lasts 20 minutes. Renewing it only after a request has
 * already failed (authedFetch's 401 path) works, but leaves the first
 * action after a long idle stretch slower and more fragile — so this renews
 * it a couple of minutes BEFORE it expires.
 *
 * Timers alone aren't enough: browsers throttle background tabs, a phone
 * pauses them entirely when the screen locks, and a laptop stops them while
 * asleep. So the same check also runs whenever the reader comes back —
 * the tab becomes visible, the window regains focus, the network returns,
 * or the page is restored from the back/forward cache (iOS Safari). Each
 * check is cheap: it decodes the token's expiry locally and only calls
 * /api/auth/refresh when the token is close to (or past) expiring.
 *
 * Renewal failures caused by the network are ignored here (the next check
 * retries); only a real "session over" from the server signs the reader out
 * — see renewToken() in composables/useEpaperApi.js.
 */
const RENEW_WITHIN_S = 150; // renew when 2.5 minutes or less remain
const CHECK_EVERY_MS = 60 * 1000;

function currentToken() {
  // Read the cookie itself rather than a useCookie ref, so a token written
  // by any part of the app (login, invite, another refresh) is always seen.
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (!m) return null;
  try {
    const v = decodeURIComponent(m[1]);
    return v && v !== 'null' && v !== 'undefined' ? v.replace(/^"|"$/g, '') : null;
  } catch {
    return null;
  }
}

export default defineNuxtPlugin(() => {
  const api = useEpaperApi(); // captured synchronously, inside the plugin's valid context

  async function check() {
    const jwt = currentToken();
    if (!jwt) return; // not signed in
    const exp = tokenExpiry(jwt);
    if (exp && exp - Date.now() / 1000 > RENEW_WITHIN_S) return; // plenty of time left
    if (!navigator.onLine) return; // the 'online' event will call check() again
    try {
      await api.renewToken();
    } catch {
      // network trouble — keep the session, try again on the next check
    }
  }

  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  check();
});