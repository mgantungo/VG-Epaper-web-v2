<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from '#imports';
import { NuxtLink } from '#components';
import { useReaderStore, ZOOM_MIN, ZOOM_MAX } from '~/stores/reader';
import { useAccountStore } from '~/stores/account';
import { useToolbarBreakpoint } from '~/composables/useToolbarBreakpoint';
// Organisations: a "Manage organisation" row in the ≡ menu, rendered only
// for Organisation Admins (see the component). In the menu at every tier,
// never inline, so the toolbar row's width is unchanged.
import OrgAdminLink from '~/components/OrgAdminLink.vue';

const route = useRoute();
const reader = useReaderStore();
const account = useAccountStore();
const { isMobile, isTablet, isDesktop, isLaptopUp, isTabletWideUp } = useToolbarBreakpoint();
const emit = defineEmits(['turn', 'first', 'last', 'open-archive', 'open-search', 'open-contents']);

const pageIndicator = computed(() => {
  const v = reader.currentView;
  const count = reader.edition?.pageCount ?? 0;
  if (reader.viewMode === 'single') return `${v.right?.pageNumber ?? '–'} / ${count}`;
  if (v.left && v.right) return `${v.left.pageNumber}\u2013${v.right.pageNumber} / ${count}`;
  return `${(v.left ?? v.right)?.pageNumber ?? '–'} / ${count}`;
});

// Info and the hamburger menu are small, self-contained popovers (no page
// image/pullout state involved), so they're handled entirely within this
// component — unlike Archive/Search/Contents, which need to affect state
// that lives up in pages/[...date].vue (jumping pages, opening a pullout),
// so those stay as emitted events the same way `open-archive` always was.
const infoOpen = ref(false);
const menuOpen = ref(false);
function closePopovers() { infoOpen.value = false; menuOpen.value = false; }
function toggleInfo() { const next = !infoOpen.value; closePopovers(); infoOpen.value = next; }
function toggleMenu() { const next = !menuOpen.value; closePopovers(); menuOpen.value = next; }

function onDocClick(e) {
  if (!e.target.closest?.('.tb-popover-wrap')) closePopovers();
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  reader.restoreSoundPref?.(); // optional-call: a toolbar deployed ahead of stores/reader.js must not 500 the page
});
onUnmounted(() => document.removeEventListener('click', onDocClick));

/**
 * Search/Contents/Archive are identical in shape — an icon, a label, and an
 * emitted event — so they're defined once here and rendered via v-for
 * below, either as inline pill buttons or as menu rows, instead of being
 * hand-written twice in two places. That duplication is exactly how this
 * file drifted before: the inline and in-menu copies of each button were
 * edited independently over several rounds and quietly went out of sync.
 * Info and sign-in keep their own explicit markup — a detail panel, and
 * conditional logged-in/out state respectively — genuinely different
 * shapes that a generic loop would obscure rather than simplify.
 */
const actionItems = [
  { key: 'search', label: 'Search', emitName: 'open-search' },
  { key: 'contents', label: 'Contents', emitName: 'open-contents' },
  { key: 'archive', label: 'Archive', emitName: 'open-archive' }
];

// Three explicit tiers (see composables/useToolbarBreakpoint.js for why a
// single sm: breakpoint wasn't enough): mobile shows none of these inline,
// tablet shows search+contents (archive/menu/sign-in confirmed by direct
// testing NOT to fit even at 956px), desktop shows all three.
const inlineActionKeys = computed(() => {
  if (isDesktop.value) return ['search', 'contents', 'archive'];
  // Archive is inline on any desktop-class screen (1024px and up), so a
  // laptop window just under 1280px doesn't hide it in the ≡ menu.
  // Between 640 and 767px there's no room for any of them inline.
  if (isTablet.value) {
    if (isLaptopUp.value) return ['search', 'contents', 'archive'];
    return isTabletWideUp.value ? ['search', 'contents'] : [];
  }
  return [];
});
const inlineActions = computed(() => actionItems.filter(i => inlineActionKeys.value.includes(i.key)));
const menuActions = computed(() => actionItems.filter(i => !inlineActionKeys.value.includes(i.key)));

const showInfoInline = computed(() => isTablet.value || isDesktop.value);
const showSignInInline = computed(() => isDesktop.value);
const showSoundInline = computed(() => isLaptopUp.value);
</script>

<template>
  <div class="fixed top-0 left-0 right-0 h-[40px] sm:h-[44px] z-[200] bg-neutral-900 border-b border-black flex items-stretch shadow-lg">
    <div class="flex items-center gap-1.5 px-2 sm:gap-2 sm:px-3 flex-none">
      <!-- Phase 0: the logo leads back to the landing page, where readers pick a paper -->
      <NuxtLink to="/" aria-label="All publications" class="flex-none">
        <img src="/logo.png" alt="" class="w-7 h-7 sm:w-8 sm:h-8 rounded object-contain" />
      </NuxtLink>
      <!-- Publication name, date and Vol./No. used to sit here; they're printed
           on the page itself and still listed in the (i) Info panel, so the
           space goes to the toolbar controls instead. -->
    </div>
    <div class="w-px bg-neutral-700 my-2.5 mx-0.5 sm:mx-1" />

    <!-- fit-screen + zoom -->
    <div class="flex items-center gap-0.5 px-1 sm:gap-1 sm:px-2 flex-none">
      <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white flex items-center justify-center" title="Fit to screen" @click="reader.resetZoom()">
        <svg viewBox="0 0 24 24" class="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
        </svg>
      </button>
      <button class="w-6 h-8 sm:w-7 sm:h-9 text-neutral-300 hover:text-white disabled:opacity-30 flex items-center justify-center text-lg sm:text-2xl leading-none" :disabled="reader.zoom <= ZOOM_MIN" title="Zoom out" @click="reader.setZoom(reader.zoom - 0.25)">−</button>
      <input
        v-if="isLaptopUp"
        type="range" :min="ZOOM_MIN" :max="ZOOM_MAX" step="0.05" :value="reader.zoom"
        class="tb-slider w-12 sm:w-20" title="Zoom"
        @input="reader.setZoom(Number($event.target.value))"
      >
      <button class="w-6 h-8 sm:w-7 sm:h-9 text-neutral-300 hover:text-white disabled:opacity-30 flex items-center justify-center text-lg sm:text-2xl leading-none" :disabled="reader.zoom >= ZOOM_MAX" title="Zoom in" @click="reader.setZoom(reader.zoom + 0.25)">+</button>
      <span v-if="isLaptopUp" class="font-mono text-[9.5px] text-neutral-500 w-8 text-center">{{ Math.round(reader.zoom * 100) }}%</span>
    </div>
    <div v-if="!isMobile" class="w-px bg-neutral-700 my-2.5 mx-0.5 sm:mx-1" />

    <!-- single/double page mode — not on phones: effectiveViewMode is always
         'single' there, so these buttons did nothing but push the ≡ menu
         off-screen -->
    <div v-if="!isMobile" class="flex items-center gap-0.5 px-1 sm:gap-1 sm:px-2 flex-none">
      <button
        class="w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center border"
        :class="reader.viewMode === 'single' ? 'border-neutral-400 text-white' : 'border-transparent text-neutral-300 hover:text-white'"
        title="Single page"
        @click="reader.setViewMode('single', true)"
      >
        <svg viewBox="0 0 24 24" class="w-[17px] h-[17px] sm:w-[21px] sm:h-[21px]" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="6" y="3" width="12" height="18" rx="1.5" />
        </svg>
      </button>
      <button
        class="w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center border"
        :class="reader.viewMode === 'double' ? 'border-neutral-400 text-white' : 'border-transparent text-neutral-300 hover:text-white'"
        title="Two-page spread"
        @click="reader.setViewMode('double', true)"
      >
        <svg viewBox="0 0 24 24" class="w-[19px] h-[17px] sm:w-[24px] sm:h-[21px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
          <path d="M6 4 L2 8 L2 20 L12 20 L12 4 Z" />
          <path d="M18 4 L22 8 L22 20 L12 20 L12 4 Z" />
        </svg>
      </button>
      <!-- page-turn sound on/off: inline on desktop-class widths; narrower
           screens use the same toggle in the ≡ menu (no room inline there) -->
      <button
        v-if="showSoundInline"
        class="tb-tip w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-700"
        :data-tip="reader.soundEnabled ? 'Page-turn sound: on (click to mute)' : 'Page-turn sound: off (click to unmute)'"
        :aria-label="reader.soundEnabled ? 'Mute page-turn sound' : 'Unmute page-turn sound'"
        :aria-pressed="reader.soundEnabled"
        @click="reader.toggleSound()"
      >
        <svg viewBox="0 0 24 24" class="w-[18px] h-[18px] sm:w-[21px] sm:h-[21px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          <template v-if="reader.soundEnabled">
            <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
            <path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8" />
          </template>
          <template v-else>
            <path d="M16 9.5l5 5" /><path d="M21 9.5l-5 5" />
          </template>
        </svg>
      </button>
    </div>

    <div class="flex-1" />

    <!-- navigation -->
    <div class="flex items-center gap-0.5 px-1 sm:gap-1 sm:px-2 flex-none">
      <button v-if="!isMobile" class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 disabled:opacity-30 text-lg sm:text-xl" :disabled="reader.atStart || reader.animating" @click="emit('first')">⏮</button>
      <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 disabled:opacity-30 text-xl sm:text-2xl" :disabled="reader.atStart || reader.animating" @click="emit('turn', 'prev')">‹</button>
      <span class="font-mono text-sm sm:text-base text-neutral-200 px-1 sm:px-2 min-w-[56px] sm:min-w-[76px] text-center">{{ pageIndicator }}</span>
      <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 disabled:opacity-30 text-xl sm:text-2xl" :disabled="reader.atEnd || reader.animating" @click="emit('turn', 'next')">›</button>
      <button v-if="!isMobile" class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 disabled:opacity-30 text-lg sm:text-xl" :disabled="reader.atEnd || reader.animating" @click="emit('last')">⏭</button>
    </div>

    <div class="flex-1" />

    <div class="flex items-center gap-1 px-2 sm:gap-2 sm:px-3 flex-none">
      <!-- info: shown inline from the tablet tier up -->
      <div v-if="showInfoInline" class="relative tb-popover-wrap">
        <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 text-lg sm:text-xl" title="Edition info" @click.stop="toggleInfo">ⓘ</button>
        <div v-if="infoOpen" class="absolute right-0 top-[calc(100%+6px)] sm:top-[calc(100%+4px)] w-72 bg-neutral-800 border border-neutral-600 rounded-lg shadow-2xl p-4 font-mono text-sm text-neutral-200 z-10">
          <div class="font-serif font-bold text-base text-white mb-2">Edition details</div>
          <div class="flex justify-between py-1.5 border-b border-neutral-700"><span>Date</span><span>{{ reader.edition?.date || '—' }}</span></div>
          <div class="flex justify-between py-1.5 border-b border-neutral-700"><span>Vol. / No.</span><span>{{ reader.edition?.volume || '—' }} / {{ reader.edition?.issueNumber || '—' }}</span></div>
          <div class="flex justify-between py-1.5 border-b border-neutral-700"><span>Pages</span><span>{{ reader.edition?.pageCount || '—' }}</span></div>
          <div class="flex justify-between py-1.5"><span>Cover price</span><span>{{ reader.edition?.coverPrice ? `${reader.edition.coverPrice} ${reader.edition.currency}` : '—' }}</span></div>
        </div>
      </div>

      <!-- generic action buttons, whichever ones this tier shows inline -->
      <button
        v-for="item in inlineActions" :key="item.key"
        class="flex items-center gap-2 h-8 sm:h-9 px-3 rounded-md border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700"
        :title="item.label"
        @click="emit(item.emitName)"
      >
        <svg v-if="item.key === 'contents'" viewBox="0 0 24 24" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 9h8" /><path d="M8 13h8" /><path d="M8 17h5" />
        </svg>
        <span v-else-if="item.key === 'search'">🔍</span>
        <template v-else>📦 {{ item.label }}</template>
      </button>

      <!-- Retractable menu — ALWAYS in this same spot at every tier;
           what's INSIDE it adapts to whichever items this tier didn't show
           inline above, via inlineActions/menuActions and showInfoInline/
           showSignInInline — all driven by useToolbarBreakpoint. -->
      <div class="relative tb-popover-wrap">
        <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-700 text-xl sm:text-2xl" title="Menu" @click.stop="toggleMenu">≡</button>
        <div v-if="menuOpen" class="absolute right-0 top-[calc(100%+6px)] sm:top-[calc(100%+4px)] w-72 bg-neutral-800 border border-neutral-600 rounded-lg shadow-2xl p-2 font-mono text-sm text-neutral-200 z-10 max-h-[80vh] overflow-y-auto">
          <template v-if="!showInfoInline && reader.edition">
            <div class="px-3 py-2">
              <div class="font-serif font-bold text-sm text-white mb-1">Edition details</div>
              <div class="text-[10.5px] text-neutral-300 leading-relaxed">
                {{ reader.edition.date }} · Vol.{{ reader.edition.volume || '—' }} No.{{ reader.edition.issueNumber || '—' }} · {{ reader.edition.pageCount || '—' }} pages
              </div>
            </div>
            <div class="border-t border-neutral-700 my-1" />
          </template>

          <button
            v-for="item in menuActions" :key="item.key"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-neutral-700 text-left"
            @click="closePopovers(); emit(item.emitName)"
          >
            <svg v-if="item.key === 'contents'" viewBox="0 0 24 24" class="w-4 h-4 flex-none" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 9h8" /><path d="M8 13h8" /><path d="M8 17h5" />
            </svg>
            <span v-else-if="item.key === 'search'">🔍</span>
            <span v-else>📦</span>
            <span>{{ item.label }}</span>
          </button>
          <div v-if="menuActions.length" class="border-t border-neutral-700 my-1" />

          <template v-if="!showSignInInline">
            <NuxtLink
              v-if="!account.loggedIn"
              :to="{ path: '/login', query: { redirect: route.fullPath } }"
              class="block w-full px-3 py-2 rounded-md hover:bg-neutral-700"
              @click="closePopovers()"
            >Sign in</NuxtLink>
            <div v-else class="flex items-center justify-between px-3 py-2">
              <span class="text-neutral-300 truncate max-w-[150px]">{{ account.user?.email || 'Account' }}</span>
              <button class="text-neutral-500 hover:text-white" @click="account.logout(); closePopovers()">Sign out</button>
            </div>
            <div class="border-t border-neutral-700 my-1" />
          </template>

          <!-- Organisation Admins only (renders nothing for anyone else).
               Lives in this menu at EVERY tier rather than inline, so it
               never adds width to the toolbar row itself. -->
          <OrgAdminLink
            v-if="account.loggedIn" :key="`menu-${account.user?.email || ''}`"
            class="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-neutral-700 text-white"
            @click="closePopovers()"
          ><span>🏢</span><span>Manage organisation</span><span class="ml-auto text-neutral-500">›</span></OrgAdminLink>

          <button v-if="!showSoundInline" class="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-neutral-700 text-left" @click="reader.toggleSound()">
            <span>Page-turn sound</span>
            <span class="w-7 h-4 rounded-full relative" :class="reader.soundEnabled ? 'bg-white/80' : 'bg-neutral-600'">
              <span class="absolute top-0.5 w-3 h-3 rounded-full bg-neutral-900 transition-all" :class="reader.soundEnabled ? 'left-3.5' : 'left-0.5'" />
            </span>
          </button>
          <div class="border-t border-neutral-700 my-1" />
          <div class="px-3 py-2 text-[9.5px] text-neutral-500 leading-relaxed">
            ← → to turn pages · Esc to close panels. Copying, selecting and printing are disabled in this edition.
          </div>
        </div>
      </div>

      <!-- sign-in / account: inline only at the desktop tier -->
      <template v-if="showSignInInline">
        <NuxtLink
          v-if="!account.loggedIn"
          :to="{ path: '/login', query: { redirect: route.fullPath } }"
          class="flex items-center h-8 sm:h-9 px-3 rounded-md border border-neutral-600 text-white text-sm font-mono hover:bg-neutral-700"
        >Sign in</NuxtLink>
        <div v-else class="flex items-center gap-2 h-8 sm:h-9 px-3 rounded-md border border-neutral-600 text-sm font-mono">
          <span class="text-neutral-300 truncate max-w-[120px]">{{ account.user?.email || 'Account' }}</span>
          <button class="text-neutral-500 hover:text-white" @click="account.logout()">Sign out</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Instant tooltip under a toolbar button (native title= takes ~1s and can't be styled). */
.tb-tip { position: relative; }
.tb-tip::after {
  content: attr(data-tip);
  position: absolute; top: calc(100% + 8px); left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px; border-radius: 4px;
  background: #262626; border: 1px solid #404040; color: #e5e5e5;
  font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 0.12s ease 0.15s;
  z-index: 10;
}
.tb-tip:hover::after, .tb-tip:focus-visible::after { opacity: 1; }
@media (hover: none) { .tb-tip::after { display: none; } }

/* Thin-line zoom slider — a native <input type=range> renders as a chunky
   default track/thumb otherwise. */
.tb-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: #525252; /* neutral-600 */
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}
.tb-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #d4d4d4; /* neutral-300 */
  cursor: pointer;
}
.tb-slider::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #d4d4d4;
  border: none;
  cursor: pointer;
}
.tb-slider::-moz-range-track {
  height: 3px;
  background: #525252;
  border-radius: 999px;
}
</style>