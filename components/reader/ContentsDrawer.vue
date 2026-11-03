<!-- File: /var/www/VGEpaper/web/components/reader/ContentsDrawer.vue -->
<script setup>
import { computed } from 'vue';
import { useReaderStore } from '~/stores/reader';

const props = defineProps({ open: { type: Boolean, required: true } });
const emit = defineEmits(['close']);

const reader = useReaderStore();
const pages = computed(() => reader.edition?.pages || []);

/**
 * Groups CONSECUTIVE pages sharing the same section into one block with a
 * header, rather than a flat page-by-page list — sections in a real
 * newspaper are inherently contiguous page ranges (e.g. "National News:
 * pages 2-8"), so grouping by a run-change rather than collecting all
 * matching pages regardless of position is the correct approach; it also
 * means two unrelated pages that happen to share a section name (rare, but
 * possible across a large issue) don't get incorrectly merged into one
 * visual block.
 * A null section (the cover always has one; ingest also leaves it null
 * when nothing was confidently detected) gets no group header rather than
 * a fabricated label — page 1 specifically is called out as "Front Page"
 * since that's always true structurally, not detected.
 */
const groups = computed(() => {
  const result = [];
  for (const page of pages.value) {
    const last = result[result.length - 1];
    if (last && last.section === page.section) {
      last.pages.push(page);
    } else {
      result.push({ section: page.section, pages: [page] });
    }
  }
  return result;
});

function groupLabel(group) {
  if (group.section) return group.section;
  if (group.pages[0]?.pageNumber === 1) return 'Front Page';
  return null;
}

function labelFor(page) {
  if (page.stories?.[0]?.headline) return page.stories[0].headline;
  if (page.section) return page.section;
  return `Page ${page.pageNumber}`;
}

function selectPage(pageNumber) {
  reader.jumpTo(pageNumber);
  emit('close');
}
</script>

<template>
  <div
    class="fixed right-0 bottom-0 left-0 z-[180] bg-black/50 transition-opacity top-[var(--reader-top,52px)]"
    :class="open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click="emit('close')"
  >
    <div
      class="absolute top-0 right-0 bottom-0 w-full max-w-[340px] bg-neutral-800 border-l border-neutral-600 shadow-2xl overflow-y-auto transition-transform"
      :class="open ? 'translate-x-0' : 'translate-x-full'"
      @click.stop
    >
      <div class="px-4 py-4 border-b border-neutral-700 font-serif font-bold text-white sticky top-0 bg-neutral-800 z-10">Contents</div>

      <div v-for="(group, gi) in groups" :key="gi">
        <div
          v-if="groupLabel(group)"
          class="px-4 pt-3 pb-1.5 font-mono text-[10px] tracking-widest uppercase text-neutral-400 bg-neutral-800/95 sticky top-[45px] z-[5]"
        >{{ groupLabel(group) }}</div>

        <div
          v-for="page in group.pages" :key="page.pageNumber"
          class="flex gap-3 px-4 py-3 border-b border-neutral-700/60 cursor-pointer hover:bg-neutral-700"
          @click="selectPage(page.pageNumber)"
        >
          <div class="font-mono text-sm text-neutral-400 min-w-[22px]">{{ page.pageNumber }}</div>
          <div class="text-[12.5px] text-neutral-200 leading-snug">{{ labelFor(page) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>