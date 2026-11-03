<!-- File: /var/www/VGEpaper/web/components/reader/GoToPage.vue -->
<script setup>
/**
 * Go to page: type a page number, pick a section, or tap any page in the
 * grid — no scrolling one page at a time. A bottom sheet on phones and
 * tablets upright, a centred dialog on desktops.
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useReaderStore } from '~/stores/reader';
import PageThumb from './PageThumb.vue';

const props = defineProps({ open: { type: Boolean, required: true }, compact: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
const reader = useReaderStore();

const pages = computed(() => reader.edition?.pages || []);
const locked = computed(() => Boolean(reader.edition?.locked));
const current = computed(() => reader.currentView.left?.pageNumber ?? reader.currentView.right?.pageNumber ?? 1);
const typed = ref('');
const input = ref(null);
const invalid = computed(() => {
  const n = Number(typed.value);
  return typed.value !== '' && (!Number.isInteger(n) || n < 1 || n > pages.value.length);
});

watch(() => props.open, (o) => {
  if (!o) return;
  typed.value = '';
  // focus on desktop only: on a phone it would throw the keyboard up over the grid
  if (!props.compact) nextTick(() => input.value?.focus());
});

function go(n) {
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1 || num > pages.value.length) return;
  emit('close');
  reader.jumpTo(num);
}
function submit() {
  if (!invalid.value && typed.value !== '') go(typed.value);
}
</script>

<template>
  <div
    class="fixed inset-0 z-[230] bg-black/60 transition-opacity flex"
    :class="[open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none', compact ? 'items-end' : 'items-center justify-center p-6']"
    @click.self="emit('close')"
    @keydown.escape="emit('close')"
  >
    <section
      v-if="open"
      role="dialog"
      aria-label="Go to page"
      class="gtp-sheet bg-neutral-900 text-neutral-100 shadow-2xl overflow-y-auto overscroll-contain"
      :class="compact ? 'w-full max-h-[86dvh] rounded-t-2xl' : 'w-[640px] max-h-[82dvh] rounded-xl border border-neutral-700'"
    >
      <!-- The whole sheet scrolls as one (title, number box and Go stay put
           at the top), so on a short phone screen dragging anywhere in it
           reaches every section and page. -->
      <div class="sticky top-0 z-10 bg-neutral-900 pb-2" :class="compact ? 'rounded-t-2xl' : 'rounded-t-xl'">
      <div v-if="compact" class="flex justify-center pt-2"><span class="w-10 h-1 rounded bg-neutral-600" /></div>
      <div class="flex items-center justify-between pl-5 pr-2 pt-2">
        <h2 class="text-lg font-semibold">Go to page</h2>
        <button type="button" class="w-11 h-11 flex items-center justify-center text-neutral-300 hover:text-white" aria-label="Close" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <form class="flex gap-2.5 px-5 pt-2 pb-1" @submit.prevent="submit">
        <label for="goto-num" class="sr-only">Page number</label>
        <div class="flex-1 min-w-0 h-[52px] flex items-center gap-2 px-3.5 rounded-xl bg-neutral-800 border" :class="invalid ? 'border-amber-500' : 'border-[#D7261E]'">
          <input
            id="goto-num"
            ref="input"
            v-model="typed"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            :placeholder="String(current)"
            class="flex-1 min-w-0 bg-transparent outline-none text-white font-mono text-[22px] placeholder:text-neutral-500"
          >
          <span class="font-mono text-[15px] text-neutral-400">of {{ pages.length }}</span>
        </div>
        <button type="submit" class="flex-none h-[52px] px-6 rounded-xl bg-[#D7261E] text-white font-semibold disabled:opacity-40" :disabled="invalid || typed === ''">Go</button>
      </form>
      <p v-if="invalid" class="px-5 text-[12px] text-amber-400">Enter a page from 1 to {{ pages.length }}.</p>
      </div>

      <template v-if="reader.sections.length > 1">
        <div class="px-5 pt-3 pb-2 text-[12px] tracking-[0.08em] uppercase text-neutral-400">Sections</div>
        <div class="grid grid-cols-2 gap-2 px-5" :class="compact ? '' : 'sm:grid-cols-3'">
          <button
            v-for="s in reader.sections"
            :key="`${s.name}-${s.first}`"
            type="button"
            class="h-12 px-3 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-between gap-2 text-left hover:border-neutral-500"
            @click="go(s.first)"
          >
            <span class="text-sm font-medium truncate">{{ s.name }}</span>
            <span class="font-mono text-[12px] text-neutral-400 flex-none">{{ s.first === s.last ? `p.${s.first}` : `${s.first}–${s.last}` }}</span>
          </button>
        </div>
      </template>

      <div class="px-5 pt-4 pb-2 text-[12px] tracking-[0.08em] uppercase text-neutral-400">All pages</div>
      <div class="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div class="grid gap-2.5" :class="compact ? 'grid-cols-4' : 'grid-cols-6'">
          <button
            v-for="p in pages"
            :key="p.pageNumber"
            type="button"
            class="flex flex-col items-center gap-1"
            :aria-label="`Page ${p.pageNumber}`"
            @click="go(p.pageNumber)"
          >
            <PageThumb :page="p" :locked="locked" :active="p.pageNumber === current" />
            <span class="font-mono text-[11px]" :class="p.pageNumber === current ? 'text-white' : 'text-neutral-500'">{{ p.pageNumber }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gtp-sheet { -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: #444 transparent; }
</style>