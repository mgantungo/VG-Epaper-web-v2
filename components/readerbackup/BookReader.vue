<script setup>
/**
 * Renders the current spread/single page and drives the 3D flip transition.
 * Ported from the mockup's vanilla-JS turn()/renderStatic() — the geometry
 * and timing are unchanged, just expressed as Vue-managed DOM refs instead of
 * innerHTML string-building.
 *
 * CURRENT STATE: this is still the original simple flip — a single flat
 * rigid rotateY, no paper curl, no corner "dog-ear" peel, no dynamic
 * shading. A much more refined version (two-panel curl that bends the
 * outer half of the page independently of the main rotation, a corner peel
 * that builds through the turn and settles back after landing, precise
 * geometry so the leaf lands pixel-aligned with the static page underneath)
 * was worked out and validated in a standalone HTML prototype, but has NOT
 * been ported into this component yet — that's a separate, still-open task.
 * The prototype file is the reference for that port when it happens; the
 * curl/corner-peel math there took several rounds of real bug-fixing
 * (geometry misalignment, floating-point edge cases in the easing curve,
 * a landing "pop" caused by the leaf's shading not matching the static
 * page's) that shouldn't need re-discovering from scratch here.
 *
 * ALTERNATIVE LIBRARIES CONSIDERED (in case hand-tuning this further stops
 * being worth it): the standard off-the-shelf option for this kind of
 * effect is StPageFlip (npm package `page-flip`) — vanilla JS, no
 * dependencies, TypeScript, and it accepts an array of page image URLs
 * directly via loadFromImages(), which matches this project's architecture
 * exactly (apps/ingest already rasterizes every page to a JPEG). Its core
 * is framework-agnostic; there's a React wrapper (react-pageflip) but no
 * equivalent Vue wrapper with real traction as of this writing, so using it
 * here would mean writing a thin Vue wrapper around the vanilla core
 * ourselves. Worth checking which community fork is best-maintained before
 * installing — the original repo's own upstream activity has slowed.
 * Turn.js was also considered and explicitly ruled out for this project:
 * it requires jQuery (an unnecessary dependency in a Nuxt app) AND requires
 * a commercial license for closed-source production use — a real cost
 * given this is a paid product, not optional fine print. DearFlip's
 * differentiator is accepting a PDF directly and rasterizing it internally
 * — not useful here since apps/ingest already does that step ourselves.
 */
import { ref, nextTick } from 'vue';
import { useReaderStore } from '~/stores/reader';
import PageFace from './PageFace.vue';

const reader = useReaderStore();

const bookEl = ref(null);
const flipEl = ref(null);
const flipFace = ref(null); // { front, back } | null
const flipDirection = ref(null); // 'next' | 'prev' | null

const emit = defineEmits(['open-pullout']);

function pageLocked(page) {
  return reader.edition?.locked && page; // locked editions never carry imageUrl/stories from the API
}

async function animateTurn(direction) {
  if (reader.animating) return;
  const delta = direction === 'next' ? 1 : -1;
  const newIndex = reader.currentIndex + delta;
  if (newIndex < 0 || newIndex >= reader.activeViews.length) {
    bookEl.value?.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${direction === 'next' ? 4 : -4}px)` }, { transform: 'translateX(0)' }],
      { duration: 220 }
    );
    return;
  }

  reader.animating = true;
  playPageSound();

  const oldView = reader.currentView;
  const newView = reader.activeViews[newIndex];

  if (reader.effectiveViewMode === 'single') {
    flipFace.value = { front: oldView.right, back: newView.right };
  } else if (direction === 'next') {
    flipFace.value = { front: oldView.right, back: newView.left };
  } else {
    flipFace.value = { front: oldView.left, back: newView.right };
  }
  flipDirection.value = direction;

  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (flipEl.value) {
        flipEl.value.style.transform = direction === 'next' ? 'rotateY(-180deg)' : 'rotateY(180deg)';
      }
    });
  });

  setTimeout(() => {
    reader.currentIndex = newIndex;
    flipFace.value = null;
    flipDirection.value = null;
    reader.animating = false;
  }, 620);
}

defineExpose({ animateTurn });

// ---- page-turn sound (identical synth approach to the mockup) -----------
let audioCtx = null;
function playPageSound() {
  if (!reader.soundEnabled) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const dur = 0.5;
    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.6);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const band = audioCtx.createBiquadFilter();
    band.type = 'bandpass'; band.Q.value = 0.8;
    band.frequency.setValueAtTime(1000, audioCtx.currentTime);
    band.frequency.linearRampToValueAtTime(3200, audioCtx.currentTime + dur * 0.35);
    band.frequency.linearRampToValueAtTime(700, audioCtx.currentTime + dur);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.55, audioCtx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.connect(band).connect(gain).connect(audioCtx.destination);
    src.start(); src.stop(audioCtx.currentTime + dur);
  } catch {
    // Web Audio unavailable/blocked — silently skip the sound rather than error the page turn.
  }
}
</script>

<template>
  <div class="book-wrap" :class="{ 'single-mode': reader.effectiveViewMode === 'single', 'paywall-preview-blur': reader.edition?.locked }" :style="{ '--page-ar': reader.pageAspect, '--zoom': reader.zoom }">
    <div ref="bookEl" class="book" tabindex="0" aria-label="Newspaper reader. Use left and right arrow keys to turn pages.">
      <div class="page-slot left" v-show="!!reader.currentView.left">
        <PageFace v-if="reader.currentView.left" :page="reader.currentView.left" :locked="pageLocked(reader.currentView.left)" @open-pullout="emit('open-pullout', $event)" />
      </div>
      <div class="page-slot right" v-show="!!reader.currentView.right">
        <PageFace v-if="reader.currentView.right" :page="reader.currentView.right" :locked="pageLocked(reader.currentView.right)" @open-pullout="emit('open-pullout', $event)" />
      </div>

      <div v-if="flipFace" ref="flipEl" class="flip-page" :style="{ left: reader.effectiveViewMode === 'single' ? '0' : (flipDirection === 'next' ? '50%' : '0'), width: reader.effectiveViewMode === 'single' ? '100%' : undefined, transformOrigin: flipDirection === 'next' ? 'left center' : 'right center' }">
        <div class="face front">
          <PageFace v-if="flipFace.front" :page="flipFace.front" :locked="pageLocked(flipFace.front)" @open-pullout="emit('open-pullout', $event)" />
        </div>
        <div class="face back">
          <PageFace v-if="flipFace.back" :page="flipFace.back" :locked="pageLocked(flipFace.back)" @open-pullout="emit('open-pullout', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>