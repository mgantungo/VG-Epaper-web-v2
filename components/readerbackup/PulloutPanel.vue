<script setup>
import { useReaderStore } from '~/stores/reader';

const props = defineProps({ story: { type: Object, default: null } });
const emit = defineEmits(['close']);

const reader = useReaderStore();

// Story text from ingest/the story editor is plain text: paragraphs are
// separated by a blank line. Render each as its own <p> (as text, not HTML).
const paragraphs = computed(() =>
  String(props.story?.body || props.story?.teaser || '')
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
);

// Only ever set when the ingest engine found an explicit jump-line marker
// in the text ("Turned to Page N" / "Continued from Page N") — never
// guessed from layout. See apps/ingest/src/pipeline/extractSections.js's
// own comments for why an absent marker means no link here at all, rather
// than a guess.
function goToPage(pageNumber) {
  emit('close');
  reader.jumpTo(pageNumber);
}
</script>

<template>
  <div
    class="fixed inset-0 z-[220] flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-sm transition-opacity"
    :class="story ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click.self="emit('close')"
  >
    <div v-if="story" class="w-full max-w-4xl max-h-[86vh] bg-white text-neutral-900 rounded-sm shadow-2xl relative overflow-hidden flex flex-col md:flex-row">
      <button class="absolute top-3 right-4 z-10 w-8 h-8 rounded-full text-neutral-500 hover:bg-black/5 hover:text-neutral-900 bg-white/80" @click="emit('close')">✕</button>

      <!-- article column: this is what actually scrolls, independently of
           the ad sidebar, so a long article doesn't drag the ad away with it -->
      <div class="flex-1 min-w-0 overflow-y-auto p-6 md:p-8 select-text">
        <button
          v-if="story.continuesFromPage"
          class="font-mono text-[10px] tracking-widest uppercase text-neutral-500 hover:text-neutral-900 mb-2 flex items-center gap-1"
          @click="goToPage(story.continuesFromPage)"
        >← Continued from page {{ story.continuesFromPage }}</button>

        <div class="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-1">{{ story.kicker }}</div>
        <h2 class="font-serif font-extrabold text-2xl leading-tight mb-1 pr-8">{{ story.headline }}</h2>
        <div class="font-mono text-[10px] text-neutral-500 mb-4">{{ story.byline }}</div>
        <div class="h-px bg-neutral-300 mb-4" />
        <div class="text-[14.5px] leading-relaxed space-y-4">
          <p v-for="(para, i) in paragraphs" :key="i">{{ para }}</p>
        </div>

        <button
          v-if="story.continuesToPage"
          class="mt-5 font-mono text-[11px] tracking-wide uppercase text-white bg-neutral-900 hover:bg-neutral-700 rounded px-4 py-2.5 flex items-center gap-1.5"
          @click="goToPage(story.continuesToPage)"
        >Continues on page {{ story.continuesToPage }} →</button>
      </div>

      <!-- ad sidebar — placeholder slots; wire these to a real ad server/
           network (Google Ad Manager, direct-sold creative, etc.) when
           that's chosen. Hidden on narrow screens rather than squeezed. -->
      <div class="hidden md:flex md:w-[220px] flex-none border-l border-neutral-200 bg-neutral-50 flex-col gap-4 p-4 overflow-y-auto">
        <div class="font-mono text-[9px] tracking-widest uppercase text-neutral-400 text-center">Advertisement</div>
        <div class="w-full aspect-[3/4] border border-dashed border-neutral-300 rounded flex items-center justify-center text-neutral-400 font-mono text-[10px] text-center px-3">
          Ad slot<br>300 × 400
        </div>
        <div class="w-full aspect-square border border-dashed border-neutral-300 rounded flex items-center justify-center text-neutral-400 font-mono text-[10px] text-center px-3">
          Ad slot<br>square
        </div>
      </div>
    </div>
  </div>
</template>