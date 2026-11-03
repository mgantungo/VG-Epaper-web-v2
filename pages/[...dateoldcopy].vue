<script setup>
/**
 * Route: /[...date]                                   MODIFIED (Phase 0)
 *   /nv                 New Vision, today's edition (or its latest, if none today)
 *   /nv/2026/10/22      New Vision for that date
 *   /nvw/2026/10/25     the weekend edition covering that day (dated Sat 24)
 *   /2026/10/22         older links: redirected to /nv/2026/10/22
 * "/" itself is the landing page (pages/index.vue), where readers pick a paper.
 *
 * Phases 1–4: the reading tracker follows the pages on screen, stories
 * pulled out and the paywall (composables/useReadingTracker.js).
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from '#imports';
import { NuxtLink } from '#components';
import { useReaderStore } from '~/stores/reader';
import { useAccountStore } from '~/stores/account';
import { useResponsiveReaderMode } from '~/composables/useBreakpoint';
import EpaperToolbar from '~/components/reader/EpaperToolbar.vue';
import BookReader from '~/components/reader/BookReader.vue';
import SideNavPrev from '~/components/reader/SideNavPrev.vue';
import SideNavNext from '~/components/reader/SideNavNext.vue';
import PulloutPanel from '~/components/reader/PulloutPanel.vue';
import ArchiveModal from '~/components/reader/ArchiveModal.vue';
import PaywallModal from '~/components/reader/PaywallModal.vue';
import SearchOverlay from '~/components/reader/SearchOverlay.vue';
import ContentsDrawer from '~/components/reader/ContentsDrawer.vue';
import { useReadingTracker, setNextVia } from '~/composables/useReadingTracker';

const route = useRoute();
const router = useRouter();
const reader = useReaderStore();
const account = useAccountStore();

const bookReaderRef = ref(null);
const openStory = ref(null);
const archiveOpen = ref(false);
const paywallOpen = ref(false);
const searchOpen = ref(false);
const contentsOpen = ref(false);
const tracker = useReadingTracker();
watch(openStory, (story) => tracker.storyChanged(reader, story));
watch(paywallOpen, (open) => {
  if (open && reader.edition?.locked) tracker.paywallShown(reader.edition.publicationCode, reader.edition.date);
});

const parts = computed(() => {
  const p = route.params.date;
  return Array.isArray(p) ? p : (p ? [p] : []);
});
const isLegacyDateUrl = computed(() => /^\d{4}$/.test(parts.value[0] || ''));
const publication = computed(() => {
  const first = parts.value[0] || '';
  return !isLegacyDateUrl.value && /^[A-Za-z0-9]{1,12}$/.test(first) ? first.toUpperCase() : 'NV';
});
// 'today' when the URL has no date: today's edition, falling back to the
// latest (a weekend or monthly paper has no edition most days).
const requestedDate = computed(() => {
  const rest = isLegacyDateUrl.value ? parts.value : parts.value.slice(1);
  if (rest.length === 3) {
    const [y, m, d] = rest;
    return `${y}-${m}-${d}`;
  }
  return 'today';
});
// The date of the edition actually shown (what the paywall and archive use).
const dateIso = computed(() => reader.edition?.date || (requestedDate.value === 'today' ? reader.todayIso() : requestedDate.value));

// Responsive default: single-page on mobile/tablet, spread on desktop.
useResponsiveReaderMode();

function editionPath(pub, iso) {
  const base = `/${String(pub).toLowerCase()}`;
  if (!iso) return base;
  const [y, m, d] = iso.split('-');
  return `${base}/${y}/${m}/${d}`;
}
async function openDate(iso) {
  await router.push(editionPath(publication.value, iso));
}

// Account/entitlement state depends entirely on browser-only mechanisms —
// the access-token cookie and Strapi's httpOnly refresh cookie — neither of
// which a plain server-side fetch() automatically carries the way a real
// browser request does. Running this during SSR meant every initial page
// load silently 401'd server-side with no cookie attached at all, which is
// what was actually behind the repeated "Sign in required" errors — not
// anything wrong with the refresh logic itself. So: no `immediate: true`
// here (that would still fire during SSR); the first load happens in
// onMounted below instead, which never runs on the server, only once
// hydrated in the real browser. Subsequent client-side route changes (e.g.
// picking an archive date) still go through this watcher normally.
// route.path, not fullPath: clearing an old ?p= from the address (below)
// must not reload the edition.
watch(() => route.path, load);

// ---- remembering the reader's page --------------------------------------
// The page being read is kept in the browser, NOT in the address, so the
// URL stays the plain edition address (/nv/2026/10/29):
//  - sessionStorage, per tab: a browser refresh, or a phone reloading a tab
//    it discarded in the background, reopens on the same page — and two
//    tabs on the same edition each keep their own page;
//  - localStorage, per edition: reopening that edition later (a new tab,
//    plain /nv the same day) picks up where the reader left off.
// In a two-page spread it records the left-hand page; opening in either
// mode lands on the view containing it. Links made while the page was in
// the address (?p=4) still open on that page, and the ?p= is then removed.
const TAB_PAGE_KEY = 'epaper.tabPage';
const LAST_PAGE_KEY = 'epaper.lastPage';
// False while an edition is loading and its saved page is being restored:
// the moment the edition arrives it briefly shows page 1, and recording
// THAT would overwrite the very page we're about to restore.
let pageMemoryReady = false;
function editionKey() {
  return `${reader.edition?.publicationCode || publication.value}.${reader.edition?.date}`;
}
function readPage(storage, prefix) {
  try { return Number(storage.getItem(`${prefix}.${editionKey()}`)) || null; } catch { return null; }
}
function savePage(num) {
  for (const [storage, prefix] of [[sessionStorage, TAB_PAGE_KEY], [localStorage, LAST_PAGE_KEY]]) {
    try {
      if (num > 1) storage.setItem(`${prefix}.${editionKey()}`, String(num));
      else storage.removeItem(`${prefix}.${editionKey()}`);
    } catch { /* storage blocked — the page just isn't remembered */ }
  }
}
function shownPageNumber() {
  const v = reader.currentView;
  const nums = [v.left?.pageNumber, v.right?.pageNumber].filter((n) => n != null);
  return nums.length ? Math.min(...nums) : null;
}
function restorePage() {
  if (!reader.edition || reader.edition.locked) return;
  const fromOldLink = Number(route.query.p) || null;
  const wanted = fromOldLink || readPage(sessionStorage, TAB_PAGE_KEY) || readPage(localStorage, LAST_PAGE_KEY);
  if (wanted && wanted > 1) reader.jumpTo(wanted);
}
// Turn page memory back on only after the restore has rendered; record where
// the reader actually is and clear any old ?p= out of the address.
function enablePageMemory() {
  nextTick(() => {
    pageMemoryReady = true;
    const num = shownPageNumber();
    if (num != null && reader.edition && !reader.edition.locked) savePage(num);
    if (route.query.p !== undefined) {
      const query = { ...route.query };
      delete query.p;
      router.replace({ path: route.path, query, hash: route.hash });
    }
  });
}
watch(shownPageNumber, (num) => {
  if (!pageMemoryReady || reader.loading || !reader.edition || reader.edition.locked || num == null) return;
  savePage(num);
});

async function load() {
  pageMemoryReady = false;
  if (isLegacyDateUrl.value) {
    await router.replace(editionPath('NV', requestedDate.value));
    return;
  }
  await account.refresh();
  await reader.loadEdition(publication.value, requestedDate.value);
  if (requestedDate.value === 'today' && reader.loadError === 'not_found') {
    await reader.loadEdition(publication.value, 'latest');
  }
  restorePage();
  enablePageMemory();
  archiveOpen.value = false;
  paywallOpen.value = Boolean(reader.edition?.locked);
}

// The usage hint now floats over the paper, so it fades after a few seconds
// or on the first page turn instead of permanently costing a line of height.
const showHint = ref(true);
let hintTimer = null;

function handleTurn(direction) {
  showHint.value = false;
  bookReaderRef.value?.animateTurn(direction);
}
function handleFirst() {
  if (reader.edition?.pages?.[0]) reader.jumpTo(reader.edition.pages[0].pageNumber);
}
function handleLast() {
  const pages = reader.edition?.pages || [];
  if (pages.length) reader.jumpTo(pages[pages.length - 1].pageNumber);
}
function handleSelectArchiveDate(iso) {
  setNextVia('archive');
  openDate(iso);
}

function closePaywall() {
  paywallOpen.value = false;
}

function onKeydown(e) {
  if (openStory.value) { if (e.key === 'Escape') openStory.value = null; return; }
  if (paywallOpen.value) { if (e.key === 'Escape') closePaywall(); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); handleTurn('next'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); handleTurn('prev'); }
  else if (e.key === 'Escape') { archiveOpen.value = false; searchOpen.value = false; contentsOpen.value = false; }
}
let stopTracking = null;
onMounted(() => {
  hintTimer = setTimeout(() => { showHint.value = false; }, 7000);
  load();
  stopTracking = tracker.watchReader(reader);
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  clearTimeout(hintTimer);
  window.removeEventListener('keydown', onKeydown);
  stopTracking?.();
  tracker.flushNow();
});
</script>

<template>
  <div class="reader-page flex flex-col items-center overflow-hidden">
    <EpaperToolbar
      @turn="handleTurn"
      @first="handleFirst"
      @last="handleLast"
      @open-archive="archiveOpen = true"
      @open-search="searchOpen = true"
      @open-contents="contentsOpen = true"
    />

    <div class="pt-[40px] sm:pt-[44px] w-full flex-1 min-h-0 flex flex-col items-center justify-center">
      <div v-if="reader.loading" class="text-neutral-400 font-mono text-sm">Loading edition…</div>
      <div v-else-if="reader.loadError" class="text-neutral-400 font-mono text-sm text-center px-6">
        <template v-if="reader.loadError === 'not_found'">
          No {{ publication }} edition covers {{ requestedDate === 'today' ? 'today' : requestedDate }}.
          <span class="block mt-3">
            <NuxtLink :to="editionPath(publication)" class="underline text-neutral-200">Latest {{ publication }} edition</NuxtLink>
            <span class="mx-2">·</span>
            <NuxtLink to="/" class="underline text-neutral-200">All publications</NuxtLink>
          </span>
        </template>
        <template v-else>Something went wrong loading this edition. Please try again.</template>
      </div>
      <!-- The book fills the stage; arrows and hint float over it so they
           don't take space away from the paper (see .reader-stage). -->
      <div v-else class="relative flex-1 min-h-0 w-full flex flex-col">
        <div class="reader-stage">
          <BookReader ref="bookReaderRef" @open-pullout="openStory = $event" />
        </div>
        <SideNavPrev @turn="handleTurn" />
        <SideNavNext @turn="handleTurn" />
        <p
          class="hidden sm:block absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-mono text-[10px] text-neutral-200 bg-neutral-900/80 rounded px-3 py-1.5 whitespace-nowrap transition-opacity duration-500"
          :class="showHint ? 'opacity-100' : 'opacity-0'"
        >
          Click a highlighted story to pull it out · use the side arrows, toolbar, or ← → keys to turn pages
        </p>
      </div>
    </div>

    <PulloutPanel :story="openStory" @close="openStory = null" />
    <ArchiveModal :open="archiveOpen" :publication="publication" @close="archiveOpen = false" @select-date="handleSelectArchiveDate" />
    <SearchOverlay :open="searchOpen" @close="searchOpen = false" @open-pullout="openStory = $event" />
    <ContentsDrawer :open="contentsOpen" @close="contentsOpen = false" />
    <PaywallModal
      :open="paywallOpen"
      :publication="publication"
      :edition="reader.edition"
      :date-iso="dateIso"
      @close="closePaywall"
    />
  </div>
</template>