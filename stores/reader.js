// File: /var/www/VGEpaper/web/stores/reader.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useEpaperApi } from '~/composables/useEpaperApi';

/**
 * SCROLLING READER (Nov 2026): pages are no longer turned with a flip; they
 * sit one under another and the reader scrolls (components/reader/
 * ScrollReader.vue). `currentIndex` is still "the view on screen" — set by
 * scrolling (setIndexFromScroll) — and turn()/jumpTo() now ask the scroller
 * to move there through `scrollRequest`, so Search, Contents, the pull-out's
 * "continues on page N", the keyboard and the reading tracker all keep
 * working unchanged.
 *
 * Shape of one page as returned by GET /api/editions/:date, for reference
 * (not enforced — this is a plain-JS project now):
 *   { pageNumber, section?, imageUrl?, stories?: [{ id, top, left, width,
 *     height, kicker?, headline, byline?, teaser?, body? }] }
 *
 * Shape of the edition response itself:
 *   { date, locked, pageCount, volume?, issueNumber?, coverPrice?, currency?,
 *     price?: { amount, currency, kind: 'subscription' | 'archive_purchase' },
 *     pages: [...] }
 */

// Zoom is relative to fit-to-screen (1 = whole page/spread visible).
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 3;

export const useReaderStore = defineStore('reader', () => {
  // Captured once, synchronously, at store creation — which always happens
  // inside a component's valid setup context (the first `useReaderStore()`
  // call, e.g. in pages/[...date].vue). Re-calling useEpaperApi() (and the
  // useRuntimeConfig()/useCookie() it wraps) *inside* an async action after
  // that action has been invoked post-await is what triggers Nuxt's
  // NUXT_E1001 "composable called outside context" warning — capturing it
  // once here and reusing it below avoids that entirely.
  const api = useEpaperApi();
  // True on phones and tablets held upright (composables/useBreakpoint.js):
  // one page at a time, page strip at the bottom. False on desktops and
  // tablets on their side: sidebar, single or double pages.
  const layoutCompact = ref(false);

  const currentDate = ref(todayIso());
  // Phase 0: the publication being read (NV, BK, NVW, …). Editions are
  // addressed by publication + date; see pages/[...date].vue for the URLs.
  const currentPublication = ref('NV');
  const edition = ref(null);
  const viewMode = ref('double'); // 'single' | 'double' — the reader's PREFERENCE, not necessarily what's shown; see effectiveViewMode
  const viewModeManuallySet = ref(false); // stops useResponsiveReaderMode fighting a manual toolbar choice
  const currentIndex = ref(0);
  const animating = ref(false);
  const loading = ref(true); // starts true: the initial load now only ever happens client-side (see pages/[...date].vue), so the server-rendered page shows "Loading edition…" instead of a blank book shell until that first client fetch completes
  const loadError = ref(null); // null | 'not_found' | 'error' — see loadEdition()
  const zoom = ref(1); // 1 = fit the page(s) to the reading area; >1 enlarges and the stage scrolls
  const fitMode = ref('page'); // wide layout: 'page' = whole page/spread on screen, 'width' = fill the width
  const sidebarOpen = ref(true); // wide layout: the page sidebar
  // { index, smooth, seq } — read by ScrollReader.vue, which scrolls there.
  const scrollRequest = ref(null);
  let scrollSeq = 0;
  function requestScroll(index, smooth = true) {
    scrollRequest.value = { index, smooth, seq: ++scrollSeq };
  }
  // Width ÷ height of a page image. Measured from the first page image that
  // loads (PageFace.vue → setPageAspect) so the book frame matches the real
  // page shape instead of a hard-coded guess; this is the fallback until then.
  const pageAspect = ref(900 / 1056);
  let pageAspectMeasured = false;
  // Remembered per browser (localStorage), so a reader who mutes it doesn't
  // have to every visit. Restored after mount via restoreSoundPref() rather
  // than read here: Pinia's SSR hydration would overwrite it with the
  // server's value (always on) anyway.
  const soundEnabled = ref(true);
  function restoreSoundPref() {
    try { soundEnabled.value = localStorage.getItem('epaper.pageSound') !== 'off'; } catch { /* storage blocked — keep the default */ }
  }

  // Kampala calendar day (UTC+3) — the date printed on the paper, and the
  // same "today" the middleware uses. The old UTC date was a day behind
  // between midnight and 03:00 Kampala time.
  function todayIso() {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  // ---- spread geometry, same rule as the mockup: page 1 alone on the right,
  // the last page alone on the left, everything between as two-up spreads.
  const doubleViews = computed(() => {
    const pages = edition.value?.pages || [];
    if (!pages.length) return [];
    const views = [];
    views.push({ left: null, right: pages[0] });
    let i = 1;
    while (i < pages.length - 1) {
      views.push({ left: pages[i], right: pages[i + 1] });
      i += 2;
    }
    views.push({ left: pages[pages.length - 1], right: null });
    return views;
  });
  const singleViews = computed(() =>
    (edition.value?.pages || []).map(p => ({ left: null, right: p }))
  );

  /**
   * The mode actually rendered. Mobile is a hard constraint, not just a
   * default: below the mobile breakpoint the reader always shows one page
   * at a time, regardless of `viewMode`. This is deliberately layered on
   * top of `viewMode` rather than overwriting it — a reader who chose
   * 'double' on desktop keeps that preference; it's just masked while the
   * screen is too narrow for a spread to make sense, and comes back
   * automatically if they widen the window. Every place that used to read
   * `viewMode` directly to decide geometry (activeViews, index lookups,
   * jumpTo) now reads this instead — `viewMode` itself is only the stored
   * preference from here on, not what's necessarily on screen.
   */
  const effectiveViewMode = computed(() => (layoutCompact.value ? 'single' : viewMode.value));

  const activeViews = computed(() => (effectiveViewMode.value === 'double' ? doubleViews.value : singleViews.value));
  const currentView = computed(() => activeViews.value[currentIndex.value] || { left: null, right: null });

  /**
   * The paper's sections in page order — consecutive pages that share a
   * section form one entry: [{ name, first, last }]. The cover (no section of
   * its own) is "Front Page"; any other page without one joins the section
   * before it. Drives the section bar, the sidebar headings and Go to page.
   */
  const sections = computed(() => {
    const out = [];
    for (const p of edition.value?.pages || []) {
      const name = p.section || (p.pageNumber === 1 ? 'Front Page' : null);
      const last = out[out.length - 1];
      if (last && (!name || name === last.name)) { last.last = p.pageNumber; continue; }
      out.push({ name: name || `Page ${p.pageNumber}`, first: p.pageNumber, last: p.pageNumber });
    }
    return out;
  });
  const currentSection = computed(() => {
    const v = currentView.value;
    const n = v.left?.pageNumber ?? v.right?.pageNumber;
    return sections.value.find((s) => n >= s.first && n <= s.last) || null;
  });

  const atStart = computed(() => currentIndex.value === 0);
  const atEnd = computed(() => currentIndex.value === Math.max(activeViews.value.length - 1, 0));

  /** dateIso: YYYY-MM-DD, 'today' or 'latest'. */
  async function loadEdition(publication, dateIso) {
    loading.value = true;
    loadError.value = null;
    currentPublication.value = String(publication || 'NV').toUpperCase();
    currentDate.value = dateIso;
    currentIndex.value = 0;
    pageAspectMeasured = false; // re-measure: another publication may print at a different page size
    try {
      edition.value = await api.getEdition(currentPublication.value, dateIso);
      if (edition.value?.date) currentDate.value = edition.value.date;
    } catch (err) {
      // Critical: clear out whatever the PREVIOUS date's edition was. This
      // is the actual fix for "the archive shows the same copy for every
      // date" — that was never a caching bug, it was this catch block
      // simply not existing, so a failed fetch (e.g. 404, nothing
      // published for that date) left the last successful edition sitting
      // in state indefinitely while the UI kept rendering it.
      edition.value = null;
      const status = err?.response?.status ?? err?.statusCode ?? err?.status;
      loadError.value = status === 404 ? 'not_found' : 'error';
    } finally {
      loading.value = false;
    }
  }

  // The reader's own single/double choice (toolbar buttons) is kept in the
  // browser, so a refresh doesn't snap back to the width-based default.
  const VIEW_MODE_KEY = 'epaper.viewMode';
  function savedViewMode() {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return v === 'single' || v === 'double' ? v : null;
    } catch {
      return null;
    }
  }

  function setViewMode(mode, manual = false) {
    if (manual) {
      viewModeManuallySet.value = true;
      try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* storage blocked — choice lasts this visit only */ }
    }
    if (mode === viewMode.value) return;
    // Preserve roughly where the reader was when switching spread <-> single.
    const primaryPageNum = currentPrimaryPageNumber();
    viewMode.value = mode;
    if (primaryPageNum != null) {
      const idx = indexForPageNumber(effectiveViewMode.value, primaryPageNum); // effective, not raw — that's what activeViews actually resolves against
      if (idx >= 0) currentIndex.value = idx;
    }
    requestScroll(currentIndex.value, false);
  }

  function setLayoutCompact(compact) {
    if (compact === layoutCompact.value) return;
    const primaryPageNum = currentPrimaryPageNumber();
    layoutCompact.value = compact;
    if (primaryPageNum != null) {
      const idx = indexForPageNumber(effectiveViewMode.value, primaryPageNum);
      if (idx >= 0) currentIndex.value = idx;
    }
    requestScroll(currentIndex.value, false);
  }

  function currentPrimaryPageNumber() {
    const v = currentView.value;
    if (effectiveViewMode.value === 'single') return v.right?.pageNumber ?? null;
    // a spread: the left-hand page, where the reader starts reading it
    return v.left?.pageNumber ?? v.right?.pageNumber ?? null;
  }
  function indexForPageNumber(mode, num) {
    const views = mode === 'double' ? doubleViews.value : singleViews.value;
    return views.findIndex(v => v.left?.pageNumber === num || v.right?.pageNumber === num);
  }

  /** One view (page or spread) up or down. */
  function turn(direction) {
    const delta = direction === 'next' ? 1 : -1;
    const newIndex = currentIndex.value + delta;
    if (newIndex < 0 || newIndex >= activeViews.value.length) return;
    currentIndex.value = newIndex;
    requestScroll(newIndex, true);
  }

  function jumpTo(pageNumber, smooth = true) {
    const idx = indexForPageNumber(effectiveViewMode.value, pageNumber); // effectiveViewMode: activeViews resolves against it
    if (idx < 0) return;
    currentIndex.value = idx;
    requestScroll(idx, smooth);
  }

  /** The scroller reports which view is on screen; no scrolling back. */
  function setIndexFromScroll(index) {
    if (index >= 0 && index < activeViews.value.length && index !== currentIndex.value) currentIndex.value = index;
  }

  // Wide-layout preferences, kept per browser like the single/double choice.
  const PREFS_KEY = 'epaper.readerPrefs';
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ fitMode: fitMode.value, sidebarOpen: sidebarOpen.value })); } catch { /* storage blocked */ }
  }
  function restoreReaderPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (p.fitMode === 'page' || p.fitMode === 'width') fitMode.value = p.fitMode;
      if (typeof p.sidebarOpen === 'boolean') sidebarOpen.value = p.sidebarOpen;
    } catch { /* storage blocked or bad JSON — keep the defaults */ }
  }
  function setFitMode(mode) {
    fitMode.value = mode === 'width' ? 'width' : 'page';
    zoom.value = 1;
    savePrefs();
  }
  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
    savePrefs();
  }

  function setZoom(z) {
    zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
  }
  function setPageAspect(w, h) {
    if (pageAspectMeasured || !w || !h) return;
    const ratio = w / h;
    if (ratio < 0.3 || ratio > 1.5) return; // ignore a stray odd-sized image (e.g. a fold-out or a broken render)
    pageAspectMeasured = true;
    pageAspect.value = ratio;
  }
  function resetZoom() {
    zoom.value = 1;
  }
  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;
    try { localStorage.setItem('epaper.pageSound', soundEnabled.value ? 'on' : 'off'); } catch { /* storage blocked — the toggle still works for this visit */ }
  }

  return {
    currentDate, currentPublication, edition, viewMode, effectiveViewMode, viewModeManuallySet, currentIndex, animating, loading, loadError,
    zoom, soundEnabled, pageAspect, layoutCompact, fitMode, sidebarOpen, scrollRequest,
    doubleViews, singleViews, activeViews, currentView, atStart, atEnd, sections, currentSection,
    loadEdition, setViewMode, savedViewMode, turn, jumpTo, todayIso, setZoom, resetZoom, setPageAspect, toggleSound, restoreSoundPref,
    setLayoutCompact, setIndexFromScroll, setFitMode, toggleSidebar, restoreReaderPrefs
  };
});