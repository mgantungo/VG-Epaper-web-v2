<!-- File: /var/www/VGEpaper/web/components/reader/PageThumb.vue -->
<script setup>
/**
 * A small page preview for the page strip, the sidebar and Go to page.
 * Loads the ?size=thumb image (a few KB) into memory only — see
 * composables/usePageImages.js. Locked editions, and pages that can't be
 * previewed, show a plain card with the page number instead.
 */
import { ref, watch, onUnmounted } from 'vue';
import { usePageImages, thumbUrlFor } from '~/composables/usePageImages';
import { useReaderStore } from '~/stores/reader';

const props = defineProps({
  page: { type: Object, required: true },
  locked: { type: Boolean, default: false },
  active: { type: Boolean, default: false }
});

const images = usePageImages();
const reader = useReaderStore();
const src = ref(null);
let gen = 0;

async function load() {
  const mine = ++gen;
  src.value = null;
  const url = props.locked ? null : thumbUrlFor(props.page);
  if (!url) return;
  try {
    const got = await images.thumb(url);
    if (mine === gen) src.value = got;
  } catch {
    // no preview — the numbered card stays
  }
}
watch(() => [props.page?.pageNumber, props.page?.imageUrl, props.locked], load, { immediate: true });
onUnmounted(() => { gen++; });
</script>

<template>
  <span
    class="relative block w-full overflow-hidden rounded-[2px] bg-white"
    :class="active ? 'ring-2 ring-[#D7261E] shadow-[0_6px_14px_rgba(0,0,0,0.6)]' : 'shadow-[0_2px_6px_rgba(0,0,0,0.5)]'"
    :style="{ aspectRatio: String(reader.pageAspect) }"
  >
    <img v-if="src" :src="src" alt="" class="absolute inset-0 w-full h-full object-cover" draggable="false" />
    <span v-else class="absolute inset-0 flex items-center justify-center bg-neutral-200 text-neutral-500 font-mono text-[10px]">{{ page.pageNumber }}</span>
  </span>
</template>