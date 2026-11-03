<script setup>
/**
 * components/reader/PaywallModal.vue                  REWRITTEN (Phase 0)
 *
 * Offers the plans that open the publication being read, at the standard
 * prices set in handle (no negotiation for individuals; organisations are
 * set up by New Vision instead). Plans come from GET /api/pay/plans?publication=…
 *   - a CURRENT edition (it covers today or later): single issue, every
 *     period plan that includes this publication, and bundles with it
 *   - an ARCHIVE edition: single issue only — a subscription bought today
 *     starts today and does not reach back to past editions
 * Longer plans say when they cost less per month than the 1-month plan for
 * the same publications.
 */
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from '#imports';
import { NuxtLink } from '#components';
import { useEpaperApi } from '~/composables/useEpaperApi';
import { useReaderStore } from '~/stores/reader';
import { useAccountStore } from '~/stores/account';

const props = defineProps({
  open: { type: Boolean, required: true },
  publication: { type: String, required: true },
  edition: { type: Object, default: null }, // locked edition response: date, coversFrom, coversTo, publication, price
  dateIso: { type: String, required: true }
});
const emit = defineEmits(['close']);

const route = useRoute();
const router = useRouter();
const api = useEpaperApi();
const reader = useReaderStore();
const account = useAccountStore();

const plans = ref([]);
const plansLoading = ref(false);
const plansError = ref(null);
const selectedPlanKey = ref(null);

const pubName = computed(() => props.edition?.publication?.name || props.publication);
const coversTo = computed(() => props.edition?.coversTo || props.dateIso);
const isCurrent = computed(() => coversTo.value >= reader.todayIso());

/** Days, for comparing prices per month. */
function days(p) {
  const n = p.durationCount || 1;
  return p.durationUnit === 'day' ? n : p.durationUnit === 'week' ? 7 * n : p.durationUnit === 'year' ? 365 * n : 30 * n;
}
const samePubs = (a, b) => a.publications.join(',') === b.publications.join(',');

const offered = computed(() => {
  const single = plans.value.filter(p => p.kind === 'single_issue');
  const periods = isCurrent.value ? plans.value.filter(p => p.kind === 'period') : [];
  periods.sort((a, b) => (a.publications.length - b.publications.length) || (days(a) - days(b)));
  return [...single, ...periods];
});
const selectedPlan = computed(() => offered.value.find(p => p.key === selectedPlanKey.value) || null);

watch(() => [props.open, props.publication], async ([open]) => {
  if (!open) return;
  plansLoading.value = true;
  plansError.value = null;
  try {
    const res = await api.getPlans(props.publication);
    plans.value = res.plans || [];
  } catch {
    plans.value = [];
    plansError.value = 'Plans could not be loaded. Please try again.';
  } finally {
    plansLoading.value = false;
    // A plan chosen on the landing page arrives as ?plan=<key>.
    const wanted = String(route.query.plan || '');
    if (wanted && offered.value.some(p => p.key === wanted)) selectedPlanKey.value = wanted;
    else if (!offered.value.some(p => p.key === selectedPlanKey.value)) selectedPlanKey.value = offered.value[0]?.key || null;
  }
}, { immediate: true });

function fmtDay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function periodEnd(p) {
  const start = reader.todayIso();
  const [y, m, d] = start.split('-').map(Number);
  const n = p.durationCount || 1;
  let next;
  if (p.durationUnit === 'day') next = new Date(Date.UTC(y, m - 1, d + n));
  else if (p.durationUnit === 'week') next = new Date(Date.UTC(y, m - 1, d + 7 * n));
  else {
    const months = p.durationUnit === 'year' ? 12 * n : n;
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    next = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
  }
  next.setUTCDate(next.getUTCDate() - 1);
  return next.toISOString().slice(0, 10);
}
function termLabel(p) {
  if (p.kind === 'single_issue') return isCurrent.value && props.dateIso === reader.todayIso() ? 'Today only' : 'This edition';
  const n = p.durationCount || 1;
  return `${n} ${p.durationUnit}${n === 1 ? '' : 's'}`;
}
function detail(p) {
  if (p.kind === 'single_issue') return `${pubName.value}, ${fmtDay(props.edition?.date || props.dateIso)} — this one edition`;
  const others = p.publications.filter(c => c !== props.publication);
  const what = others.length ? `${props.publication} + ${others.join(' + ')}` : `Every ${pubName.value} edition`;
  return `${what} until ${fmtDay(periodEnd(p))}`;
}
/** "lower price per month" when this period costs less per day than the
 * shortest plan for exactly the same publications. */
function cheaperTag(p) {
  if (p.kind !== 'period') return '';
  const base = plans.value.filter(x => x.kind === 'period' && samePubs(x, p)).sort((a, b) => days(a) - days(b))[0];
  if (!base || base.key === p.key || !base.price) return '';
  return p.price / days(p) < base.price / days(base) ? 'lower price per month' : '';
}
const money = (p) => `${Number(p.price).toLocaleString()} ${p.currency || 'UGX'}`;

const otherAccess = computed(() => {
  const open = Object.entries(account.publications || {}).filter(([code, a]) => code !== props.publication && a.today).map(([code]) => code);
  return open.length ? `Your access covers ${open.join(', ')}, not ${props.publication}.` : '';
});

const phoneNumber = ref('');
// Kept for the customer's own clarity; the gateway takes payment_method
// "momo" for both networks (confirmed against VisionShop's working flow).
const selectedNetwork = ref('MTN');
const submitting = ref(false);
const error = ref(null);

async function continueToPayment() {
  if (!account.loggedIn) {
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  if (!selectedPlan.value) { error.value = 'Choose a plan.'; return; }
  if (!phoneNumber.value.trim()) { error.value = 'Enter the phone number to pay with.'; return; }

  submitting.value = true;
  error.value = null;
  try {
    const res = await api.startCheckout({
      planKey: selectedPlan.value.key,
      phoneNumber: phoneNumber.value.trim(),
      paymentmethod: 'momo',
      dates: selectedPlan.value.kind === 'single_issue' ? [props.edition?.date || props.dateIso] : undefined,
      publication: props.publication // analytics: the paper being read when checkout started
    });
    emit('close');
    router.push({
      path: '/pay/return',
      query: { receiptToken: res.receiptToken, pub: props.publication.toLowerCase(), date: props.edition?.date || props.dateIso }
    });
  } catch (e) {
    error.value = e?.data?.error || 'Could not start payment. Please try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity"
    :class="open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    @click.self="emit('close')"
  >
    <div v-if="open" role="dialog" aria-modal="true" aria-labelledby="pw-title" class="relative w-full max-w-md bg-white text-neutral-900 rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
      <button class="absolute top-3 right-4 w-9 h-9 text-neutral-400 hover:text-neutral-900" aria-label="Close" @click="emit('close')">✕</button>

      <div class="px-6 pt-6 pb-4 border-b border-neutral-100">
        <p class="font-mono text-[11px] uppercase tracking-wider" :style="{ color: edition?.publication?.colour || '#525252' }">{{ pubName }}</p>
        <h2 id="pw-title" class="font-serif font-extrabold text-2xl mt-1">{{ isCurrent ? `Read ${pubName}` : 'Unlock this edition' }}</h2>
        <p class="text-sm text-neutral-500 mt-1">
          <template v-if="otherAccess">{{ otherAccess }} </template>
          {{ isCurrent ? 'Choose how you would like to read it.' : 'Buy this archive edition to keep it in your library.' }}
        </p>
      </div>

      <div class="px-6 py-4">
        <template v-if="!account.loggedIn">
          <button class="w-full bg-neutral-900 text-white rounded-lg py-3 font-mono text-sm" @click="continueToPayment">Sign in to continue</button>
        </template>

        <template v-else>
          <div v-if="plansLoading" class="text-sm text-neutral-400 py-6 text-center">Loading plans…</div>
          <p v-else-if="plansError" class="text-sm text-red-600 py-4">{{ plansError }}</p>
          <p v-else-if="!offered.length" class="text-sm text-neutral-500 py-4">{{ pubName }} is not on sale right now.</p>

          <div v-else role="radiogroup" aria-label="Plan" class="space-y-2 mb-5">
            <label
              v-for="p in offered" :key="p.key"
              class="flex items-center gap-3 border rounded-xl px-3.5 py-3 cursor-pointer transition"
              :class="selectedPlanKey === p.key ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'"
            >
              <input v-model="selectedPlanKey" type="radio" name="plan" :value="p.key" class="accent-neutral-900 w-4 h-4">
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-semibold">{{ p.label || termLabel(p) }}</span>
                <span class="block text-xs text-neutral-500 mt-0.5">{{ detail(p) }}</span>
              </span>
              <span class="flex flex-col items-end gap-1">
                <span class="font-mono text-sm whitespace-nowrap">{{ money(p) }}</span>
                <span v-if="cheaperTag(p)" class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">{{ cheaperTag(p) }}</span>
              </span>
            </label>
          </div>

          <div v-if="offered.length" class="grid grid-cols-2 gap-3 mb-4">
            <label class="block">
              <span class="text-xs font-mono text-neutral-600">Pay with</span>
              <select v-model="selectedNetwork" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-900">
                <option value="MTN">MTN Mobile Money</option>
                <option value="AIRTEL">Airtel Money</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-mono text-neutral-600">Phone number</span>
              <input v-model="phoneNumber" type="tel" placeholder="07XXXXXXXX" autocomplete="tel" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neutral-900">
            </label>
          </div>

          <button
            v-if="offered.length"
            :disabled="submitting || plansLoading || !selectedPlan"
            class="w-full bg-neutral-900 text-white rounded-lg py-3 font-mono text-sm disabled:opacity-60"
            @click="continueToPayment"
          >{{ submitting ? 'Sending payment request…' : (selectedPlan ? `Pay ${money(selectedPlan)}` : 'Choose a plan') }}</button>
        </template>

        <p v-if="error" class="text-red-600 text-xs mt-3">{{ error }}</p>
        <p class="text-[11px] text-neutral-400 mt-4">Standard prices set by Vision Group. You'll get a payment prompt on your phone — enter your PIN there. Organisations: contact us for a contract.</p>
        <NuxtLink to="/" class="inline-block text-xs text-neutral-500 underline mt-2">All publications</NuxtLink>
      </div>
    </div>
  </div>
</template>
