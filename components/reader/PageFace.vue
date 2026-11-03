<!-- File: /var/www/VGEpaper/web/components/reader/PageFace.vue -->
<script setup>
/**
 * One newspaper page: its image plus the clickable story areas (hotspots).
 *
 * SCROLLING READER (Nov 2026): the image now comes from the in-memory page
 * cache (composables/usePageImages.js) instead of being fetched here, so a
 * page already loaded in the background shows at once and nothing is
 * stored on the device. Retries and the Retry button are unchanged.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { usePageImages } from '~/composables/usePageImages';
import { useReaderStore } from '~/stores/reader';

const props = defineProps({
  page: { type: Object, required: true },
  locked: { type: Boolean, default: false }
});
const emit = defineEmits(['open-pullout']);

const images = usePageImages();
const reader = useReaderStore();

// Feeds the real page shape to the reader, which sizes every page from it.
function onImgLoad(e) {
  reader.setPageAspect(e.target.naturalWidth, e.target.naturalHeight);
}
const objectUrl = ref(null);
const imgFailed = ref(false);
let heldUrl = null; // the image this component holds in the cache

function letGo() {
  if (heldUrl) images.release(heldUrl);
  heldUrl = null;
  objectUrl.value = null;
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
  letGo();
  imgFailed.value = false;
  if (props.locked || !props.page.imageUrl) return;
  const url = props.page.imageUrl;

  for (let attempt = 0; ; attempt++) {
    try {
      const got = await images.acquire(url);
      if (gen !== loadGeneration) { images.release(url); return; } // the reader has moved on to another page
      heldUrl = url;
      objectUrl.value = got;
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

watch(() => [props.page?.pageNumber, props.page?.imageUrl, props.locked], loadImage, { immediate: true });

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
  letGo();
});
</script>

<template>
  <div class="relative w-full h-full bg-white" @contextmenu.prevent>
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