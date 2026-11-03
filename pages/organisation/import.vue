<!--
  Repo path: apps/web/pages/organisation/import.vue  (srcDir-relative)   NEW FILE
  URL:       /organisation/import

  Spreadsheet upload for Organisation Admins, in three steps:
    1. download the members spreadsheet (current members pre-filled, or a
       guided empty sheet), fill it in, upload it with a default period for
       NEW people (existing members change only if their row has dates)
    2. preview: every row with what will happen (new account, added,
       extended) or why it's skipped; nothing is written yet
    3. apply: one transaction; invite emails go out afterwards
  UPDATED (email domains): when the organisation only accepts some email
  domains, step 1 says so; rows outside them are skipped with the reason.
-->
<script setup>
import { ref, computed, onMounted } from 'vue';
import { definePageMeta, useHead } from '#imports';
import { NuxtLink } from '#components';
import { describeDomains } from '~/utils/emailDomains';
import { useEpaperApi } from '~/composables/useEpaperApi';
import OrgPeriodPicker, { toPeriodBody, newPeriod } from '~/components/OrgPeriodPicker.vue';

definePageMeta({ middleware: 'org-admin' });
useHead({ title: 'Upload members — New Vision e-paper' });

const { orgAdmin } = useEpaperApi();
const errMsg = (e, fallback) => e?.data?.error || e?.data?.message || fallback;
const statusOf = (e) => e?.response?.status ?? e?.statusCode ?? e?.status;

const step = ref(1);
const summary = ref(null);
const orgDomains = computed(() => summary.value?.organisation?.emailDomains || []);
const forbidden = ref('');
const file = ref(null);
const period = ref({ ...newPeriod(), mode: 'months', months: 12 });
const busy = ref(false);
const error = ref('');
const preview = ref(null);
const result = ref(null);
const rowFilter = ref('all');

onMounted(async () => {
  try {
    summary.value = await orgAdmin.summary();
  } catch (e) {
    if (statusOf(e) === 403) forbidden.value = errMsg(e, 'This page is for organisation admins.');
    else error.value = errMsg(e, 'Could not load your organisation.');
  }
});
const paidUntil = computed(() => summary.value?.paidPeriod?.current?.end || summary.value?.paidPeriod?.next?.end || null);

async function downloadTemplate() {
  try {
    const blob = await orgAdmin.template();
    const slug = (summary.value?.organisation?.name || 'organisation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    saveBlob(blob, `${slug}-members-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    error.value = errMsg(e, 'The spreadsheet could not be downloaded.');
  }
}

function onFile(ev) {
  file.value = ev.target.files?.[0] || null;
  error.value = '';
}

async function check() {
  if (!file.value) { error.value = 'Choose a file first.'; return; }
  error.value = '';
  busy.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file.value, file.value.name);
    fd.append('defaults', JSON.stringify(toPeriodBody(period.value)));
    preview.value = await orgAdmin.previewImport(fd);
    rowFilter.value = preview.value.summary.errors ? 'error' : 'all';
    step.value = 2;
  } catch (e) {
    error.value = errMsg(e, 'The file could not be checked.');
  } finally {
    busy.value = false;
  }
}

const actionable = computed(() => {
  const s = preview.value?.summary;
  return s ? s.newUsers + s.addExisting + s.extend : 0;
});

async function apply() {
  busy.value = true;
  error.value = '';
  try {
    result.value = await orgAdmin.commitImport(preview.value.importId);
    step.value = 3;
  } catch (e) {
    error.value = errMsg(e, 'The changes could not be applied. Nothing was changed.');
  } finally {
    busy.value = false;
  }
}

function restart() {
  step.value = 1;
  file.value = null;
  preview.value = null;
  result.value = null;
  error.value = '';
}

const ACTION = {
  new_user: { label: 'New account + invite', cls: 'bg-blue-50 text-blue-700' },
  add_existing: { label: 'Add (has account)', cls: 'bg-emerald-50 text-emerald-700' },
  extend: { label: 'Extend access', cls: 'bg-neutral-900 text-white' },
  keep: { label: 'No change', cls: 'bg-neutral-100 text-neutral-600' },
  error: { label: 'Skipped', cls: 'bg-red-50 text-red-700' }
};
const rowFilters = computed(() => {
  const s = preview.value?.summary || {};
  return [
    { value: 'all', label: 'All', n: s.total },
    { value: 'new_user', label: 'New', n: s.newUsers },
    { value: 'add_existing', label: 'Added', n: s.addExisting },
    { value: 'extend', label: 'Extended', n: s.extend },
    { value: 'keep', label: 'No change', n: s.keep ?? 0 },
    { value: 'error', label: 'Skipped', n: s.errors }
  ];
});
const shownRows = computed(() => {
  const rows = preview.value?.rows || [];
  return rowFilter.value === 'all' ? rows : rows.filter((r) => r.action === rowFilter.value);
});

function downloadProblems() {
  const rows = (result.value?.rows || preview.value?.rows || []).filter((r) => r.action === 'error');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Row,Email,Name,Phone,Problem', ...rows.map((r) => [r.row, r.email, r.displayName, r.phone, r.error].map(esc).join(','))].join('\r\n');
  saveBlob(new Blob([`﻿${csv}`], { type: 'text/csv' }), 'members-not-imported.csv');
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmt(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
  <div class="min-h-screen bg-neutral-100 text-neutral-900">
    <div class="bg-neutral-950 text-white">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <NuxtLink to="/organisation" class="font-mono text-xs text-neutral-300 hover:text-white">← Back to members</NuxtLink>
        <span class="font-mono text-xs text-neutral-400 truncate">{{ summary?.organisation?.name || 'Organisation admin' }}</span>
      </div>
    </div>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div v-if="forbidden" class="bg-white rounded-xl p-8 text-center shadow-sm">
        <h1 class="font-serif font-extrabold text-2xl">Organisation admins only</h1>
        <p class="text-sm text-neutral-600 mt-2">{{ forbidden }}</p>
        <NuxtLink to="/" class="inline-block mt-5 bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm">Go to the e-paper</NuxtLink>
      </div>

      <template v-else>
        <h1 class="font-serif font-extrabold text-3xl">Upload members</h1>
        <ol class="flex flex-wrap gap-2 mt-3 font-mono text-xs" aria-label="Steps">
          <li v-for="(label, i) in ['Choose file', 'Check', 'Done']" :key="label" class="px-3 py-1 rounded-full" :class="step === i + 1 ? 'bg-neutral-900 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-neutral-500'" :aria-current="step === i + 1 ? 'step' : undefined">{{ i + 1 }}. {{ label }}</li>
        </ol>

        <p v-if="error" class="mt-4 rounded-lg px-4 py-3 text-sm bg-red-50 text-red-800" role="alert">{{ error }}</p>

        <!-- step 1 -->
        <section v-if="step === 1" class="grid md:grid-cols-2 gap-5 mt-5">
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-serif font-bold text-lg">1. Download, fill in, upload</h2>
            <p class="text-sm text-neutral-600 mt-2">Download your members spreadsheet. It lists everyone in your organisation today; if there's nobody yet, it's an empty sheet with headings and help notes. Add one person per row; only <strong>Email</strong> is required.</p>
            <ul class="text-sm text-neutral-600 mt-3 list-disc pl-5 space-y-1">
              <li>New people get an account and an email to set their password.</li>
              <li>Existing members only change if you fill in their dates or months. Nobody is duplicated.</li>
              <li v-if="orgDomains.length">Only <strong>{{ describeDomains(orgDomains) }}</strong> email addresses are accepted. Other rows are skipped and listed.</li>
              <li>Nothing changes until you've seen the preview and confirmed.</li>
            </ul>
            <button class="mt-4 bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium" @click="downloadTemplate">Download members spreadsheet</button>
            <label class="block mt-5">
              <span class="text-xs font-mono text-neutral-600">File</span>
              <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:text-white file:px-4 file:py-2" @change="onFile">
            </label>
          </div>
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-serif font-bold text-lg">2. Access for new people</h2>
            <p class="text-sm text-neutral-600 mt-2 mb-4">Used for <strong>new</strong> people whose row has no dates or months. Existing members without dates are left as they are. Access never goes past the end of your paid period<template v-if="paidUntil"> ({{ fmt(paidUntil) }})</template>.</p>
            <OrgPeriodPicker v-model="period" :paid-until="paidUntil" id-prefix="imp" />
            <button class="mt-6 w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60" :disabled="busy || !file" @click="check">{{ busy ? 'Checking…' : 'Check file' }}</button>
          </div>
        </section>

        <!-- step 2 -->
        <section v-else-if="step === 2 && preview" class="mt-5">
          <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div class="bg-white rounded-xl shadow-sm p-4"><p class="font-mono text-[11px] text-neutral-500">New accounts</p><p class="font-serif font-extrabold text-2xl">{{ preview.summary.newUsers }}</p></div>
            <div class="bg-white rounded-xl shadow-sm p-4"><p class="font-mono text-[11px] text-neutral-500">Added (have account)</p><p class="font-serif font-extrabold text-2xl">{{ preview.summary.addExisting }}</p></div>
            <div class="bg-white rounded-xl shadow-sm p-4"><p class="font-mono text-[11px] text-neutral-500">Access extended</p><p class="font-serif font-extrabold text-2xl">{{ preview.summary.extend }}</p></div>
            <div class="bg-white rounded-xl shadow-sm p-4"><p class="font-mono text-[11px] text-neutral-500">No change</p><p class="font-serif font-extrabold text-2xl">{{ preview.summary.keep ?? 0 }}</p></div>
            <div class="bg-white rounded-xl shadow-sm p-4"><p class="font-mono text-[11px] text-neutral-500">Shortened to paid period</p><p class="font-serif font-extrabold text-2xl">{{ preview.summary.clipped }}</p></div>
            <div class="bg-white rounded-xl shadow-sm p-4" :class="preview.summary.errors ? 'ring-2 ring-red-200' : ''"><p class="font-mono text-[11px] text-neutral-500">Skipped</p><p class="font-serif font-extrabold text-2xl" :class="preview.summary.errors ? 'text-red-700' : ''">{{ preview.summary.errors }}</p></div>
          </div>

          <div class="bg-white rounded-xl shadow-sm mt-4">
            <div class="flex flex-wrap items-center gap-3 p-4">
              <div class="inline-flex flex-wrap rounded-lg bg-neutral-100 p-1" role="group" aria-label="Filter rows">
                <button v-for="f in rowFilters" :key="f.value" class="px-3 py-1 rounded-md text-sm" :class="rowFilter === f.value ? 'bg-white shadow-sm font-semibold' : 'text-neutral-600'" @click="rowFilter = f.value">{{ f.label }} <span class="font-mono text-xs">{{ f.n }}</span></button>
              </div>
              <button v-if="preview.summary.errors" class="ml-auto text-sm underline" @click="downloadProblems">Download skipped rows</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left font-mono text-[11px] text-neutral-500 border-b border-neutral-100">
                    <th class="px-4 py-2">Row</th><th class="px-4 py-2">Email</th><th class="px-4 py-2">Name</th><th class="px-4 py-2">What happens</th><th class="px-4 py-2">Access</th><th class="px-4 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in shownRows.slice(0, 500)" :key="r.row" class="border-b border-neutral-50 align-top">
                    <td class="px-4 py-2 font-mono text-xs text-neutral-500">{{ r.row }}</td>
                    <td class="px-4 py-2 break-all">{{ r.email || '—' }}</td>
                    <td class="px-4 py-2">{{ r.displayName || '—' }}</td>
                    <td class="px-4 py-2"><span class="font-mono text-[11px] px-2 py-0.5 rounded whitespace-nowrap" :class="ACTION[r.action]?.cls">{{ ACTION[r.action]?.label || r.action }}</span></td>
                    <td class="px-4 py-2 font-mono text-xs whitespace-nowrap">{{ r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : '—' }}</td>
                    <td class="px-4 py-2 text-xs" :class="r.error ? 'text-red-700' : 'text-neutral-600'">{{ r.error || r.notes?.join(' · ') || '' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="shownRows.length > 500" class="p-4 text-xs text-neutral-500">Showing the first 500 of {{ shownRows.length }} rows. All of them will be applied.</p>
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-2 mt-5">
            <button class="border border-neutral-300 bg-white rounded-lg px-4 py-2 text-sm" :disabled="busy" @click="restart">Choose another file</button>
            <button class="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" :disabled="busy || !actionable" @click="apply">
              {{ busy ? 'Applying…' : actionable ? `Apply ${actionable} ${actionable === 1 ? 'change' : 'changes'}` : 'Nothing to apply' }}
            </button>
          </div>
          <p class="text-xs text-neutral-500 text-right mt-2">Skipped and unchanged rows are left as they are. This preview is valid for 24 hours.</p>
        </section>

        <!-- step 3 -->
        <section v-else-if="step === 3 && result" class="bg-white rounded-xl shadow-sm p-6 mt-5 max-w-2xl">
          <h2 class="font-serif font-bold text-2xl">Done</h2>
          <ul class="mt-4 space-y-1 text-sm">
            <li><strong>{{ result.result.created }}</strong> new accounts created</li>
            <li><strong>{{ result.result.added }}</strong> existing readers added</li>
            <li><strong>{{ result.result.extended }}</strong> members' access extended<template v-if="result.result.unchanged">, {{ result.result.unchanged }} already had it</template></li>
            <li><strong>{{ result.result.kept ?? 0 }}</strong> members left unchanged</li>
            <li><strong>{{ result.result.skipped }}</strong> rows skipped</li>
          </ul>
          <p v-if="result.invitesQueued" class="text-sm text-neutral-600 mt-4">{{ result.invitesQueued }} invite {{ result.invitesQueued === 1 ? 'email is' : 'emails are' }} being sent. Anyone who doesn't receive theirs can be sent another from the members list.</p>
          <div class="flex flex-wrap gap-2 mt-6">
            <NuxtLink to="/organisation" class="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium">Back to members</NuxtLink>
            <button class="border border-neutral-300 rounded-lg px-4 py-2 text-sm" @click="restart">Upload another file</button>
            <button v-if="result.result.skipped" class="text-sm underline" @click="downloadProblems">Download skipped rows</button>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>