<!-- File: /var/www/VGEpaper/web/components/reader/ScrollReader.vue -->
<script setup>
/**
 * The reading area (replaces BookReader.vue's page flip, Nov 2026).
 *
 * Pages, or two-page spreads, sit one under another and the reader scrolls
 * up and down with touch, mouse wheel, trackpad or keyboard; each one
 * settles gently into place (CSS scroll snap, "proximity", so it never
 * fights a free scroll).
 *
 *  - compact (phones, tablets upright): one page at a time, as large as the
 *    screen allows, with only a sliver of the next page peeking at the
 *    bottom. Any room left under a page lists that page's stories.
 *  - wide (desktops, tablets on their side): single pages or spreads, fitted
 *    to the page (whole page on screen) or to the width, then zoomed.
 *
 * Every view has the same height, so position <-> view is simple arithmetic;
 * only the views near the screen mount a real PageFace, the rest are empty
 * boxes of the right size. The view on screen is reported to the store
 * (setIndexFromScroll); the store's scrollRequest moves us (Search,
 * Contents, Go to page, sections, keyboard, sidebar, page strip).
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useReaderStore } from '~/stores/reader';
import { usePageImages, prefetchWindow } from '~/composables/usePageImages';
import PageFace from './PageFace.vue';

const props = defineProps({ compact: { type: Boolean, default: false } });
const emit = defineEmits(['open-pullout', 'open-goto']);

const reader = useReaderStore();
const images = usePageImages();

const stage = ref(null);
const size = ref({ w: 0, h: 0 });
const scrollTop = ref(0);

const locked = computed(() => Boolean(reader.edition?.locked));
const views = computed(() => reader.activeViews);
const isDouble = computed(() => reader.effectiveViewMode === 'double');
const pageCount = computed(() => reader.edition?.pages?.length || 0);

// compact: padding, how much of the next page peeks, gap between pages
const C_PAD = 8, C_PEEK = 28, C_GAP = 10;
// wide: padding and gap
const W_PAD = 20, W_GAP = 20;

const geo = computed(() => {
  const { w, h } = size.value;
  if (!w || !h) return null;
  const ar = reader.pageAspect; // page width / height
  if (props.compact) {
    const slotH = Math.max(220, h - C_PAD - C_PEEK - C_GAP);
    const pageW = Math.min(w - 2 * C_PAD, slotH * ar);
    return { pad: C_PAD, gap: C_GAP, slotH, step: slotH + C_GAP, viewW: pageW, viewH: pageW / ar, pageW, innerW: w };
  }
  const viewAr = isDouble.value ? ar * 2 : ar;
  const availW = w - 2 * W_PAD;
  const availH = h - 2 * W_PAD;
  let viewW;
  let viewH;
  if (reader.fitMode === 'width') { viewW = availW; viewH = viewW / viewAr; }
  else { viewH = Math.min(availH, availW / viewAr); viewW = viewH * viewAr; }
  viewW *= reader.zoom;
  viewH *= reader.zoom;
  return {
    pad: W_PAD, gap: W_GAP, slotH: viewH, step: viewH + W_GAP,
    viewW, viewH, pageW: isDouble.value ? viewW / 2 : viewW,
    innerW: Math.max(w, viewW + 2 * W_PAD)
  };
});
// Room after the last view so it can scroll right up to the top.
const tailPad = computed(() => (geo.value ? Math.max(geo.value.pad, size.value.h - geo.value.slotH - geo.value.pad) : 0));
// Snap only while a whole view fits on screen; a zoomed-in page scrolls freely.
const snap = computed(() => Boolean(geo.value && geo.value.slotH <= size.value.h));

// Views close to the screen get a real page; the rest stay empty boxes.
const mounted = computed(() => {
  const g = geo.value;
  if (!g) return { from: 0, to: -1 };
  const from = Math.floor(scrollTop.value / g.step) - 1;
  const to = Math.floor((scrollTop.value + size.value.h) / g.step) + 1;
  return { from: Math.max(0, Math.min(from, reader.currentIndex - 1)), to: Math.max(to, reader.currentIndex + 1) };
});
function isMounted(i) {
  return i >= mounted.value.from && i <= mounted.value.to;
}

function viewKey(v, i) {
  return `${reader.effectiveViewMode}-${v.left?.pageNumber ?? 'x'}-${v.right?.pageNumber ?? 'x'}-${i}`;
}

// compact: the stories of a page, listed in the room under it
function storiesFor(page) {
  const g = geo.value;
  if (!g || !page || locked.value) return [];
  const room = g.slotH - g.viewH - 12;
  const fits = Math.floor((room - 26) / 52);
  if (fits < 1) return [];
  return (page.stories || []).filter((s) => s.headline).slice(0, fits);
}

// ---- scrolling ---------------------------------------------------------
let programmaticUntil = 0;
let settleTimer = null;
let rafPending = false;

function indexAt(top) {
  const g = geo.value;
  if (!g) return 0;
  return Math.max(0, Math.min(views.value.length - 1, Math.floor((top + g.step * 0.4) / g.step)));
}
function report() {
  if (stage.value) reader.setIndexFromScroll(indexAt(stage.value.scrollTop));
}
function onScroll() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (stage.value) scrollTop.value = stage.value.scrollTop;
    });
  }
  // While we're scrolling somewhere on purpose, don't report the views we
  // pass on the way (the reading tracker would count them as read).
  clearTimeout(settleTimer);
  if (Date.now() < programmaticUntil) {
    settleTimer = setTimeout(() => { programmaticUntil = 0; report(); }, 160);
    return;
  }
  report();
}
function scrollToIndex(i, smooth) {
  const g = geo.value;
  if (!stage.value || !g) return;
  const top = i * g.step;
  programmaticUntil = Date.now() + (smooth ? 1500 : 120);
  stage.value.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  if (!smooth) scrollTop.value = top;
}
function centreHorizontally() {
  const g = geo.value;
  if (stage.value && g) stage.value.scrollLeft = Math.max(0, (g.innerW - size.value.w) / 2);
}

watch(() => reader.scrollRequest, (r) => { if (r) scrollToIndex(r.index, r.smooth); });
// Size, layout, fit or zoom changed: stay on the same view.
watch(() => [geo.value?.step, geo.value?.innerW], () => nextTick(() => {
  scrollToIndex(reader.currentIndex, false);
  centreHorizontally();
}));

// ---- background loading ------------------------------------------------
function pagesOf(v) {
  return [v?.left, v?.right].filter(Boolean);
}
watch(() => [reader.currentIndex, views.value, locked.value], () => {
  if (locked.value || !views.value.length) return;
  const { ahead, behind } = prefetchWindow();
  const i = reader.currentIndex;
  const order = [i];
  for (let d = 1; d <= ahead; d++) {
    order.push(i + d);
    if (d <= behind) order.push(i - d);
  }
  const urls = order
    .filter((k) => k >= 0 && k < views.value.length)
    .flatMap((k) => pagesOf(views.value[k]))
    .map((p) => p.imageUrl)
    .filter(Boolean);
  images.prefetch(urls);
}, { immediate: true });

// ---- sizing ------------------------------------------------------------
let ro = null;
function measure() {
  if (stage.value) size.value = { w: stage.value.clientWidth, h: stage.value.clientHeight };
}
onMounted(() => {
  measure();
  ro = new ResizeObserver(measure);
  ro.observe(stage.value);
});
onUnmounted(() => {
  ro?.disconnect();
  clearTimeout(settleTimer);
});

const indicator = computed(() => {
  const v = reader.currentView;
  const nums = pagesOf(v).map((p) => p.pageNumber);
  return `${nums.join('–') || '–'} / ${pageCount.value}`;
});
</script>

<template>
  <div class="relative flex-1 min-h-0 min-w-0">
    <div
      ref="stage"
      class="rs-stage absolute inset-0 overflow-auto"
      :class="{ 'rs-snap': snap }"
      :style="{ scrollPaddingTop: (geo?.pad || 0) + 'px' }"
      tabindex="0"
      aria-label="Newspaper pages. Scroll, or use the arrow keys, to move between pages."
      @scroll.passive="onScroll"
    >
      <div v-if="geo" :style="{ width: geo.innerW + 'px', paddingTop: geo.pad + 'px', paddingBottom: tailPad + 'px' }">
        <div
          v-for="(v, i) in views"
          :key="viewKey(v, i)"
          class="rs-slot flex flex-col items-center"
          :style="{ height: geo.slotH + 'px', marginBottom: i < views.length - 1 ? geo.gap + 'px' : '0' }"
        >
          <!-- wide: a single page or a spread -->
          <div v-if="!compact" class="flex flex-none" :style="{ width: geo.viewW + 'px', height: geo.viewH + 'px' }">
            <template v-if="isDouble">
              <div class="relative h-full" :style="{ width: geo.pageW + 'px' }">
                <div v-if="v.left" class="rs-page rs-left absolute inset-0">
                  <PageFace v-if="isMounted(i)" :page="v.left" :locked="locked" @open-pullout="emit('open-pullout', $event)" />
                  <div v-else class="rs-empty">{{ v.left.pageNumber }}</div>
                </div>
              </div>
              <div class="relative h-full" :style="{ width: geo.pageW + 'px' }">
                <div v-if="v.right" class="rs-page rs-right absolute inset-0">
                  <PageFace v-if="isMounted(i)" :page="v.right" :locked="locked" @open-pullout="emit('open-pullout', $event)" />
                  <div v-else class="rs-empty">{{ v.right.pageNumber }}</div>
                </div>
              </div>
            </template>
            <div v-else class="rs-page relative h-full w-full">
              <PageFace v-if="isMounted(i)" :page="v.right" :locked="locked" @open-pullout="emit('open-pullout', $event)" />
              <div v-else class="rs-empty">{{ v.right.pageNumber }}</div>
            </div>
          </div>

          <!-- compact: one page, its number, and its stories underneath -->
          <template v-else>
            <div class="rs-page relative flex-none" :style="{ width: geo.viewW + 'px', height: geo.viewH + 'px' }">
              <PageFace v-if="isMounted(i)" :page="v.right" :locked="locked" @open-pullout="emit('open-pullout', $event)" />
              <div v-else class="rs-empty">{{ v.right.pageNumber }}</div>
              <span class="absolute right-2 bottom-2 font-mono text-[11px] bg-neutral-950/80 text-neutral-100 px-1.5 py-0.5 rounded pointer-events-none">{{ v.right.pageNumber }}</span>
            </div>
            <div v-if="storiesFor(v.right).length" class="w-full flex-1 min-h-0 overflow-hidden flex flex-col gap-1.5 pt-3" :style="{ maxWidth: geo.viewW + 'px' }">
              <div class="text-[11px] tracking-[0.08em] uppercase text-neutral-400">
                On page {{ v.right.pageNumber }}<template v-if="v.right.section"> · {{ v.right.section }}</template>
              </div>
              <button
                v-for="s in storiesFor(v.right)"
                :key="s.id"
                type="button"
                class="min-h-[44px] flex items-center justify-between gap-3 px-3 rounded-lg bg-neutral-900 border border-neutral-800 text-left text-sm text-neutral-100 active:bg-neutral-800"
                @click="emit('open-pullout', s)"
              >
                <span class="truncate">{{ s.headline }}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" class="flex-none text-neutral-500"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- wide: where you are, with a click target for mouse users -->
    <div v-if="!compact && views.length" class="absolute left-1/2 bottom-4 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-full bg-neutral-900/95 border border-neutral-700 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      <button type="button" class="w-10 h-10 rounded-full text-neutral-100 hover:bg-neutral-800 disabled:opacity-30 flex items-center justify-center" :disabled="reader.atStart" aria-label="Previous page" @click="reader.turn('prev')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      <button type="button" class="h-10 px-3 rounded-full font-mono text-sm text-neutral-100 hover:bg-neutral-800" title="Go to page" @click="emit('open-goto')">{{ indicator }}</button>
      <button type="button" class="w-10 h-10 rounded-full text-neutral-100 hover:bg-neutral-800 disabled:opacity-30 flex items-center justify-center" :disabled="reader.atEnd" aria-label="Next page" @click="reader.turn('next')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.rs-stage { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; outline: none; }
.rs-stage.rs-snap { scroll-snap-type: y proximity; }
.rs-slot { scroll-snap-align: start; }
.rs-page { background: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55); }
.rs-left { box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), inset -24px 0 24px -22px rgba(0, 0, 0, 0.25); }
.rs-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #f1f1f1; color: #9a9a9a; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.rs-stage::-webkit-scrollbar { width: 10px; height: 10px; }
.rs-stage::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 5px; border: 2px solid #0a0a0a; }
.rs-stage::-webkit-scrollbar-track { background: transparent; }
</style>