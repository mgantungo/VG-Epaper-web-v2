/**
 * apps/web/composables/useReadingTracker.js                NEW FILE (Phases 1–4)
 *
 * Records reading for the analytics dashboards: which pages are on screen
 * and for how long, which stories are opened and for how long, paywall
 * views and searches. Sent to the middleware (POST /api/track) in small
 * batches with navigator.sendBeacon, so closing the tab doesn't lose the
 * last page. Browser only; does nothing during SSR.
 *
 * What is counted:
 *   - time on page runs only while the tab is visible and the reader has
 *     touched, scrolled, clicked or pressed a key in the last 3 minutes;
 *   - in a two-page spread the time is shared between the two pages;
 *   - a page counts as READ after 3 seconds (decided on the server);
 *   - the server works out the reader, section, paper access and caps a
 *     page view at 10 minutes, so nothing here is trusted beyond "this
 *     happened".
 *
 * Ids (no personal data):
 *   visitor id  random, kept in localStorage (anonymous readers)
 *   session id  random, sessionStorage; a new one after 30 minutes idle
 * Both also go on API calls as x-visitor-id / x-session-id, so an edition
 * opened and the pages read join up into one session.
 */
import { watch } from 'vue';
import { useRuntimeConfig, useCookie } from '#imports';

const IDLE_MS = 3 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_MS = 15 * 1000;

const isBrowser = typeof window !== 'undefined';
const state = {
  started: false,
  endpoint: null,
  tokenCookie: null,
  queue: [],
  views: [], // [{ publication, editionDate, pageNumber, since }]
  share: 1,
  lastInput: Date.now(),
  story: null, // { publication, editionDate, pageNumber, storyId, since, active }
  timer: null
};

function rid() {
  const a = new Uint8Array(12);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeGet(store, key) {
  try { return store.getItem(key); } catch { return null; }
}
function safeSet(store, key, value) {
  try { store.setItem(key, value); } catch { /* storage blocked: ids just won't persist */ }
}

let memVisitor = null;
let memSession = null;
export function visitorId() {
  if (!isBrowser) return null;
  let v = safeGet(window.localStorage, 'ep_vid');
  if (!v) {
    v = memVisitor || rid();
    safeSet(window.localStorage, 'ep_vid', v);
  }
  memVisitor = v;
  return v;
}
export function sessionId() {
  if (!isBrowser) return null;
  const now = Date.now();
  let s = null;
  try { s = JSON.parse(safeGet(window.sessionStorage, 'ep_sid') || 'null'); } catch { s = null; }
  if (!s && memSession) s = memSession;
  if (!s || now - s.last > SESSION_IDLE_MS) s = { id: rid(), last: now };
  s.last = now;
  memSession = s;
  safeSet(window.sessionStorage, 'ep_sid', JSON.stringify(s));
  return s.id;
}

/** Headers for middleware calls, so server-side events join the session. */
export function trackingHeaders() {
  if (!isBrowser) return {};
  return { 'x-visitor-id': visitorId(), 'x-session-id': sessionId() };
}

/** Where the next edition was opened from: landing, archive, search, paper. Read once. */
export function setNextVia(via) {
  if (isBrowser) safeSet(window.sessionStorage, 'ep_via', via);
}
export function takeVia() {
  if (!isBrowser) return null;
  const v = safeGet(window.sessionStorage, 'ep_via');
  try { window.sessionStorage.removeItem('ep_via'); } catch { /* ignore */ }
  return v;
}

// ---- sending ---------------------------------------------------------------

function send() {
  if (!state.queue.length || !state.endpoint) return;
  const events = state.queue.splice(0, 100);
  const body = JSON.stringify({ token: state.tokenCookie?.value || undefined, vid: visitorId(), sid: sessionId(), events });
  let sent = false;
  try {
    sent = navigator.sendBeacon?.(state.endpoint, new Blob([body], { type: 'text/plain' })) || false;
  } catch {
    sent = false;
  }
  if (!sent) {
    fetch(state.endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  }
  if (state.queue.length) send();
}

function push(ev) {
  state.queue.push({ ...ev, at: ev.at || Date.now() });
  if (state.queue.length >= 40) send();
}

// ---- time on page ------------------------------------------------------------

function activeUntil(now) {
  // Reading time stops counting 3 minutes after the last touch, scroll, click or key.
  return Math.min(now, state.lastInput + IDLE_MS);
}

function closeViews(now = Date.now()) {
  for (const v of state.views) {
    const end = activeUntil(now);
    const ms = Math.max(0, end - v.since);
    if (ms > 0) push({ type: 'page.view', publication: v.publication, editionDate: v.editionDate, pageNumber: v.pageNumber, dwellMs: Math.round(ms / state.share), at: v.since });
  }
  state.views = [];
}

function openViews(list) {
  const now = Date.now();
  state.views = list.map((v) => ({ ...v, since: now }));
  state.share = Math.max(1, list.length);
}

function closeStory(now = Date.now()) {
  const s = state.story;
  if (!s) return;
  push({ type: 'story.open', publication: s.publication, editionDate: s.editionDate, pageNumber: s.pageNumber, storyId: s.storyId, dwellMs: Math.max(0, activeUntil(now) - s.since), at: s.since });
  state.story = null;
}

function onInput() {
  const now = Date.now();
  if (now - state.lastInput > IDLE_MS) {
    // back from idle: restart the clocks from now
    for (const v of state.views) v.since = now;
    if (state.story) state.story.since = now;
  }
  state.lastInput = now;
}

function onHide() {
  const now = Date.now();
  const views = state.views.map(({ since, ...v }) => v);
  closeViews(now);
  const story = state.story ? { ...state.story } : null;
  closeStory(now);
  send();
  // keep what is on screen, to resume when the tab comes back
  state.resume = { views, story };
}

function onShow() {
  if (!state.resume) return;
  state.lastInput = Date.now();
  openViews(state.resume.views);
  if (state.resume.story) state.story = { ...state.resume.story, since: Date.now() };
  state.resume = null;
}

function start() {
  if (state.started || !isBrowser) return;
  state.started = true;
  const config = useRuntimeConfig();
  state.endpoint = `${config.public.middlewareUrl}/api/track`;
  state.tokenCookie = useCookie('token');
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(ev, onInput, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? onHide() : onShow()));
  window.addEventListener('pagehide', onHide);
  state.timer = window.setInterval(() => {
    // roll the open views every 15 s, so a crash or lost connection loses little
    if (document.visibilityState !== 'visible') return;
    const keep = state.views.map(({ since, ...v }) => v);
    if (keep.length && Date.now() - state.lastInput <= IDLE_MS) {
      closeViews();
      openViews(keep);
    }
    send();
  }, FLUSH_MS);
}

// ---- public API ------------------------------------------------------------------

export function useReadingTracker() {
  if (isBrowser) start();

  /**
   * Follows the reader store: the pages on screen. Call once from the
   * reader page. Returns a stop function.
   */
  function watchReader(reader) {
    if (!isBrowser) return () => {};
    return watch(
      () => {
        const e = reader.edition;
        if (!e || reader.loading) return '';
        if (e.locked) return `${e.publicationCode}|${e.date}|1|locked`;
        const v = reader.currentView || {};
        return `${e.publicationCode}|${e.date}|${[v.left?.pageNumber, v.right?.pageNumber].filter(Boolean).join(',')}`;
      },
      (key) => {
        closeViews();
        if (!key) return;
        const [publication, editionDate, pages] = key.split('|');
        const list = String(pages).split(',').filter(Boolean).map((n) => ({ publication, editionDate, pageNumber: Number(n) }));
        state.lastInput = Date.now();
        openViews(list);
      },
      { immediate: true }
    );
  }

  /** A story pulled out (or null when it closes). */
  function storyChanged(reader, story) {
    closeStory();
    if (!story || !reader.edition || reader.edition.locked) return;
    const page = (reader.edition.pages || []).find((p) => (p.stories || []).some((s) => s.id === story.id));
    if (!page) return;
    state.lastInput = Date.now();
    state.story = {
      publication: reader.edition.publicationCode,
      editionDate: reader.edition.date,
      pageNumber: page.pageNumber,
      storyId: story.id,
      since: Date.now()
    };
  }

  function paywallShown(publication, editionDate) {
    if (!isBrowser || !publication || !editionDate) return;
    push({ type: 'paywall.view', publication, editionDate });
    send();
  }

  function searched(q, results, publication) {
    const text = String(q || '').trim();
    if (!isBrowser || text.length < 3) return;
    push({ type: 'search.query', q: text.slice(0, 120), results, publication });
  }

  /** Close everything open now (e.g. leaving the reader for the landing page). */
  function flushNow() {
    if (!isBrowser) return;
    closeViews();
    closeStory();
    send();
  }

  return { watchReader, storyChanged, paywallShown, searched, flushNow };
}
