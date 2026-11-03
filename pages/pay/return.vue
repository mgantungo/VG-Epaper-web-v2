<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from '#imports';
import { NuxtLink } from '#components';
import { useEpaperApi } from '~/composables/useEpaperApi';
import { useAccountStore } from '~/stores/account';

const route = useRoute();
const router = useRouter();
const api = useEpaperApi();
const account = useAccountStore();

const receiptToken = route.query.receiptToken;
const dateIso = route.query.date;
// Phase 0: which paper was bought (/nv, /bk, …). Older links without it mean New Vision.
const pub = String(route.query.pub || 'nv').toLowerCase().replace(/[^a-z0-9]/g, '') || 'nv';

// 'waiting' | 'success' | 'failed' | 'timeout' | 'error'
const status = ref('waiting');
const failureReason = ref(null);
let pollTimer = null;

function editionPath() {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return `/${pub}`;
  const [y, m, d] = dateIso.split('-');
  return `/${pub}/${y}/${m}/${d}`;
}

// Polls the account's own entitlement state, not just the payment status —
// frontend_status: success only means the AGGREGATOR confirmed the charge,
// not that grantEntitlement() (fire-and-forget on the CMS side) has
// finished writing the actual Entitlement record yet. Redirecting the
// instant payment succeeds, without confirming access actually exists,
// was landing back on the still-locked paywall. Checked every 800ms for
// up to 10s — generous relative to how fast a single DB write normally
// completes, short enough not to leave someone staring at "confirmed"
// for long if something's genuinely slow.
async function waitForEntitlementThenRedirect() {
  // Phase 0: the payment status itself now says when access exists
  // (access_ready), so this no longer guesses from the account's date
  // ranges — which a bundle or a weekend edition made unreliable.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const s = await api.getPaymentStatus(receiptToken);
      if (s.access_ready) break;
    } catch { /* keep trying until the deadline */ }
    await new Promise(r => setTimeout(r, 800));
  }
  await account.refresh();
  router.push(editionPath());
}

async function poll(startedAt) {
  if (!receiptToken) {
    status.value = 'error';
    return;
  }
  // Real PIN-prompt payments can genuinely take a while — this window is
  // deliberately longer than the old "assume yes" placeholder ever needed,
  // since that granted access instantly and never had anything to wait on.
  const maxWaitMs = 90 * 1000;
  if (Date.now() - startedAt > maxWaitMs) {
    status.value = 'timeout';
    return;
  }

  try {
    const result = await api.getPaymentStatus(receiptToken);

    if (result.frontend_status === 'success') {
      status.value = 'success';
      // grantEntitlement() runs fire-and-forget on the CMS side (deliberately
      // — see epaper-transaction.js's callback action — so a slow entitlement
      // write never delays acknowledging the aggregator's webhook). That
      // means the entitlement may not exist YET at the exact moment this
      // page sees frontend_status: success. A single refresh + fixed
      // timeout redirect was a real race — confirmed directly: it could
      // land back on the still-locked paywall if grantEntitlement hadn't
      // finished yet. Poll for the entitlement to actually be confirmed
      // before redirecting, rather than guessing at a delay long enough.
      await waitForEntitlementThenRedirect();
      return;
    }
    if (result.frontend_status === 'failed') {
      status.value = 'failed';
      failureReason.value = result.failure_reason;
      return;
    }
    if (result.frontend_status === 'timeout') {
      status.value = 'timeout';
      return;
    }
    // still pending/processing — customer hasn't approved (or declined) the
    // prompt yet, keep waiting
    pollTimer = setTimeout(() => poll(startedAt), 2500);
  } catch {
    status.value = 'error';
  }
}

onMounted(() => poll(Date.now()));
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer); });
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
    <div class="w-full max-w-sm bg-white text-neutral-900 rounded-xl p-8 shadow-2xl text-center">
      <template v-if="status === 'waiting'">
        <div class="text-4xl mb-3 animate-pulse">📱</div>
        <h1 class="font-serif font-extrabold text-xl mb-1">Check your phone</h1>
        <p class="text-sm text-neutral-500">Approve the payment prompt with your PIN to unlock this edition.</p>
      </template>

      <template v-else-if="status === 'success'">
        <div class="text-4xl mb-3">✅</div>
        <h1 class="font-serif font-extrabold text-xl mb-1">Payment confirmed</h1>
        <p class="text-sm text-neutral-500">Taking you to your edition…</p>
      </template>

      <template v-else-if="status === 'failed'">
        <div class="text-4xl mb-3">✕</div>
        <h1 class="font-serif font-extrabold text-xl mb-1">Payment didn't go through</h1>
        <p class="text-sm text-neutral-500 mb-4">{{ failureReason || 'Please try again.' }}</p>
        <NuxtLink :to="editionPath()" class="text-sm underline">Back to the edition</NuxtLink>
      </template>

      <template v-else-if="status === 'timeout'">
        <div class="text-4xl mb-3">⏱</div>
        <h1 class="font-serif font-extrabold text-xl mb-1">Still waiting</h1>
        <p class="text-sm text-neutral-500 mb-4">This is taking longer than expected. If you already approved it on your phone, try reopening the edition in a moment.</p>
        <NuxtLink :to="editionPath()" class="text-sm underline">Back to the edition</NuxtLink>
      </template>

      <template v-else>
        <div class="text-4xl mb-3">⚠️</div>
        <h1 class="font-serif font-extrabold text-xl mb-1">Something went wrong</h1>
        <NuxtLink to="/" class="text-sm underline">Back home</NuxtLink>
      </template>
    </div>
  </div>
</template>