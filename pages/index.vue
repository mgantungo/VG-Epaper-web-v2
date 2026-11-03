<script setup>
/**
 * Route: /                                   NEW FILE (Phase 0), REDESIGNED
 *
 * The landing page: readers choose what to read. Same shape as the current
 * e-paper site — large front-page covers grouped into sections (Newspapers,
 * Pullouts and supplements, Magazines, Other), name under each cover — on a
 * light page. Each publication is its own tile (New Vision daily and New
 * Vision weekend are two tiles), because each is sold separately.
 * Below the covers: a subscribe banner and the plans and bundles on sale.
 *
 * Everything comes from GET /api/catalogue — publications, their section
 * (handle > Publications > "Section on landing page"), covers, prices and
 * plans are managed in handle, never hard-coded here.
 * Loaded in the browser only (the access-token cookie is client-side).
 * Phases 1–4: opening a paper from here is recorded as "came in by landing page".
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { NuxtLink } from '#components';
import { useEpaperApi } from '~/composables/useEpaperApi';
import { useAccountStore } from '~/stores/account';
import { setNextVia } from '~/composables/useReadingTracker';

useHead({ title: 'Vision Group e-papers' });

const api = useEpaperApi();
const account = useAccountStore();

const catalogue = ref(null);
const loading = ref(true);
const loadError = ref(null);
const brokenCovers = reactive({});

const SECTIONS = [
  { key: 'newspaper', label: 'Newspapers' },
  { key: 'supplement', label: 'Newspaper pullouts and supplements' },
  { key: 'magazine', label: 'Magazines' },
  { key: 'other', label: 'More publications' }
];

onMounted(async () => {
  try {
    catalogue.value = await api.getCatalogue();
  } catch {
    loadError.value = 'Publications could not be loaded. Please try again.';
  } finally {
    loading.value = false;
  }
  account.refresh();
});

// Every publication, in the order handle gives them.
const publications = computed(() =>
  (catalogue.value?.titles || []).flatMap(t => (t.publications || []).filter(p => p && p.code))
);
const sections = computed(() =>
  SECTIONS.map(s => ({ ...s, items: publications.value.filter(p => (p.category || 'newspaper') === s.key) }))
    .filter(s => s.items.length)
);
// Only plans that name at least one publication can be linked to.
const plans = computed(() => (catalogue.value?.plans || []).filter(p => Array.isArray(p.publications) && p.publications.length));
const pubByCode = computed(() => Object.fromEntries(publications.value.map(p => [p.code, p])));

function fmtDay(iso, withWeekday = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    ...(withWeekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
}
function editionDate(p) {
  const e = p.latestEdition;
  if (!e) return 'Coming soon';
  return e.coversTo && e.coversTo !== e.coversFrom ? `${fmtDay(e.coversFrom)} – ${fmtDay(e.coversTo)}` : fmtDay(e.date, true);
}
const readPath = (p) => `/${String(p?.code || 'nv').toLowerCase()}`;
function accessBadge(p) {
  if (!p.access?.today) return null;
  return p.access.via === 'organisation' ? 'Via your organisation' : 'Subscribed';
}
function termText(plan) {
  if (plan.kind === 'single_issue') return 'one edition';
  const n = plan.durationCount || 1;
  return `${n} ${plan.durationUnit}${n === 1 ? '' : 's'}`;
}
const money = (plan) => `${plan.currency || 'UGX'} ${Number(plan.price).toLocaleString()}`;
const planPath = (plan) => ({ path: `/${String(plan.publications?.[0] || 'nv').toLowerCase()}`, query: { plan: plan.key } });
const coverSrc = (p) => (p.latestEdition?.coverUrl && !brokenCovers[p.code] ? api.mediaUrl(p.latestEdition.coverUrl) : null);
const cheapest = computed(() => plans.value.reduce((m, p) => (m === null || Number(p.price) < m.price ? { price: Number(p.price), currency: p.currency || 'UGX' } : m), null));
</script>

<template>
  <div class="min-h-screen bg-white text-neutral-900">
    <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200">
      <div class="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center gap-4">
        <img src="/logo.png" alt="" class="w-10 h-10 rounded-md object-contain flex-none" />
        <span class="font-semibold tracking-tight">Vision Group <span class="text-[#6b0f0f]">e-papers</span></span>
        <span class="flex-1" />
        <span class="hidden md:inline text-sm text-neutral-500">{{ catalogue ? fmtDay(catalogue.today, true) : '' }}</span>
        <a href="#subscribe" class="hidden sm:flex h-10 px-4 rounded-lg border border-neutral-300 hover:border-neutral-900 text-sm items-center">Subscribe</a>
        <NuxtLink v-if="!account.loggedIn" to="/login" class="h-10 px-4 rounded-lg bg-[#6b0f0f] hover:bg-[#560b0b] text-white text-sm font-medium flex items-center">Sign in</NuxtLink>
        <span v-else class="h-10 px-3 rounded-lg bg-neutral-100 text-sm flex items-center truncate max-w-[220px]">{{ account.user?.displayName || account.user?.email || 'My account' }}</span>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <p v-if="loading" class="text-sm text-neutral-500 py-16 text-center">Loading publications…</p>
      <p v-else-if="loadError" class="text-sm text-red-700 py-16 text-center">{{ loadError }}</p>

      <template v-else>
        <section v-for="s in sections" :key="s.key" class="mb-12" :aria-labelledby="`sec-${s.key}`">
          <h2 :id="`sec-${s.key}`" class="text-2xl sm:text-3xl font-bold text-[#6b0f0f] mb-5">{{ s.label }}</h2>
          <ul class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8 sm:gap-x-8">
            <li v-for="p in s.items" :key="p.code">
              <NuxtLink :to="readPath(p)" class="group block" @click="setNextVia('landing')" :aria-label="`${p.name}, ${editionDate(p)}`">
                <div class="relative rounded-2xl border-[3px] border-neutral-300 group-hover:border-neutral-500 bg-neutral-100 p-1.5 shadow-sm group-hover:shadow-lg transition">
                  <img
                    v-if="coverSrc(p)"
                    :src="coverSrc(p)"
                    alt=""
                    loading="lazy"
                    class="w-full aspect-[900/1056] object-cover object-top rounded-lg bg-white"
                    @error="brokenCovers[p.code] = true"
                  >
                  <div
                    v-else
                    class="w-full aspect-[900/1056] rounded-lg flex flex-col items-center justify-center text-center px-4"
                    :style="{ background: `linear-gradient(160deg, ${p.colour || '#525252'} 0%, ${p.colour || '#525252'}cc 55%, #171717 100%)` }"
                  >
                    <span class="font-serif font-bold text-white text-2xl sm:text-3xl leading-tight drop-shadow">{{ p.name }}</span>
                    <span class="mt-2 text-xs text-white/80">{{ p.latestEdition ? 'Front page coming' : 'Coming soon' }}</span>
                  </div>
                  <span v-if="accessBadge(p)" class="absolute top-3 left-3 text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 text-white shadow">✓ {{ accessBadge(p) }}</span>
                </div>
                <p class="mt-3 text-center text-sm sm:text-[15px] uppercase tracking-wide text-neutral-600 group-hover:text-neutral-900">{{ p.name }}</p>
                <p class="text-center text-xs text-neutral-400 mt-0.5">{{ editionDate(p) }}<template v-if="p.scheduleNote"> · {{ p.scheduleNote }}</template></p>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <p v-if="!sections.length" class="text-neutral-500 py-16 text-center">No publications yet.</p>

        <!-- Subscribe banner -->
        <section id="subscribe" class="mt-4 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200" aria-labelledby="sub-h">
          <div class="px-6 sm:px-10 py-8 sm:py-10 flex flex-wrap items-center gap-6 justify-between border-b-4 border-[#b91c1c]">
            <div>
              <span class="inline-block bg-neutral-900 text-white font-black tracking-wider px-3 py-1 text-sm">E-PAPER</span>
              <p class="text-[#b91c1c] font-extrabold text-xl sm:text-2xl mt-3">Get your favourite news online</p>
              <h2 id="sub-h" class="text-neutral-600 font-black text-3xl sm:text-5xl tracking-tight">Subscribe today!</h2>
            </div>
            <p v-if="cheapest" class="text-neutral-700 text-lg">From <span class="font-bold">{{ cheapest.currency }} {{ cheapest.price.toLocaleString() }}</span></p>
          </div>

          <ul v-if="plans.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6 sm:p-8">
            <li v-for="plan in plans" :key="plan.key">
              <NuxtLink :to="planPath(plan)" @click="setNextVia('landing')" class="block h-full bg-white rounded-xl border border-neutral-200 hover:border-neutral-900 p-4">
                <span class="flex flex-wrap gap-1.5">
                  <span v-for="c in plan.publications" :key="c" class="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded text-white" :style="{ background: pubByCode[c]?.colour || '#525252' }">{{ c }}</span>
                </span>
                <span class="block font-semibold mt-2">{{ plan.label }}</span>
                <span class="block text-sm text-neutral-500">{{ plan.publications.map(c => pubByCode[c]?.name || c).join(' + ') }} · {{ termText(plan) }}</span>
                <span class="block font-mono mt-2">{{ money(plan) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <p class="text-[13px] text-neutral-500 mt-8 max-w-3xl">
          Reading through your organisation? The publications your organisation pays for open automatically.
          Your administrator sees the days you signed in and the publications you opened — not what you read.
        </p>
      </template>
    </main>
  </div>
</template>
