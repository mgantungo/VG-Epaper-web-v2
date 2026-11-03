<!-- File: /var/www/VGEpaper/web/components/reader/PageStrip.vue -->
<script setup>
/**
 * Phones and tablets held upright: a strip of page previews along the
 * bottom. Tap a preview to go to that page; the page being read is raised
 * and outlined, and the strip follows it as the reader scrolls. The "3 / 40"
 * button opens Go to page (number, sections, all pages).
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useReaderStore } from '~/stores/reader';
import PageThumb from './PageThumb.vue';

const emit = defineEmits(['open-goto']);
const reader = useReaderStore();

const strip = ref(null);
const pages = computed(() => reader.edition?.pages || []);
const locked = computed(() => Boolean(reader.edition?.locked));
const current = computed(() => reader.currentView.right?.pageNumber ?? reader.currentView.left?.pageNumber ?? 1);

function follow(smooth = true) {
  nextTick(() => {
    const el = strip.value?.querySelector(`[data-page="${current.value}"]`);
    if (!el || !strip.value) return;
    const left = el.offsetLeft - (strip.value.clientWidth - el.offsetWidth) / 2;
    strip.value.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  });
}
watch(current, () => follow(true));
onMounted(() => follow(false));
</script>

<template>
  <div class="flex-none flex items-end gap-2 bg-neutral-900 border-t border-neutral-800 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
    <button
      type="button"
      class="flex-none ml-2.5 mb-5 h-11 min-w-[74px] px-3 rounded-full bg-neutral-800 border border-neutral-700 font-mono text-sm flex items-center justify-center gap-1.5"
      aria-label="Go to page"
      @click="emit('open-goto')"
    >
      <span class="text-white">{{ current }}</span><span class="text-neutral-400">/ {{ pages.length }}</span>
    </button>
    <div ref="strip" class="ps-strip flex-1 min-w-0 overflow-x-auto flex items-end gap-1.5 pl-1 pr-10 pt-2">
      <button
        v-for="p in pages"
        :key="p.pageNumber"
        type="button"
        class="flex-none w-[46px] flex flex-col items-center gap-1 transition-transform duration-200"
        :class="p.pageNumber === current ? '-translate-y-1.5' : 'opacity-80'"
        :data-page="p.pageNumber"
        :aria-label="`Page ${p.pageNumber}`"
        :aria-current="p.pageNumber === current ? 'page' : undefined"
        @click="reader.jumpTo(p.pageNumber)"
      >
        <PageThumb :page="p" :locked="locked" :active="p.pageNumber === current" />
        <span class="font-mono text-[10px]" :class="p.pageNumber === current ? 'text-white' : 'text-neutral-500'">{{ p.pageNumber }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ps-strip { scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); }
.ps-strip::-webkit-scrollbar { display: none; }
</style>