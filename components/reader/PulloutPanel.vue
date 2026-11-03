<!-- File: /var/www/VGEpaper/web/components/reader/PulloutPanel.vue -->
<script setup>
/**
 * A story pulled out of the page, to read as text.
 *
 * Nov 2026:
 *  - Protected: the text can't be selected, copied, dragged, or long-pressed
 *    for the phone's copy/share menu (the old `select-text` exception is
 *    gone, here and in plugins/copy-protection.client.js). This stops casual
 *    copying; no website can stop a screenshot.
 *  - Advert slots kept on every screen: desktops keep the column beside the
 *    story; phones get one slot inside the story and a banner at the bottom.
 *    They are placeholders (data-ad-slot names them) until an ad server is
 *    wired in.
 *  - Phones show it as a bottom sheet; desktops as a dialog.
 */
import { computed } from 'vue';
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
// Phones: the in-story advert goes after the second paragraph (or the last,
// for a short story).
const inlineAdAfter = computed(() => Math.min(2, paragraphs.value.length) - 1);

const pageNumber = computed(() => {
  const id = props.story?.id;
  const page = (reader.edition?.pages || []).find((p) => (p.stories || []).some((s) => s.id === id));
  return page?.pageNumber ?? null;
});

// Only ever set when the ingest engine found an explicit jump-line marker
// in the text ("Turned to Page N" / "Continued from Page N") — never
// guessed from layout. See apps/ingest/src/pipeline/extractSections.js.
function goToPage(n) {
  emit('close');
  reader.jumpTo(n);
}
</script>

<template>
  <div
    class="fixed inset-0 z-[220] flex items-end md:items-center justify-center md:p-6 bg-black/60 backdrop-blur-sm transition-opacity"
    :class="story ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click.self="emit('close')"
  >
    <div
      v-if="story"
      role="dialog"
      :aria-label="story.headline || 'Story'"
      class="protected w-full md:max-w-5xl max-h-[92vh] md:max-h-[86vh] bg-white text-neutral-900 rounded-t-2xl md:rounded-md shadow-2xl relative overflow-hidden flex flex-col md:flex-row"
      @copy.prevent
      @cut.prevent
      @contextmenu.prevent
      @dragstart.prevent
    >
      <!-- the story -->
      <div class="flex-1 min-w-0 min-h-0 flex flex-col">
        <div class="md:hidden flex justify-center pt-2"><span class="w-10 h-1 rounded bg-neutral-300" /></div>
        <div class="flex-none flex items-center justify-between pl-5 md:pl-8 pr-2 pt-1 md:pt-3">
          <span class="font-mono text-[11px] tracking-[0.08em] uppercase text-neutral-500">
            {{ story.kicker || '' }}<template v-if="pageNumber"><template v-if="story.kicker"> · </template>Page {{ pageNumber }}</template>
          </span>
          <button type="button" class="w-11 h-11 rounded-full flex items-center justify-center text-neutral-500 hover:bg-black/5 hover:text-neutral-900" aria-label="Close story" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <!-- what scrolls: the story, independently of the ad column -->
        <div class="flex-1 min-h-0 overflow-y-auto px-5 md:px-8 pb-6">
          <button
            v-if="story.continuesFromPage"
            type="button"
            class="font-mono text-[11px] tracking-wide uppercase text-neutral-500 hover:text-neutral-900 mb-2 flex items-center gap-1"
            @click="goToPage(story.continuesFromPage)"
          >← Continued from page {{ story.continuesFromPage }}</button>

          <h2 class="font-serif font-extrabold text-[26px] md:text-3xl leading-tight mb-2">{{ story.headline }}</h2>
          <div v-if="story.byline" class="text-[13px] text-neutral-500 mb-4">{{ story.byline }}</div>
          <div class="h-px bg-neutral-200 mb-4" />
          <div class="font-serif text-[17px] leading-relaxed space-y-4 max-w-[640px]">
            <template v-for="(para, i) in paragraphs" :key="i">
              <p>{{ para }}</p>
              <aside v-if="i === inlineAdAfter" class="md:hidden flex flex-col items-center gap-1.5 py-1" aria-label="Advertisement">
                <span class="font-sans text-[10px] tracking-[0.12em] uppercase text-neutral-500">Advertisement</span>
                <div class="ad-slot w-[300px] h-[250px]" data-ad-slot="story-inline-mobile">Ad slot<br>300 × 250</div>
              </aside>
            </template>
          </div>

          <button
            v-if="story.continuesToPage"
            type="button"
            class="mt-5 h-11 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-medium inline-flex items-center gap-2"
            @click="goToPage(story.continuesToPage)"
          >Continues on page {{ story.continuesToPage }} →</button>
        </div>

        <!-- phones: banner advert -->
        <aside class="md:hidden flex-none flex justify-center py-2 border-t border-neutral-100" aria-label="Advertisement">
          <div class="ad-slot w-[320px] h-[50px]" data-ad-slot="story-banner-mobile">Ad slot · 320 × 50</div>
        </aside>
        <div class="flex-none flex items-center gap-2 px-5 md:px-8 py-2.5 border-t border-neutral-100 bg-neutral-50 text-[12px] text-neutral-500 pb-[max(10px,env(safe-area-inset-bottom))]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <span>Selecting and copying are turned off for this edition</span>
        </div>
      </div>

      <!-- desktops: advert column beside the story -->
      <aside class="hidden md:flex w-[340px] flex-none border-l border-neutral-200 bg-neutral-50 flex-col items-center gap-4 pt-14 pb-5 px-5 overflow-y-auto" aria-label="Advertisements">
        <span class="text-[10px] tracking-[0.12em] uppercase text-neutral-500">Advertisement</span>
        <div class="ad-slot w-[300px] h-[250px]" data-ad-slot="story-side-1">Ad slot<br>300 × 250</div>
        <div class="ad-slot w-[300px] h-[300px]" data-ad-slot="story-side-2">Ad slot<br>300 × 300</div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.protected, .protected * {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none;
}
.ad-slot {
  flex: none; box-sizing: border-box; border: 1px dashed #b5b5b5; border-radius: 4px; background: #f4f4f4;
  display: flex; align-items: center; justify-content: center; text-align: center;
  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #6b6b6b;
}
</style>