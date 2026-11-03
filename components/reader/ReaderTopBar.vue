<!-- File: /var/www/VGEpaper/web/components/reader/ReaderTopBar.vue -->
<script setup>
/**
 * The reader's top bar (replaces EpaperToolbar.vue, Nov 2026).
 *
 * compact (phones, tablets upright): paper and date; Search, Archive and —
 *   for Organisation Admins — Organisation, always visible with labels;
 *   More (edition details, contents, go to page, sign in/out). The section
 *   chips sit in a second row underneath.
 * wide (desktops, tablets on their side): sidebar toggle, paper and date,
 *   section tabs, zoom and fit, single/double, Search, Archive,
 *   Organisation, More.
 * Nothing about page turning lives here any more: the reader scrolls.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from '#imports';
import { NuxtLink } from '#components';
import { useReaderStore, ZOOM_MIN, ZOOM_MAX } from '~/stores/reader';
import { useAccountStore } from '~/stores/account';
import OrgAdminLink from '~/components/OrgAdminLink.vue';
import SectionBar from './SectionBar.vue';

const props = defineProps({ compact: { type: Boolean, default: false } });
const emit = defineEmits(['open-archive', 'open-search', 'open-contents', 'open-goto']);

const route = useRoute();
const reader = useReaderStore();
const account = useAccountStore();

const paperName = computed(() => reader.edition?.publication?.name || 'New Vision');
const dateLabel = computed(() => {
  const e = reader.edition;
  if (!e?.date) return '';
  const d = new Date(`${e.date}T00:00:00`);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (e.coversTo && e.coversTo !== e.date) {
    const to = new Date(`${e.coversTo}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day} – ${to}`;
  }
  return day;
});

// The sidebar button pulses to draw the eye: 3 pulses when the reader
// opens, and 3 more each time it's clicked (hidden or shown). Bumping the
// key restarts the CSS animation. Off for anyone who asks their system to
// reduce motion (see the style block).
const sidebarPulseKey = ref(0);
function toggleSidebar() {
  reader.toggleSidebar();
  sidebarPulseKey.value++;
}

const menuOpen = ref(false);
function onDocClick(e) {
  if (!e.target.closest?.('.rtb-menu-wrap')) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));

function pick(name) {
  menuOpen.value = false;
  emit(name);
}
function signOut() {
  menuOpen.value = false;
  account.logout();
}
</script>

<template>
  <header class="flex-none bg-neutral-900 border-b border-neutral-800 select-none">
    <!-- ================= compact ================= -->
    <template v-if="compact">
      <div class="h-[52px] flex items-center gap-2 pl-3 pr-1.5">
        <NuxtLink to="/" aria-label="All papers" class="flex-none">
          <img src="/logo.png" alt="" class="w-8 h-8 rounded object-contain" />
        </NuxtLink>
        <div class="flex-1 min-w-0 flex flex-col leading-tight">
          <span class="font-semibold text-[15px] text-neutral-100 truncate">{{ paperName }}</span>
          <span class="text-xs text-neutral-400 truncate">{{ dateLabel }}</span>
        </div>
        <button type="button" class="rtb-btn" @click="emit('open-search')">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>Search
        </button>
        <button type="button" class="rtb-btn" @click="emit('open-archive')">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>Archive
        </button>
        <OrgAdminLink v-if="account.loggedIn" :key="`c-${account.user?.email || ''}`" class="rtb-btn">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5l8-2v18M12 8h8v13M4 21h16" /></svg>Org
        </OrgAdminLink>
        <div class="relative rtb-menu-wrap">
          <button type="button" class="rtb-btn" :aria-expanded="menuOpen" @click.stop="menuOpen = !menuOpen">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>More
          </button>
          <div v-if="menuOpen" class="rtb-menu">
            <div v-if="reader.edition" class="px-3 py-2 text-[12px] text-neutral-300 leading-relaxed border-b border-neutral-700 mb-1">
              <div class="font-semibold text-sm text-white mb-0.5">{{ paperName }}</div>
              {{ dateLabel }} · Vol.{{ reader.edition.volume || '—' }} No.{{ reader.edition.issueNumber || '—' }} · {{ reader.edition.pages?.length || 0 }} pages
            </div>
            <button type="button" class="rtb-item" @click="pick('open-goto')">Go to page</button>
            <button type="button" class="rtb-item" @click="pick('open-contents')">Contents</button>
            <div class="border-t border-neutral-700 my-1" />
            <NuxtLink v-if="!account.loggedIn" :to="{ path: '/login', query: { redirect: route.fullPath } }" class="rtb-item block" @click="menuOpen = false">Sign in</NuxtLink>
            <div v-else class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span class="text-neutral-300 truncate">{{ account.user?.email || 'Account' }}</span>
              <button type="button" class="text-neutral-400 hover:text-white flex-none" @click="signOut">Sign out</button>
            </div>
            <div class="border-t border-neutral-700 my-1" />
            <div class="px-3 py-2 text-[11px] text-neutral-500 leading-relaxed">Copying, selecting and printing are turned off for this edition.</div>
          </div>
        </div>
      </div>
      <SectionBar variant="chips" class="border-t border-neutral-800" />
    </template>

    <!-- ================= wide ================= -->
    <div v-else class="h-[52px] flex items-stretch">
      <div class="w-[196px] flex-none flex items-center gap-2 px-2.5 border-r border-neutral-800">
        <button
          type="button"
          class="relative w-9 h-9 rounded-md flex items-center justify-center flex-none"
          :class="reader.sidebarOpen ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' : 'text-white bg-neutral-800 hover:bg-neutral-700'"
          :aria-pressed="reader.sidebarOpen"
          :title="reader.sidebarOpen ? 'Hide pages' : 'Show pages'"
          @click="toggleSidebar"
        >
          <span :key="sidebarPulseKey" class="rtb-pulse" aria-hidden="true" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path v-if="reader.sidebarOpen" d="M4.5 7.5h3M4.5 11h3M4.5 14.5h3" />
          </svg>
        </button>
        <NuxtLink to="/" aria-label="All papers" class="flex-none">
          <img src="/logo.png" alt="" class="w-8 h-8 rounded object-contain" />
        </NuxtLink>
        <div class="min-w-0 flex flex-col leading-tight">
          <span class="font-semibold text-sm text-neutral-100 truncate">{{ paperName }}</span>
          <span class="text-[11px] text-neutral-400 truncate">{{ dateLabel }}</span>
        </div>
      </div>

      <div class="flex-1 min-w-0 flex justify-center px-2">
        <SectionBar variant="tabs" class="max-w-full" />
      </div>

      <div class="flex-none flex items-center gap-1 pr-2.5">
        <div class="flex items-center gap-0.5 mr-1" role="group" aria-label="Zoom">
          <button type="button" class="w-8 h-8 rounded text-xl text-neutral-300 hover:text-white disabled:opacity-30" :disabled="reader.zoom <= ZOOM_MIN" aria-label="Zoom out" @click="reader.setZoom(reader.zoom - 0.25)">−</button>
          <button
            type="button"
            class="h-8 px-2.5 rounded-md bg-neutral-800 border border-neutral-700 font-mono text-[12px] text-neutral-200 hover:border-neutral-500 whitespace-nowrap"
            :title="reader.fitMode === 'page' ? 'Showing whole pages — click to fill the width' : 'Filling the width — click to show whole pages'"
            @click="reader.setFitMode(reader.fitMode === 'page' ? 'width' : 'page')"
          >{{ reader.zoom !== 1 ? `${Math.round(reader.zoom * 100)}%` : (reader.fitMode === 'page' ? 'Fit page' : 'Fit width') }}</button>
          <button type="button" class="w-8 h-8 rounded text-xl text-neutral-300 hover:text-white disabled:opacity-30" :disabled="reader.zoom >= ZOOM_MAX" aria-label="Zoom in" @click="reader.setZoom(reader.zoom + 0.25)">+</button>
        </div>
        <div class="flex bg-neutral-800 border border-neutral-700 rounded-lg p-0.5" role="group" aria-label="Page layout">
          <button type="button" class="w-9 h-[30px] rounded-md flex items-center justify-center" :class="reader.viewMode === 'single' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-white'" :aria-pressed="reader.viewMode === 'single'" title="Single page" @click="reader.setViewMode('single', true)">
            <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="1.5" width="11" height="15" rx="1" /></svg>
          </button>
          <button type="button" class="w-9 h-[30px] rounded-md flex items-center justify-center" :class="reader.viewMode === 'double' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-white'" :aria-pressed="reader.viewMode === 'double'" title="Two-page spread" @click="reader.setViewMode('double', true)">
            <svg width="22" height="18" viewBox="0 0 22 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="15" rx="1" /><rect x="11.5" y="1.5" width="9" height="15" rx="1" /></svg>
          </button>
        </div>
        <button type="button" class="rtb-icon ml-1" title="Search this edition" aria-label="Search this edition" @click="emit('open-search')">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </button>
        <button type="button" class="h-9 px-3 rounded-md border border-neutral-700 text-sm text-neutral-100 hover:bg-neutral-800 flex items-center gap-2" @click="emit('open-archive')">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>Archive
        </button>
        <OrgAdminLink v-if="account.loggedIn" :key="`w-${account.user?.email || ''}`" class="rtb-icon" aria-label="Manage organisation">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5l8-2v18M12 8h8v13M4 21h16" /></svg>
        </OrgAdminLink>
        <NuxtLink v-if="!account.loggedIn" :to="{ path: '/login', query: { redirect: route.fullPath } }" class="h-9 px-3 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium flex items-center">Sign in</NuxtLink>
        <div class="relative rtb-menu-wrap">
          <button type="button" class="rtb-icon" aria-label="More" :aria-expanded="menuOpen" @click.stop="menuOpen = !menuOpen">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div v-if="menuOpen" class="rtb-menu">
            <div v-if="reader.edition" class="px-3 py-2 text-[12px] text-neutral-300 leading-relaxed border-b border-neutral-700 mb-1">
              <div class="font-semibold text-sm text-white mb-0.5">Edition details</div>
              {{ dateLabel }} · Vol.{{ reader.edition.volume || '—' }} No.{{ reader.edition.issueNumber || '—' }}<br>
              {{ reader.edition.pages?.length || 0 }} pages<template v-if="reader.edition.coverPrice"> · {{ reader.edition.coverPrice }} {{ reader.edition.currency }}</template>
            </div>
            <button type="button" class="rtb-item" @click="pick('open-goto')">Go to page</button>
            <button type="button" class="rtb-item" @click="pick('open-contents')">Contents</button>
            <template v-if="account.loggedIn">
              <div class="border-t border-neutral-700 my-1" />
              <div class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span class="text-neutral-300 truncate">{{ account.user?.email || 'Account' }}</span>
                <button type="button" class="text-neutral-400 hover:text-white flex-none" @click="signOut">Sign out</button>
              </div>
            </template>
            <div class="border-t border-neutral-700 my-1" />
            <div class="px-3 py-2 text-[11px] text-neutral-500 leading-relaxed">Scroll, or use ↑ ↓ / ← →, to move between pages · Esc closes panels. Copying, selecting and printing are turned off for this edition.</div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.rtb-btn {
  width: 46px; height: 48px; flex: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  font-size: 10px; color: #d4d4d4; border-radius: 8px;
}
.rtb-btn:hover, .rtb-btn:active { color: #fff; background: #262626; }
.rtb-icon {
  width: 38px; height: 38px; flex: none; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; color: #d4d4d4;
}
.rtb-icon:hover { color: #fff; background: #262626; }
.rtb-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 240; width: 280px;
  background: #262626; border: 1px solid #404040; border-radius: 10px; padding: 6px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); color: #e5e5e5; max-height: 80vh; overflow-y: auto;
}
.rtb-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border-radius: 6px; font-size: 14px; }
.rtb-item:hover { background: #333; }
/* sidebar button: a red ring that pulses outwards 3 times */
.rtb-pulse {
  position: absolute; inset: 0; border-radius: 6px; pointer-events: none;
  box-shadow: 0 0 0 0 rgba(215, 38, 30, 0.75);
  animation: rtb-pulse 1.6s ease-out 0.4s 3;
}
@keyframes rtb-pulse {
  0% { box-shadow: 0 0 0 0 rgba(215, 38, 30, 0.75); }
  70% { box-shadow: 0 0 0 9px rgba(215, 38, 30, 0); }
  100% { box-shadow: 0 0 0 0 rgba(215, 38, 30, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .rtb-pulse { animation: none; }
}
</style>