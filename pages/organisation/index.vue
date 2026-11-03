<!--
  Repo path: apps/web/pages/organisation/index.vue  (srcDir-relative)   NEW FILE
  URL:       /organisation

  Organisation Admin dashboard: seats, paid period, members (search,
  filter, add, extend access, suspend / reactivate, make or remove admin,
  resend invite, remove) and the activity log. Spreadsheet upload lives on
  /organisation/import. Every action is re-authorised by the server from
  the reader's own admin seat; a non-admin sees a plain explanation.
  UPDATED (Phase 0, publications): seats per publication (no amounts), and
  which paid publications each member reads, set when adding a member and
  switchable per member. Each publication's seats are capped by its contract.
  UPDATED (Phases 1–4, analytics): a Usage tab — which days each member was
  active and which papers they opened (components/OrgUsagePanel.vue).
  UPDATED (email domains): when New Vision has limited the organisation to
  some email domains (summary.organisation.emailDomains), the page says so
  and Add member warns before sending an email outside them. The server
  refuses it regardless.
-->
<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { definePageMeta, useHead } from '#imports';
import { NuxtLink } from '#components';
import { useEpaperApi } from '~/composables/useEpaperApi';
import OrgPeriodPicker, { toPeriodBody, newPeriod } from '~/components/OrgPeriodPicker.vue';
import OrgUsagePanel from '~/components/OrgUsagePanel.vue';
import { emailFitsDomains, describeDomains } from '~/utils/emailDomains';

definePageMeta({ middleware: 'org-admin' });
useHead({ title: 'Manage organisation — Vision Group e-papers' });

const { orgAdmin } = useEpaperApi();
const today = new Date().toISOString().slice(0, 10);

const summary = ref(null);
const orgDomains = computed(() => summary.value?.organisation?.emailDomains || []);
const loadError = ref('');
const forbidden = ref(false);
const flash = reactive({ text: '', ok: true });
let flashTimer = null;
function say(text, ok = true) {
  flash.text = text; flash.ok = ok;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.text = ''), 7000);
}
const errMsg = (e, fallback) => e?.data?.error || e?.data?.message || fallback;
const statusOf = (e) => e?.response?.status ?? e?.statusCode ?? e?.status;

async function loadSummary() {
  try {
    summary.value = await orgAdmin.summary();
    loadError.value = '';
  } catch (e) {
    if (statusOf(e) === 403) { forbidden.value = true; loadError.value = errMsg(e, ''); }
    else if (statusOf(e) === 401) { loadError.value = 'Your session has ended. Sign in again.'; }
    else loadError.value = errMsg(e, 'Could not load your organisation.');
  }
}

const paidUntil = computed(() => summary.value?.paidPeriod?.current?.end || summary.value?.paidPeriod?.next?.end || null);
const seatsFull = computed(() => {
  const s = summary.value?.seats;
  return s && s.limit != null && s.inUse >= s.limit;
});

// ---- members ----
const members = ref([]);
const pagination = ref(null);
const page = ref(1);
const search = ref('');
const filter = ref('');
const membersLoading = ref(false);
const filters = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admin', label: 'Admins' }
];

async function loadMembers() {
  membersLoading.value = true;
  try {
    const query = { page: page.value, pageSize: 25 };
    if (search.value.trim()) query.search = search.value.trim();
    if (filter.value === 'admin') query.role = 'admin';
    else if (filter.value) query.status = filter.value;
    const res = await orgAdmin.members(query);
    members.value = res.members || [];
    pagination.value = res.pagination || null;
  } catch (e) {
    if (statusOf(e) === 403) forbidden.value = true;
    else say(errMsg(e, 'Members could not be loaded.'), false);
  } finally {
    membersLoading.value = false;
  }
}
let searchTimer = null;
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; loadMembers(); }, 300); });
watch(filter, () => { page.value = 1; loadMembers(); });
watch(page, loadMembers);

const isMe = (m) => summary.value && m.seatId === summary.value.you?.seatId;
function accessText(m) {
  if (m.access.contractWide) return { text: 'Whole paid period', cls: 'text-neutral-700' };
  if (m.access.current) {
    const soon = daysUntil(m.access.current.end) <= 14;
    return { text: `Until ${fmt(m.access.current.end)}`, cls: soon ? 'text-amber-700' : 'text-neutral-700' };
  }
  if (m.access.latestEnd && m.access.latestEnd >= today) return { text: 'Starts later', cls: 'text-blue-700' };
  if (m.access.latestEnd) return { text: `Ended ${fmt(m.access.latestEnd)}`, cls: 'text-red-700' };
  return { text: 'No access yet', cls: 'text-red-700' };
}

// ---- add member ----
const adding = ref(false);
const addForm = reactive({ email: '', displayName: '', phone: '', period: newPeriod(), publications: [] });

// ---- publications (Phase 0) ----
const pubSeats = computed(() => summary.value?.publications || []);
const pubHasRoom = (p) => (p.current || p.next) && (p.seats === null || p.inUse < p.seats);
const memberReads = (m, code) => m.publications === null || (m.publications || []).includes(code);
async function toggleMemberPub(m, code, on) {
  const current = m.publications === null ? pubSeats.value.map((p) => p.code) : (m.publications || []);
  const next = on ? [...new Set([...current, code])] : current.filter((c) => c !== code);
  busy.value = true;
  try {
    const res = await orgAdmin.setPublications(m.seatId, next);
    m.publications = res.publications;
    say(`${who(m)} now reads ${next.length ? next.join(', ') : 'no publications'}.`);
    await loadSummary();
  } catch (e) {
    say(errMsg(e, 'That did not work.'), false);
  } finally {
    busy.value = false;
  }
}
const addError = ref('');
const busy = ref(false);
function openAdd() {
  Object.assign(addForm, { email: '', displayName: '', phone: '', period: newPeriod(), publications: pubSeats.value.filter(pubHasRoom).map((p) => p.code) });
  addError.value = '';
  adding.value = true;
}
async function submitAdd() {
  addError.value = '';
  if (!emailFitsDomains(addForm.email, orgDomains.value)) {
    addError.value = `Your organisation only accepts ${describeDomains(orgDomains.value)} email addresses.`;
    return;
  }
  busy.value = true;
  try {
    const res = await orgAdmin.addMember({
      email: addForm.email.trim(),
      displayName: addForm.displayName.trim() || undefined,
      phone: addForm.phone.trim() || undefined,
      publications: addForm.publications,
      ...toPeriodBody(addForm.period)
    });
    adding.value = false;
    let msg = `${addForm.email.trim()} added, with access until ${fmt(res.access.end)}.`;
    if (res.invited) msg += res.emailSent ? ' They have been emailed a link to set their password.' : ' The invite email could not be sent: use "Resend invite".';
    if (res.clipped) msg += ' The period was shortened to the end of the paid period.';
    say(msg, res.emailSent !== false);
    await Promise.all([loadMembers(), loadSummary()]);
  } catch (e) {
    addError.value = errMsg(e, 'This member could not be added.');
  } finally {
    busy.value = false;
  }
}

// ---- dialogs (extend, suspend, role, remove) ----
const dialog = ref(null);
function openExtend(m) {
  dialog.value = { kind: 'extend', member: m, period: newPeriod(), title: `Extend access for ${who(m)}` };
}
function openStatus(m, status) {
  dialog.value = status === 'suspended'
    ? { kind: 'status', member: m, status, reason: '', title: `Suspend ${who(m)}`, text: 'They stop being able to read straight away. Their seat is freed and their access dates are kept, so you can reactivate them later.', confirm: 'Suspend', danger: true }
    : { kind: 'status', member: m, status, title: `Reactivate ${who(m)}`, text: 'They can read again within their access dates. This uses a seat.', confirm: 'Reactivate' };
}
function openRole(m) {
  const toAdmin = m.role !== 'admin';
  dialog.value = {
    kind: 'role', member: m, role: toAdmin ? 'admin' : 'member',
    title: toAdmin ? `Make ${who(m)} an admin` : `Remove admin role from ${who(m)}`,
    text: toAdmin ? 'Admins can add, suspend and remove members, upload spreadsheets and change access, exactly like you.' : 'They stay a member with their current access, but can no longer manage members.',
    confirm: toAdmin ? 'Make admin' : 'Remove admin role'
  };
}
function openRemove(m) {
  dialog.value = {
    kind: 'remove', member: m, reason: '', danger: true,
    title: `Remove ${who(m)}`,
    text: 'Their organisation access ends straight away and their seat is freed. Their own e-paper account and anything they bought themselves are not affected. To pause access instead, use Suspend.',
    confirm: 'Remove from organisation'
  };
}
async function runDialog() {
  const d = dialog.value;
  if (!d) return;
  d.error = '';
  busy.value = true;
  try {
    const m = d.member;
    if (d.kind === 'extend') {
      const res = await orgAdmin.grantAccess(m.seatId, toPeriodBody(d.period));
      const verb = res.access.action === 'created' ? 'given access' : res.access.action === 'unchanged' ? 'already had this access' : 'extended';
      say(`${who(m)} ${verb}: until ${fmt(res.access.end)}.${res.clipped ? ' Shortened to the end of the paid period.' : ''}`);
    } else if (d.kind === 'status') {
      await orgAdmin.setStatus(m.seatId, d.status, d.reason);
      say(d.status === 'suspended' ? `${who(m)} suspended.` : `${who(m)} reactivated.`);
    } else if (d.kind === 'role') {
      await orgAdmin.setRole(m.seatId, d.role);
      say(d.role === 'admin' ? `${who(m)} is now an admin.` : `${who(m)} is no longer an admin.`);
    } else if (d.kind === 'remove') {
      await orgAdmin.remove(m.seatId, d.reason);
      say(`${who(m)} removed from the organisation.`);
    }
    dialog.value = null;
    await Promise.all([loadMembers(), loadSummary()]);
  } catch (e) {
    d.error = errMsg(e, 'That did not work.');
  } finally {
    busy.value = false;
  }
}
async function resend(m) {
  try {
    const res = await orgAdmin.resendInvite(m.seatId);
    say(res.emailSent ? `Invite re-sent to ${m.user.email}.` : 'The invite could not be emailed. Try again shortly.', res.emailSent);
  } catch (e) {
    say(errMsg(e, 'The invite could not be re-sent.'), false);
  }
}

// ---- tabs / activity ----
const tab = ref('members');
const audit = ref([]);
const auditPage = ref(0);
const auditMore = ref(false);
const auditLoading = ref(false);
async function loadAudit(more = false) {
  auditLoading.value = true;
  try {
    const next = more ? auditPage.value + 1 : 1;
    const res = await orgAdmin.audit({ page: next, pageSize: 30 });
    audit.value = more ? [...audit.value, ...(res.entries || [])] : (res.entries || []);
    auditPage.value = next;
    auditMore.value = res.pagination ? next < res.pagination.pageCount : false;
  } catch (e) {
    say(errMsg(e, 'Activity could not be loaded.'), false);
  } finally {
    auditLoading.value = false;
  }
}
watch(tab, (t) => { if (t === 'activity') loadAudit(); });

const ACTIONS = {
  'org.create': 'Organisation created', 'org.update': 'Organisation details changed', 'org.suspend': 'Organisation suspended',
  'org.reactivate': 'Organisation reactivated', 'org.archive': 'Organisation archived',
  'contract.create': 'Paid period added', 'contract.extend': 'Paid period changed', 'contract.revoke': 'Paid period cancelled',
  'member.add': 'Member added', 'member.invite': 'Invite sent', 'member.suspend': 'Member suspended',
  'member.reactivate': 'Member reactivated', 'member.remove': 'Member removed', 'member.role': 'Role changed',
  'access.create': 'Access given', 'access.extend': 'Access extended', 'access.revoke': 'Access cancelled',
  'import.preview': 'Spreadsheet checked', 'import.commit': 'Spreadsheet applied', 'import.fail': 'Spreadsheet failed'
};
function auditDetail(e) {
  const m = e.meta || {};
  if (m.reason) return m.reason;
  if (e.action === 'member.role') return `${m.from} → ${m.to}`;
  if (e.action === 'access.create' && m.start) return `${fmt(m.start)} – ${fmt(m.end)}`;
  if (e.action === 'access.extend' && m.to) return `now until ${fmt(m.to.end)}`;
  if (e.action === 'import.commit') return `${m.created ?? 0} new, ${m.added ?? 0} added, ${m.extended ?? 0} extended, ${m.skipped ?? 0} skipped`;
  if (e.action === 'import.preview') return m.filename || '';
  return '';
}

// ---- helpers ----
const who = (m) => m.user?.displayName || m.user?.email || 'member';
function fmt(iso) {
  if (!iso) return '—';
  const [y, mo, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(v) {
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function daysUntil(iso) {
  return Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
}

onMounted(async () => {
  await loadSummary();
  if (!forbidden.value && !loadError.value) loadMembers();
});
onUnmounted(() => { clearTimeout(flashTimer); clearTimeout(searchTimer); });
</script>

<template>
  <div class="min-h-screen bg-neutral-100 text-neutral-900">
    <div class="bg-neutral-950 text-white">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <NuxtLink to="/" class="font-mono text-xs text-neutral-300 hover:text-white">← Back to the e-paper</NuxtLink>
        <span class="font-mono text-xs text-neutral-400 truncate">Organisation admin</span>
      </div>
    </div>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <!-- not an admin / errors -->
      <div v-if="forbidden" class="bg-white rounded-xl p-8 text-center shadow-sm">
        <h1 class="font-serif font-extrabold text-2xl">Organisation admins only</h1>
        <p class="text-sm text-neutral-600 mt-2 max-w-md mx-auto">{{ loadError || 'This page is for people who manage an organisation\'s e-paper members.' }}</p>
        <NuxtLink to="/" class="inline-block mt-5 bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm">Go to the e-paper</NuxtLink>
      </div>
      <div v-else-if="loadError && !summary" class="bg-white rounded-xl p-8 text-center shadow-sm">
        <p class="text-sm text-red-700">{{ loadError }}</p>
        <button class="mt-4 border border-neutral-300 rounded-lg px-4 py-2 text-sm" @click="loadSummary().then(() => summary && loadMembers())">Try again</button>
      </div>
      <div v-else-if="!summary" class="space-y-3" aria-busy="true">
        <div class="h-10 w-64 bg-neutral-200 rounded animate-pulse" />
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div v-for="n in 4" :key="n" class="h-24 bg-neutral-200 rounded-xl animate-pulse" /></div>
      </div>

      <template v-else>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <p class="font-mono text-xs text-neutral-500">Your organisation</p>
            <h1 class="font-serif font-extrabold text-3xl leading-tight truncate">{{ summary.organisation.name }}</h1>
          </div>
          <div class="flex flex-wrap gap-2">
            <NuxtLink to="/organisation/import" class="border border-neutral-300 bg-white rounded-lg px-4 py-2 text-sm font-medium hover:border-neutral-900">Excel: download / upload</NuxtLink>
            <button class="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" :disabled="seatsFull" :title="seatsFull ? 'All seats are in use' : ''" @click="openAdd">Add member</button>
          </div>
        </div>

        <p v-if="seatsFull" class="mt-3 text-sm text-neutral-600 sm:text-right">All {{ summary.seats.limit }} seats are in use. Suspend or remove someone to add more, or ask New Vision for more seats.</p>

        <p v-if="flash.text" class="mt-4 rounded-lg px-4 py-3 text-sm" :class="flash.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'" role="status">{{ flash.text }}</p>

        <!-- stats -->
        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5" aria-label="Summary">
          <div class="bg-white rounded-xl p-4 shadow-sm border-t-4" :class="seatsFull ? 'border-red-500' : 'border-neutral-900'">
            <p class="font-mono text-[11px] text-neutral-500">Seats in use</p>
            <p class="font-serif font-extrabold text-3xl mt-1">{{ summary.seats.inUse }}<span class="text-lg text-neutral-400"> / {{ summary.seats.limit ?? '∞' }}</span></p>
            <p class="text-xs text-neutral-500 mt-1">{{ summary.seats.suspended }} suspended (don't count)</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border-t-4" :class="summary.paidPeriod.current ? 'border-emerald-500' : 'border-amber-500'">
            <p class="font-mono text-[11px] text-neutral-500">Paid until</p>
            <p class="font-serif font-extrabold text-xl mt-2">{{ summary.paidPeriod.current ? fmt(summary.paidPeriod.current.end) : 'Not active' }}</p>
            <p class="text-xs text-neutral-500 mt-1">{{ summary.paidPeriod.current ? 'Renewals are arranged with New Vision' : summary.paidPeriod.next ? `Next starts ${fmt(summary.paidPeriod.next.start)}` : 'Contact New Vision to renew' }}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border-t-4" :class="summary.expiringSoon ? 'border-amber-500' : 'border-neutral-300'">
            <p class="font-mono text-[11px] text-neutral-500">Access ending ≤ 14 days</p>
            <p class="font-serif font-extrabold text-3xl mt-1">{{ summary.expiringSoon }}</p>
            <p class="text-xs text-neutral-500 mt-1">Extend them from the list</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border-t-4 border-neutral-300">
            <p class="font-mono text-[11px] text-neutral-500">Invites not yet accepted</p>
            <p class="font-serif font-extrabold text-3xl mt-1">{{ summary.pendingInvites }}</p>
            <p class="text-xs text-neutral-500 mt-1">They can read once they set a password</p>
          </div>
        </section>

        <!-- seats per publication (Phase 0) -->
        <section v-if="pubSeats.length" class="mt-4 flex flex-wrap gap-2" aria-label="Seats per publication">
          <span v-for="p in pubSeats" :key="p.code" class="font-mono text-xs px-3 py-1.5 rounded-lg bg-white shadow-sm" :class="p.seats !== null && p.inUse >= p.seats ? 'text-red-700' : 'text-neutral-700'">
            <span class="font-semibold">{{ p.code }}</span> · {{ p.name }} · {{ p.inUse }} / {{ p.seats ?? '∞' }} seats ·
            {{ p.current ? `until ${fmt(p.current.end)}` : p.next ? `from ${fmt(p.next.start)}` : `ended ${fmt(p.latestEnd)}` }}
          </span>
        </section>

        <!-- add member -->
        <section v-if="adding" class="bg-white rounded-xl shadow-sm p-5 mt-5" aria-labelledby="add-h">
          <div class="flex items-baseline justify-between">
            <h2 id="add-h" class="font-serif font-bold text-xl">Add a member</h2>
            <button class="text-xs text-neutral-500 hover:text-neutral-900" @click="adding = false">Cancel</button>
          </div>
          <form class="grid md:grid-cols-2 gap-5 mt-4" @submit.prevent="submitAdd">
            <div class="space-y-4">
              <label class="block">
                <span class="text-xs font-mono text-neutral-600">Email *</span>
                <input v-model="addForm.email" type="email" required autocomplete="off" :placeholder="orgDomains.length ? `name${orgDomains.length === 1 ? '@' + orgDomains[0] : '@…'}` : ''" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
                <span v-if="orgDomains.length" class="block text-xs mt-1" :class="addForm.email && !emailFitsDomains(addForm.email, orgDomains) ? 'text-red-700' : 'text-neutral-500'">Only {{ describeDomains(orgDomains) }} email addresses can be members.</span>
              </label>
              <label class="block">
                <span class="text-xs font-mono text-neutral-600">Name</span>
                <input v-model="addForm.displayName" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
              </label>
              <label class="block">
                <span class="text-xs font-mono text-neutral-600">Phone</span>
                <input v-model="addForm.phone" type="tel" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
              </label>
              <p class="text-xs text-neutral-500">If they don't have an e-paper account yet, one is created and they're emailed a link to set their password.</p>
              <fieldset v-if="pubSeats.length">
                <legend class="text-xs font-mono text-neutral-600">Publications they read</legend>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label v-for="p in pubSeats" :key="p.code" class="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5" :class="pubHasRoom(p) ? 'border-neutral-300' : 'border-neutral-200 text-neutral-400'">
                    <input v-model="addForm.publications" type="checkbox" :value="p.code" :disabled="!pubHasRoom(p)">
                    <span class="font-mono">{{ p.code }}</span>
                    <span class="text-xs text-neutral-500">{{ p.seats === null ? 'no limit' : `${Math.max(0, p.seats - p.inUse)} left` }}</span>
                  </label>
                </div>
              </fieldset>
            </div>
            <div>
              <OrgPeriodPicker v-model="addForm.period" :paid-until="paidUntil" id-prefix="add" />
            </div>
            <p v-if="addError" class="md:col-span-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ addError }}</p>
            <div class="md:col-span-2 flex justify-end gap-2">
              <button type="button" class="border border-neutral-300 rounded-lg px-4 py-2 text-sm" @click="adding = false">Cancel</button>
              <button type="submit" class="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" :disabled="busy">{{ busy ? 'Adding…' : 'Add member' }}</button>
            </div>
          </form>
        </section>

        <!-- tabs -->
        <div class="mt-6 flex gap-1 border-b border-neutral-300" role="tablist">
          <button role="tab" :aria-selected="tab === 'members'" class="px-4 py-2 text-sm -mb-px border-b-2" :class="tab === 'members' ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'" @click="tab = 'members'">Members <span class="font-mono text-xs text-neutral-500">{{ pagination?.total ?? '' }}</span></button>
          <button role="tab" :aria-selected="tab === 'usage'" class="px-4 py-2 text-sm -mb-px border-b-2" :class="tab === 'usage' ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'" @click="tab = 'usage'">Usage</button>
          <button role="tab" :aria-selected="tab === 'activity'" class="px-4 py-2 text-sm -mb-px border-b-2" :class="tab === 'activity' ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'" @click="tab = 'activity'">Activity</button>
        </div>

        <!-- usage (Phases 1–4): days and papers per member -->
        <OrgUsagePanel v-if="tab === 'usage'" :load="orgAdmin.usage" />

        <!-- members -->
        <section v-if="tab === 'members'" class="bg-white rounded-b-xl shadow-sm">
          <div class="flex flex-wrap items-center gap-3 p-4">
            <input v-model="search" type="search" placeholder="Search name or email" aria-label="Search members" class="w-full sm:w-72 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
            <div class="inline-flex rounded-lg bg-neutral-100 p-1" role="group" aria-label="Filter members">
              <button v-for="f in filters" :key="f.value" class="px-3 py-1 rounded-md text-sm" :class="filter === f.value ? 'bg-white shadow-sm font-semibold' : 'text-neutral-600'" :aria-pressed="filter === f.value" @click="filter = f.value">{{ f.label }}</button>
            </div>
          </div>

          <div v-if="membersLoading && !members.length" class="px-4 pb-4 space-y-2"><div v-for="n in 5" :key="n" class="h-12 bg-neutral-100 rounded animate-pulse" /></div>
          <p v-else-if="!members.length" class="px-4 pb-8 pt-2 text-sm text-neutral-500 text-center">{{ search || filter ? 'No members match.' : 'No members yet. Add people one at a time, or download the Excel sheet, fill it in and upload it.' }}</p>

          <ul v-else class="divide-y divide-neutral-100">
            <li v-for="m in members" :key="m.seatId" class="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 md:grid md:grid-cols-[minmax(0,1fr)_200px_150px_290px]">
              <div class="min-w-0 flex-1 basis-56">
                <p class="font-medium truncate">
                  {{ m.user?.displayName || m.user?.email }}
                  <span v-if="isMe(m)" class="font-mono text-[11px] text-neutral-500">(you)</span>
                </p>
                <p class="text-xs text-neutral-500 truncate">{{ m.user?.email }}<template v-if="m.user?.phone"> · {{ m.user.phone }}</template></p>
                <div v-if="pubSeats.length" class="flex flex-wrap gap-1 mt-1">
                  <label v-for="p in pubSeats" :key="p.code" class="font-mono text-[11px] px-1.5 py-0.5 rounded cursor-pointer select-none" :class="memberReads(m, p.code) ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'" :title="memberReads(m, p.code) ? `Reads ${p.name}. Click to remove.` : `Click to give ${p.name}.`">
                    <input type="checkbox" class="sr-only" :checked="memberReads(m, p.code)" :disabled="busy" @change="toggleMemberPub(m, p.code, $event.target.checked)">
                    {{ p.code }}
                  </label>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 basis-48">
                <span v-if="m.role === 'admin'" class="font-mono text-[11px] px-2 py-0.5 rounded bg-neutral-900 text-white">admin</span>
                <span class="font-mono text-[11px] px-2 py-0.5 rounded" :class="m.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'">{{ m.status }}</span>
                <span v-if="m.invitePending" class="font-mono text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">invite pending</span>
              </div>
              <p class="text-sm basis-36 font-mono" :class="accessText(m).cls">{{ accessText(m).text }}</p>
              <div v-if="!isMe(m)" class="flex flex-wrap gap-1.5 ml-auto md:ml-0 md:justify-end">
                <button class="text-xs border border-neutral-300 rounded-md px-2.5 py-1 hover:border-neutral-900" @click="openExtend(m)">Extend access</button>
                <button v-if="m.status === 'active'" class="text-xs border border-neutral-300 rounded-md px-2.5 py-1 hover:border-neutral-900" @click="openStatus(m, 'suspended')">Suspend</button>
                <button v-else class="text-xs border border-neutral-300 rounded-md px-2.5 py-1 hover:border-neutral-900" @click="openStatus(m, 'active')">Reactivate</button>
                <details class="relative">
                  <summary class="list-none cursor-pointer text-xs border border-neutral-300 rounded-md px-2.5 py-1 hover:border-neutral-900 select-none" aria-label="More actions">More ▾</summary>
                  <div class="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20 text-sm">
                    <button class="block w-full text-left px-3 py-2 hover:bg-neutral-50" @click="openRole(m)">{{ m.role === 'admin' ? 'Remove admin role' : 'Make admin' }}</button>
                    <button v-if="m.invitePending" class="block w-full text-left px-3 py-2 hover:bg-neutral-50" @click="resend(m)">Resend invite</button>
                    <button class="block w-full text-left px-3 py-2 hover:bg-red-50 text-red-700" @click="openRemove(m)">Remove from organisation</button>
                  </div>
                </details>
              </div>
              <div v-else class="hidden md:block" aria-hidden="true" />
            </li>
          </ul>

          <nav v-if="pagination && pagination.pageCount > 1" class="flex items-center justify-between p-4 border-t border-neutral-100" aria-label="Pages">
            <button class="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 disabled:opacity-40" :disabled="page <= 1" @click="page--">‹ Previous</button>
            <span class="font-mono text-xs text-neutral-500">Page {{ page }} of {{ pagination.pageCount }}</span>
            <button class="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 disabled:opacity-40" :disabled="page >= pagination.pageCount" @click="page++">Next ›</button>
          </nav>
        </section>

        <!-- activity -->
        <section v-else-if="tab === 'activity'" class="bg-white rounded-b-xl shadow-sm p-4">
          <ul class="divide-y divide-neutral-100">
            <li v-for="e in audit" :key="e.id" class="py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span class="font-mono text-xs text-neutral-500 w-32 shrink-0">{{ fmtTime(e.at) }}</span>
              <span class="flex-1 min-w-[200px]">
                <span class="font-medium">{{ ACTIONS[e.action] || e.action }}</span>
                <template v-if="e.target"> · {{ e.target.email }}</template>
                <span v-if="auditDetail(e)" class="text-neutral-500"> · {{ auditDetail(e) }}</span>
              </span>
              <span class="text-xs text-neutral-500">{{ e.actor?.kind === 'handle' ? 'New Vision' : (e.actor?.displayName || e.actor?.email || '') }}</span>
            </li>
            <li v-if="!audit.length && !auditLoading" class="py-4 text-sm text-neutral-500">No activity yet.</li>
          </ul>
          <button v-if="auditMore" class="w-full mt-3 border border-neutral-300 rounded-lg py-2 text-sm" :disabled="auditLoading" @click="loadAudit(true)">{{ auditLoading ? 'Loading…' : 'Load older' }}</button>
        </section>
      </template>
    </main>

    <!-- dialog -->
    <div v-if="dialog" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="dlg-h" @click.self="dialog = null">
      <form class="w-full max-w-md bg-white rounded-xl p-6 shadow-2xl" @submit.prevent="runDialog">
        <h2 id="dlg-h" class="font-serif font-bold text-xl">{{ dialog.title }}</h2>
        <p v-if="dialog.text" class="text-sm text-neutral-600 mt-2">{{ dialog.text }}</p>
        <div v-if="dialog.kind === 'extend'" class="mt-4">
          <p class="text-sm text-neutral-600 mb-3">
            Current access:
            <span class="font-mono">{{ accessText(dialog.member).text }}</span>.
            If the new period overlaps or follows on from it, the two are joined.
          </p>
          <OrgPeriodPicker v-model="dialog.period" :paid-until="paidUntil" id-prefix="ext" />
        </div>
        <label v-if="dialog.reason !== undefined" class="block mt-4">
          <span class="text-xs font-mono text-neutral-600">Reason (optional, shown in the activity log)</span>
          <textarea v-model="dialog.reason" rows="2" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <p v-if="dialog.error" class="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ dialog.error }}</p>
        <div class="flex justify-end gap-2 mt-5">
          <button type="button" class="border border-neutral-300 rounded-lg px-4 py-2 text-sm" @click="dialog = null">Cancel</button>
          <button type="submit" class="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" :class="dialog.danger ? 'bg-red-700' : 'bg-neutral-900'" :disabled="busy">{{ busy ? 'Working…' : (dialog.confirm || 'Save') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>