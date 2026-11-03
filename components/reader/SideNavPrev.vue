<script setup>
import { useReaderStore } from '~/stores/reader';

const reader = useReaderStore();
const emit = defineEmits(['turn']);
</script>

<template>
  <!-- Overlaid on the stage edge (styles: .side-nav in assets/css/main.css). -->
  <button
    class="side-nav prev"
    :disabled="reader.atStart || reader.animating"
    aria-label="Previous page"
    @click="emit('turn', 'prev')"
  >‹</button>
</template>