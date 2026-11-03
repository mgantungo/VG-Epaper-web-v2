<script setup>
import { useReaderStore } from '~/stores/reader';

const reader = useReaderStore();
const emit = defineEmits(['turn']);
</script>

<template>
  <!-- Overlaid on the stage edge (styles: .side-nav in assets/css/main.css). -->
  <button
    class="side-nav next"
    :disabled="reader.atEnd || reader.animating"
    aria-label="Next page"
    @click="emit('turn', 'next')"
  >›</button>
</template>