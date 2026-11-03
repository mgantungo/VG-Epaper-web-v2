<!--
  Repo path: apps/web/components/OrgPeriodPicker.vue  (srcDir-relative)   NEW FILE

  Chooses an access period for Organisation members: the rest of the paid
  period, a number of months, or exact dates. v-model is
  { mode: 'paid' | 'months' | 'custom', months, start, end }.
  toPeriodBody(value) turns it into the API's { coverageStart?, coverageEnd?, months? }.
  The server clips anything past the end of the paid period and says so.

  Imported explicitly (nuxt.config's `components` only registers
  components/reader), e.g.  import OrgPeriodPicker, { toPeriodBody } from '~/components/OrgPeriodPicker.vue'
-->
<script>
export function toPeriodBody(v) {
  if (!v) return {};
  if (v.mode === 'months') return { months: Number(v.months) || 1, ...(v.start ? { coverageStart: v.start } : {}) };
  if (v.mode === 'custom') return { coverageStart: v.start || undefined, coverageEnd: v.end || undefined };
  return v.start ? { coverageStart: v.start } : {};
}
export function newPeriod() {
  return { mode: 'paid', months: 12, start: '', end: '' };
}
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  paidUntil: { type: String, default: null },   // end of the current paid period, for the label
  idPrefix: { type: String, default: 'period' },
  showStart: { type: Boolean, default: true }
});
const emit = defineEmits(['update:modelValue']);

const v = computed(() => props.modelValue);
function set(patch) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}
const fmt = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="text-xs font-mono text-neutral-600 mb-1">Access period</legend>

    <label class="flex items-start gap-2 text-sm cursor-pointer">
      <input type="radio" class="mt-1" :name="`${idPrefix}-mode`" :checked="v.mode === 'paid'" @change="set({ mode: 'paid' })">
      <span>Until the end of the paid period<span v-if="paidUntil" class="text-neutral-500"> ({{ fmt(paidUntil) }})</span></span>
    </label>

    <label class="flex items-center gap-2 text-sm cursor-pointer flex-wrap">
      <input type="radio" :name="`${idPrefix}-mode`" :checked="v.mode === 'months'" @change="set({ mode: 'months' })">
      <span>For</span>
      <select
        :value="v.months" class="border border-neutral-300 rounded-md px-2 py-1 text-sm bg-white"
        :aria-label="'Number of months'" @focus="set({ mode: 'months' })" @change="set({ mode: 'months', months: Number($event.target.value) })"
      >
        <option v-for="n in [1, 2, 3, 6, 9, 12, 18, 24]" :key="n" :value="n">{{ n }} {{ n === 1 ? 'month' : 'months' }}</option>
      </select>
    </label>

    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="radio" :name="`${idPrefix}-mode`" :checked="v.mode === 'custom'" @change="set({ mode: 'custom' })">
      <span>Specific dates</span>
    </label>

    <div v-if="v.mode === 'custom' || showStart" class="grid grid-cols-2 gap-3 pt-1">
      <label class="block">
        <span class="text-xs font-mono text-neutral-600">Start</span>
        <input
          type="date" :value="v.start" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          @input="set({ start: $event.target.value })"
        >
        <span class="block text-[11px] text-neutral-500 mt-1">Empty = today</span>
      </label>
      <label v-if="v.mode === 'custom'" class="block">
        <span class="text-xs font-mono text-neutral-600">End</span>
        <input
          type="date" :value="v.end" :min="v.start || undefined" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          @input="set({ end: $event.target.value })"
        >
      </label>
    </div>
  </fieldset>
</template>
