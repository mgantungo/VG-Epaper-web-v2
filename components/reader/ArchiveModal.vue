<!-- File: /var/www/VGEpaper/web/components/reader/ArchiveModal.vue -->
<script setup>
import { ref, computed } from 'vue';
import { useAccountStore } from '~/stores/account';

// Phase 0: unlocked days are per publication (each paper is sold separately).
const props = defineProps({
  open: { type: Boolean, required: true },
  publication: { type: String, default: 'NV' }
});
const emit = defineEmits(['close', 'select-date']);

const account = useAccountStore();
const today = new Date();
// Archives reach back about 100 years, so every year from now to 100 years
// ago is listed (newest first), plus a quick jump by decade.
const ARCHIVE_YEARS = 100;
const years = Array.from({ length: ARCHIVE_YEARS + 1 }, (_, i) => today.getFullYear() - i);
const decades = [...new Set(years.map(y => Math.floor(y / 10) * 10))];
const selectedDecade = ref(Math.floor(today.getFullYear() / 10) * 10);
const yearsInDecade = computed(() => years.filter(y => Math.floor(y / 10) * 10 === selectedDecade.value));
const selectedYear = ref(today.getFullYear());
const calMonth = ref(today.getMonth());

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const daysInMonth = computed(() => new Date(selectedYear.value, calMonth.value + 1, 0).getDate());
const startOffset = computed(() => (new Date(selectedYear.value, calMonth.value, 1).getDay() + 6) % 7);
const lastAvailableMonth = computed(() => (selectedYear.value === today.getFullYear() ? today.getMonth() : 11));

function dateIsoFor(day) {
  return `${selectedYear.value}-${String(calMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function isFuture(day) {
  return new Date(selectedYear.value, calMonth.value, day) > today;
}
function isUnlocked(day) {
  return account.canRead(props.publication, dateIsoFor(day));
}

function pickYear(y) {
  monthPickerOpen.value = false;
  selectedYear.value = y;
  selectedDecade.value = Math.floor(y / 10) * 10;
  calMonth.value = y === today.getFullYear() ? today.getMonth() : 11;
}

// Month arrows cross year boundaries: back from January opens December of
// the year before, forward from December opens January of the next year.
const oldestYear = years[years.length - 1];
const atFirstMonth = computed(() => selectedYear.value === oldestYear && calMonth.value === 0);
const atLastMonth = computed(() => selectedYear.value === today.getFullYear() && calMonth.value >= today.getMonth());
function prevMonth() {
  if (atFirstMonth.value) return;
  if (calMonth.value > 0) { calMonth.value--; return; }
  selectedYear.value--;
  selectedDecade.value = Math.floor(selectedYear.value / 10) * 10;
  calMonth.value = 11;
}
function nextMonth() {
  if (atLastMonth.value) return;
  if (calMonth.value < 11) { calMonth.value++; return; }
  selectedYear.value++;
  selectedDecade.value = Math.floor(selectedYear.value / 10) * 10;
  calMonth.value = 0;
}
// Phones: a compact 4 × 3 month grid instead of a long drop-down list.
// Months that haven't happened yet are greyed out; picking one closes it.
const monthPickerOpen = ref(false);
const monthGrid = computed(() => monthNames.map((name, i) => ({ i, short: name.slice(0, 3), disabled: i > lastAvailableMonth.value })));
function pickMonth(i) {
  if (i > lastAvailableMonth.value) return;
  calMonth.value = i;
  monthPickerOpen.value = false;
}
function selectDay(day) {
  if (isFuture(day)) return;
  emit('select-date', dateIsoFor(day));
}
</script>

<template>
  <div
    class="fixed inset-0 z-[230] flex items-end sm:items-center justify-center sm:p-6 bg-black/55 transition-opacity"
    :class="open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click.self="emit('close')"
  >
    <div v-if="open" role="dialog" aria-label="Archive" class="w-full max-w-3xl max-h-[92dvh] sm:h-[min(84vh,700px)] bg-white text-neutral-900 rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col shadow-2xl">
      <div class="flex-none flex items-center justify-between pl-5 pr-2 sm:px-6 py-2 sm:py-4 bg-neutral-100 border-b">
        <h2 class="font-serif font-bold text-xl">Archive <span class="font-mono text-sm text-neutral-500 font-normal">· {{ publication }}</span></h2>
        <button type="button" class="w-11 h-11 sm:w-8 sm:h-8 rounded-full hover:bg-black/5" aria-label="Close archive" @click="emit('close')">✕</button>
      </div>

      <!-- phones: year drop-down and month grid above a full-width calendar -->
      <div class="sm:hidden flex-none relative flex gap-2 px-4 pt-4">
        <label class="flex-1 min-w-0">
          <span class="block text-[11px] uppercase tracking-[0.08em] text-neutral-500 mb-1">Year</span>
          <select :value="selectedYear" class="w-full h-11 border border-neutral-300 rounded-lg px-2 text-base font-mono bg-white" @change="pickYear(Number($event.target.value))">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
        <div class="flex-[1.4] min-w-0">
          <span id="arch-month-label" class="block text-[11px] uppercase tracking-[0.08em] text-neutral-500 mb-1">Month</span>
          <button
            type="button"
            class="w-full h-11 border rounded-lg px-3 text-base bg-white flex items-center justify-between"
            :class="monthPickerOpen ? 'border-neutral-900' : 'border-neutral-300'"
            aria-labelledby="arch-month-label"
            :aria-expanded="monthPickerOpen"
            @click="monthPickerOpen = !monthPickerOpen"
          >
            <span>{{ monthNames[calMonth] }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" class="text-neutral-500 transition-transform" :class="monthPickerOpen ? 'rotate-180' : ''"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>

        <!-- the month grid: opens under the controls, closes on a pick -->
        <div v-if="monthPickerOpen" class="absolute left-4 right-4 top-[calc(100%+6px)] z-20 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1.5" role="listbox" aria-label="Month">
          <button
            v-for="m in monthGrid"
            :key="m.i"
            type="button"
            role="option"
            :aria-selected="m.i === calMonth"
            class="h-11 rounded-lg text-[15px] font-medium"
            :class="m.i === calMonth ? 'bg-neutral-900 text-white' : (m.disabled ? 'text-neutral-300' : 'text-neutral-800 bg-neutral-50 active:bg-neutral-200')"
            :disabled="m.disabled"
            @click="pickMonth(m.i)"
          >{{ m.short }}</button>
        </div>
      </div>
      <!-- tap outside the grid to close it -->
      <div v-if="monthPickerOpen" class="sm:hidden fixed inset-0 z-10" @click="monthPickerOpen = false" />

      <div class="flex-1 min-h-0 flex gap-6 p-4 sm:p-6">
        <!-- wider screens: decade and the years of that decade, beside the calendar -->
        <div class="hidden sm:flex flex-none w-28 flex-col min-h-0">
          <label class="block mb-2">
            <span class="sr-only">Decade</span>
            <select v-model.number="selectedDecade" class="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-sm font-mono bg-white" @change="pickYear(yearsInDecade[0])">
              <option v-for="d in decades" :key="d" :value="d">{{ d }}s</option>
            </select>
          </label>
          <div class="overflow-y-auto min-h-0">
          <div
            v-for="y in yearsInDecade" :key="y"
            class="py-3 border-b cursor-pointer font-serif"
            :class="y === selectedYear ? 'font-bold border-neutral-900' : 'text-neutral-700 border-neutral-200'"
            @click="pickYear(y)"
          >{{ y }}</div>
          </div>
        </div>
        <div class="flex-1 min-w-0 overflow-y-auto">
          <div class="flex items-center justify-between sm:justify-center gap-3 sm:gap-5 mb-4">
            <button type="button" class="w-11 h-11 sm:w-8 sm:h-8 flex-none rounded-lg sm:rounded-md border border-neutral-300 text-xl sm:text-base disabled:opacity-30" :disabled="atFirstMonth" aria-label="Previous month" @click="prevMonth">‹</button>
            <span class="font-serif font-bold text-center truncate">{{ monthNames[calMonth] }} {{ selectedYear }}</span>
            <button type="button" class="w-11 h-11 sm:w-8 sm:h-8 flex-none rounded-lg sm:rounded-md border border-neutral-300 text-xl sm:text-base disabled:opacity-30" :disabled="atLastMonth" aria-label="Next month" @click="nextMonth">›</button>
          </div>
          <div class="grid grid-cols-7 gap-1 sm:gap-2 max-w-md mx-auto">
            <div v-for="d in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']" :key="d" class="font-mono text-[11px] text-neutral-400 text-center pb-1">{{ d }}</div>
            <div v-for="n in startOffset" :key="'blank'+n" />
            <button
              v-for="day in daysInMonth" :key="day"
              type="button"
              class="aspect-square flex items-center justify-center rounded-lg font-mono text-sm relative"
              :class="isFuture(day) ? 'text-neutral-300 cursor-default' : (isUnlocked(day) ? 'bg-green-50 font-bold border border-neutral-900' : 'hover:bg-neutral-100 border border-transparent')"
              :disabled="isFuture(day)"
              :aria-label="dateIsoFor(day)"
              @click="selectDay(day)"
            >{{ day }}</button>
          </div>
          <p class="sm:hidden mt-4 text-[12px] text-neutral-500 text-center pb-[env(safe-area-inset-bottom)]">Bold days are already unlocked for you.</p>
        </div>
      </div>
    </div>
  </div>
</template>