<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useEpaperApi } from '~/composables/useEpaperApi';
import { useReaderStore } from '~/stores/reader';

const props = defineProps({
  page: { type: Object, required: true },
  locked: { type: Boolean, default: false }
});
const emit = defineEmits(['open-pullout']);

const api = useEpaperApi();
const reader = useReaderStore();

// Feeds the real page shape to the book frame (BookReader sizes itself from it).
function onImgLoad(e) {
  reader.setPageAspect(e.target.naturalWidth, e.target.naturalHeight);
}
const objectUrl = ref(null);
const imgFailed = ref(false);

function releaseObjectUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value); // otherwise every page turn leaks the previous page's image out of memory
    objectUrl.value = null;
  }
}

// Automatic retries for a failed page image: a dropped connection or a
// slow wake-up after sleep shouldn't leave a dead page. 402 (not paid for)
// and 404 (no such page) are final — retrying can't change them.
const RETRY_DELAYS_MS = [1000, 3000, 8000];
const FINAL_STATUSES = [402, 403, 404];
let loadGeneration = 0; // bumped on every new load, so a slow, stale response can't overwrite a newer page
let retryTimer = null;

async function loadImage() {
  const gen = ++loadGeneration;
  clearTimeout(retryTimer);
  releaseObjectUrl();
  imgFailed.value = false;
  if (props.locked || !props.page.imageUrl) return;

  for (let attempt = 0; ; attempt++) {
    try {
      const blob = await api.fetchImageBlob(props.page.imageUrl);
      if (gen !== loadGeneration) return; // the reader has moved on to another page
      objectUrl.value = URL.createObjectURL(blob);
      return;
    } catch (err) {
      if (gen !== loadGeneration) return;
      const status = err?.response?.status ?? err?.statusCode ?? err?.status;
      if (FINAL_STATUSES.includes(status) || attempt >= RETRY_DELAYS_MS.length) {
        imgFailed.value = true; // shows the Retry button; also retried when the network comes back
        return;
      }
      await new Promise((resolve) => { retryTimer = setTimeout(resolve, RETRY_DELAYS_MS[attempt]); });
      if (gen !== loadGeneration) return;
    }
  }
}

// Re-fetch whenever this component gets handed a different page (BookReader
// reuses the same PageFace instance across turns rather than recreating it,
// so onMounted alone would only ever load the very first page shown).
watch(() => [props.page?.pageNumber, props.locked], loadImage, { immediate: true });

// Back online (Wi-Fi reconnected, phone left a dead zone, laptop woke up):
// try again any page that gave up while the network was down.
function onOnline() {
  if (imgFailed.value) loadImage();
}
onMounted(() => window.addEventListener('online', onOnline));
onUnmounted(() => {
  loadGeneration++; // stop any retry loop still waiting
  clearTimeout(retryTimer);
  window.removeEventListener('online', onOnline);
  releaseObjectUrl();
});
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="locked || (!objectUrl && !imgFailed)" class="absolute inset-0 flex items-center justify-center bg-neutral-100 text-neutral-500">
      <div class="text-center px-6">
        <div class="font-mono text-xs tracking-widest uppercase mb-2">Page {{ page.pageNumber }}</div>
        <div class="font-mono text-[10px] text-neutral-400">
          {{ locked ? "Subscribe or unlock this edition to view this page" : "Loading…" }}
        </div>
      </div>
    </div>
    <div v-else-if="imgFailed" class="absolute inset-0 flex items-center justify-center bg-neutral-100 text-neutral-500">
      <div class="text-center px-6">
        <div class="font-mono text-[11px] mb-3">Couldn't load page {{ page.pageNumber }}</div>
        <button
          type="button"
          class="font-mono text-xs px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-700 active:scale-95 transition"
          @click.stop="loadImage"
        >Retry</button>
      </div>
    </div>
    <template v-else>
      <img :src="objectUrl" :alt="`Page ${page.pageNumber}`" class="block w-full h-full object-cover" draggable="false" @load="onImgLoad" />
      <div
        v-for="story in page.stories || []"
        :key="story.id"
        class="hotspot"
        :style="{ top: story.top + '%', left: story.left + '%', width: story.width + '%', height: story.height + '%' }"
        @click="emit('open-pullout', story)"
      />
    </template>
  </div>
</template>