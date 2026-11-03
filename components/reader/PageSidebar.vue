<!-- File: /var/www/VGEpaper/web/components/reader/PageSidebar.vue -->
<script setup>
/**
 * Desktops and tablets on their side: the page sidebar. Previews are grouped
 * under section headings — spreads in two-page mode, a two-column grid in
 * single-page mode. Click one to go there; the one on screen is outlined
 * and kept in view as the reader scrolls. Hidden/shown from the toolbar.
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useReaderStore } from '~/stores/reader';
import PageThumb from './PageThumb.vue';

const reader = useReaderStore();
const list = ref(null);
const locked = computed(() => Boolean(reader.edition?.locked));
const isDouble = computed(() => reader.effectiveViewMode === 'double');

function sectionOf(pageNumber) {
  return reader.sections.find((s) => pageNumber >= s.first && pageNumber <= s.last)?.name || '';
}

// [{ name, items: [{ index, pages: [page, page?], label }] }]
const groups = computed(() => {
  const out = [];
  reader.activeViews.forEach((v, index) => {
    const pages = [v.left, v.right].filter(Boolean);
    if (!pages.length) return;
    const name = sectionOf(pages[0].pageNumber);
    let g = out[out.length - 1];
    if (!g || g.name !== name) { g = { name, items: [] }; out.push(g); }
    g.items.push({ index, pages, left: v.left, right: v.right, label: pages.map((p) => p.pageNumber).join('–') });
  });
  return out;
});

function keepInView(smooth = true) {
  nextTick(() => {
    const el = list.value?.querySelector(`[data-index="${reader.currentIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  });
}
watch(() => reader.currentIndex, () => keepInView(true));
onMounted(() => keepInView(false));

function go(item) {
  reader.jumpTo(item.pages[0].pageNumber);
}
</script>

<template>
  <aside ref="list" aria-label="Pages" class="psb w-[196px] flex-none overflow-y-auto bg-neutral-900 border-r border-neutral-800 px-2.5 pb-16">
    <div v-for="(g, gi) in groups" :key="`${g.name}-${gi}`">
      <div class="text-[11px] tracking-[0.08em] uppercase text-neutral-400 px-1 pt-3 pb-1.5 truncate">{{ g.name }}</div>
      <div :class="isDouble ? 'flex flex-col gap-1' : 'grid grid-cols-2 gap-1'">
        <button
          v-for="item in g.items"
          :key="item.index"
          type="button"
          class="rounded-md p-1.5 flex flex-col items-center gap-1 hover:bg-neutral-800"
          :class="item.index === reader.currentIndex ? 'bg-neutral-800' : ''"
          :data-index="item.index"
          :aria-label="`Page ${item.label}`"
          :aria-current="item.index === reader.currentIndex ? 'page' : undefined"
          @click="go(item)"
        >
          <span v-if="isDouble" class="flex w-full">
            <span class="w-1/2"><PageThumb v-if="item.left" :page="item.left" :locked="locked" :active="item.index === reader.currentIndex" /></span>
            <span class="w-1/2"><PageThumb v-if="item.right" :page="item.right" :locked="locked" :active="item.index === reader.currentIndex" /></span>
          </span>
          <span v-else class="block w-full"><PageThumb :page="item.pages[0]" :locked="locked" :active="item.index === reader.currentIndex" /></span>
          <span class="font-mono text-[11px]" :class="item.index === reader.currentIndex ? 'text-white' : 'text-neutral-500'">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.psb::-webkit-scrollbar { width: 6px; }
.psb::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
</style>