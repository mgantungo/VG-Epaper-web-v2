<!-- File: /var/www/VGEpaper/web/components/reader/SectionBar.vue -->
<script setup>
/**
 * The paper's sections, always at the top of the reader, so a reader who
 * bought the paper for one section goes straight there. Built from each
 * page's section (stores/reader.js -> sections). The section being read is
 * highlighted, and scrolled into view when the row is wider than the screen.
 *   variant="chips": phones and tablets upright — a swipeable row of chips
 *   variant="tabs":  desktops — tabs inside the toolbar
 * Renders nothing when an edition has fewer than two sections.
 */
import { ref, watch, nextTick, onMounted } from 'vue';
import { useReaderStore } from '~/stores/reader';

const props = defineProps({ variant: { type: String, default: 'chips' } });
const reader = useReaderStore();
const row = ref(null);

function keepActiveInView(smooth = true) {
  nextTick(() => {
    const el = row.value?.querySelector('[aria-current="true"]');
    if (!el || !row.value) return;
    const left = el.offsetLeft - (row.value.clientWidth - el.offsetWidth) / 2;
    row.value.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  });
}
watch(() => reader.currentSection?.first, () => keepActiveInView(true));
onMounted(() => keepActiveInView(false));
</script>

<template>
  <nav
    v-if="reader.sections.length > 1"
    ref="row"
    aria-label="Sections"
    class="sb-row flex overflow-x-auto"
    :class="props.variant === 'tabs' ? 'items-stretch gap-0.5 h-full' : 'items-center gap-1.5 h-11 px-2.5 bg-neutral-900 border-b border-neutral-800 flex-none'"
  >
    <button
      v-for="s in reader.sections"
      :key="`${s.name}-${s.first}`"
      type="button"
      :aria-current="reader.currentSection?.first === s.first ? 'true' : 'false'"
      class="flex-none whitespace-nowrap font-medium"
      :class="props.variant === 'tabs'
        ? (reader.currentSection?.first === s.first ? 'px-3.5 text-sm text-white shadow-[inset_0_-3px_0_#D7261E]' : 'px-3.5 text-sm text-neutral-400 hover:text-white')
        : (reader.currentSection?.first === s.first ? 'h-8 px-3.5 rounded-full text-[13px] bg-neutral-100 text-neutral-900 border border-neutral-100' : 'h-8 px-3.5 rounded-full text-[13px] text-neutral-300 border border-neutral-700')"
      @click="reader.jumpTo(s.first)"
    >{{ s.name }}</button>
  </nav>
</template>

<style scoped>
.sb-row { scrollbar-width: none; }
.sb-row::-webkit-scrollbar { display: none; }
</style>