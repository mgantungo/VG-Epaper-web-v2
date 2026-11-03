<!-- File: /var/www/VGEpaper/web/components/reader/SearchOverlay.vue -->
<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useReaderStore } from '~/stores/reader';
import { useReadingTracker } from '~/composables/useReadingTracker';

const props = defineProps({ open: { type: Boolean, required: true } });
const emit = defineEmits(['close', 'open-pullout']);

const reader = useReaderStore();
const query = ref('');
const inputEl = ref(null);

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    query.value = '';
    nextTick(() => inputEl.value?.focus());
  }
});

// Flat list of every story on every page of the currently loaded edition —
// this is edition-scoped search (matches the original mockup's behaviour),
// not cross-archive search, since searching editions you haven't unlocked
// would leak their story text without the entitlement check that normally
// gates it.
const allStories = computed(() => {
  const list = [];
  for (const page of reader.edition?.pages || []) {
    for (const story of page.stories || []) {
      list.push({ ...story, pageNumber: page.pageNumber });
    }
  }
  return list;
});

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return allStories.value.filter(s =>
    s.headline?.toLowerCase().includes(q) ||
    s.kicker?.toLowerCase().includes(q) ||
    s.teaser?.toLowerCase().includes(q)
  ).slice(0, 10);
});

// Analytics: a search is recorded once typing pauses (3+ characters).
const tracker = useReadingTracker();
let searchTimer = null;
watch(query, (q) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => tracker.searched(q, results.value.length, reader.edition?.publicationCode), 1500);
});

function selectResult(story) {
  emit('close');
  reader.jumpTo(story.pageNumber);
  setTimeout(() => emit('open-pullout', story), 260); // let the page-turn/jump settle before popping the pullout open
}
</script>

<template>
  <div
    class="fixed right-0 bottom-0 left-0 z-[190] flex justify-center transition-opacity top-[var(--reader-top,52px)]"
    :class="open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-xl mt-3 bg-neutral-800 border border-neutral-600 rounded-xl shadow-2xl overflow-hidden h-fit">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-neutral-700">
        <span class="text-neutral-400">🔍</span>
        <input
          ref="inputEl" v-model="query" type="text" placeholder="Search headlines in this edition…"
          class="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-neutral-500"
          @keydown.escape="emit('close')"
        >
      </div>
      <div class="max-h-[52vh] overflow-y-auto">
        <div v-if="!query.trim()" class="px-4 py-6 text-center font-mono text-[11px] text-neutral-500">
          Start typing to search this edition's stories.
        </div>
        <div v-else-if="!results.length" class="px-4 py-6 text-center font-mono text-[11px] text-neutral-500">
          No stories match "{{ query }}".
        </div>
        <div
          v-for="story in results" :key="story.id"
          class="px-4 py-3 border-b border-neutral-700 last:border-b-0 cursor-pointer hover:bg-neutral-700"
          @click="selectResult(story)"
        >
          <div class="font-mono text-[9px] tracking-widest uppercase text-neutral-400">{{ story.kicker }}</div>
          <div class="font-serif text-white text-sm mt-0.5">{{ story.headline }}</div>
          <div class="font-mono text-[9.5px] text-neutral-500 mt-0.5">Page {{ story.pageNumber }}{{ story.byline ? ' · ' + story.byline : '' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>