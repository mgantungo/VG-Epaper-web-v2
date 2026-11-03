// File: /var/www/VGEpaper/web/composables/usePageImages.js
import { useEpaperApi } from '~/composables/useEpaperApi';

/**
 * Page images for the scrolling reader, kept IN MEMORY ONLY.
 *
 * - Nothing is written to the reader's device: no service worker, no Cache
 *   API, no IndexedDB, no localStorage. The middleware also sends page
 *   images with `Cache-Control: private, no-store`, so the browser's own disk
 *   cache doesn't keep them either. Images live as Blob object URLs for as
 *   long as the tab is open, and are released as the reader moves on.
 * - Pages near the one being read are loaded in the background, nearest
 *   first, a couple at a time, so the next page is usually ready before the
 *   reader scrolls to it. On data saver or a slow connection only the very
 *   next pages are fetched ahead.
 * - At most FULL_LIMIT full-size pages are kept; the least recently used
 *   page that is not on screen is released first.
 * - Previews (?size=thumb, a few KB each) for the strip and sidebar are
 *   kept for the whole edition and dropped when the edition changes.
 *
 * Every fetch goes through useEpaperApi().fetchImageBlob, so an expired
 * access token is renewed and the request retried as everywhere else.
 */

const FULL_LIMIT = 14;
const FULL_CONCURRENCY = 2;
const THUMB_CONCURRENCY = 3;

let api = null;
const full = new Map(); // relativeUrl -> { promise, objectUrl, refs, last }
const thumbs = new Map(); // relativeUrl -> { promise, objectUrl }
const fullQueue = [];
const thumbQueue = [];
let fullActive = 0;
let thumbActive = 0;
let editionKey = null;

function fetchBlobUrl(url) {
  return api.fetchImageBlob(url).then((blob) => URL.createObjectURL(blob));
}

function loadFull(url) {
  let entry = full.get(url);
  if (entry) {
    entry.last = Date.now();
    return entry;
  }
  entry = { promise: null, objectUrl: null, refs: 0, last: Date.now() };
  full.set(url, entry);
  entry.promise = fetchBlobUrl(url)
    .then((objectUrl) => {
      if (full.get(url) !== entry) { URL.revokeObjectURL(objectUrl); throw new Error('released'); }
      entry.objectUrl = objectUrl;
      evict();
      return objectUrl;
    })
    .catch((err) => {
      if (full.get(url) === entry) full.delete(url); // a failed load is retried next time it's asked for
      throw err;
    });
  return entry;
}

function evict() {
  if (full.size <= FULL_LIMIT) return;
  const idle = [...full.entries()]
    .filter(([, e]) => e.refs === 0 && e.objectUrl)
    .sort((a, b) => a[1].last - b[1].last);
  for (const [url, e] of idle) {
    if (full.size <= FULL_LIMIT) break;
    URL.revokeObjectURL(e.objectUrl);
    full.delete(url);
  }
}

function pumpFull() {
  while (fullActive < FULL_CONCURRENCY && fullQueue.length) {
    const url = fullQueue.shift();
    if (full.has(url)) continue;
    fullActive++;
    loadFull(url).promise.catch(() => {}).finally(() => { fullActive--; pumpFull(); });
  }
}

function pumpThumbs() {
  while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
    const { url, resolve, reject } = thumbQueue.shift();
    thumbActive++;
    fetchBlobUrl(url).then(resolve, reject).finally(() => { thumbActive--; pumpThumbs(); });
  }
}

/** How many pages to fetch ahead of (and behind) the one on screen. */
export function prefetchWindow() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c?.saveData || ['slow-2g', '2g', '3g'].includes(c?.effectiveType)) return { ahead: 2, behind: 1 };
  return { ahead: 5, behind: 2 };
}

export function usePageImages() {
  if (!api) api = useEpaperApi(); // captured inside a component's setup, the first time

  return {
    /** Full page image as an object URL. Call release(url) when it leaves the screen. */
    acquire(url) {
      const entry = loadFull(url);
      entry.refs++;
      return entry.promise;
    },
    release(url) {
      const entry = full.get(url);
      if (!entry) return;
      entry.refs = Math.max(0, entry.refs - 1);
      entry.last = Date.now();
      evict();
    },
    /** Queue pages to load in the background; earlier in the list = sooner. */
    prefetch(urls) {
      fullQueue.length = 0;
      for (const u of urls) if (u && !full.has(u)) fullQueue.push(u);
      pumpFull();
    },
    /** Small preview as an object URL (kept for the whole edition). */
    thumb(url) {
      let entry = thumbs.get(url);
      if (!entry) {
        entry = { objectUrl: null, promise: null };
        thumbs.set(url, entry);
        entry.promise = new Promise((resolve, reject) => {
          thumbQueue.push({ url, resolve, reject });
          pumpThumbs();
        }).then((objectUrl) => {
          if (thumbs.get(url) !== entry) { URL.revokeObjectURL(objectUrl); throw new Error('released'); }
          entry.objectUrl = objectUrl;
          return objectUrl;
        }).catch((err) => {
          if (thumbs.get(url) === entry) thumbs.delete(url);
          throw err;
        });
      }
      return entry.promise;
    },
    /**
     * Call when an edition has loaded, with the start its image URLs share
     * (e.g. "/api/editions/nv/2026-11-03/"), or null for a locked edition.
     * Every page and preview of any OTHER edition is let go; this edition's,
     * including ones still loading, are kept — the strip and sidebar may
     * already have asked for them.
     */
    setEdition(prefix) {
      if (prefix === editionKey) return;
      editionKey = prefix;
      const keep = (u) => Boolean(prefix) && u.startsWith(prefix);
      for (let i = fullQueue.length - 1; i >= 0; i--) if (!keep(fullQueue[i])) fullQueue.splice(i, 1);
      for (let i = thumbQueue.length - 1; i >= 0; i--) {
        if (!keep(thumbQueue[i].url)) thumbQueue.splice(i, 1)[0].reject(new Error('released'));
      }
      for (const [u, e] of full) {
        if (keep(u) || e.refs > 0) continue;
        if (e.objectUrl) URL.revokeObjectURL(e.objectUrl);
        full.delete(u);
      }
      for (const [u, e] of thumbs) {
        if (keep(u)) continue;
        if (e.objectUrl) URL.revokeObjectURL(e.objectUrl);
        thumbs.delete(u);
      }
    }
  };
}

/** The preview URL for a page (same entitlement check as the full page). */
export function thumbUrlFor(page) {
  return page?.imageUrl ? `${page.imageUrl}${page.imageUrl.includes('?') ? '&' : '?'}size=thumb` : null;
}