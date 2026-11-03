<!--
  Repo path: apps/web/components/OrgUsagePanel.vue          NEW FILE (Phases 1–4)

  The Usage tab of /organisation: for one month, which days each member was
  active and which of the organisation's papers they opened that day.
  Days and papers only — never pages, sections or stories (agreed 23 Oct
  2026). A day counts when the member signed in or read anything that day,
  Kampala time; a paper counts when it was opened with access (a front-page
  preview of a paper the member has no seat for does not count).

  Props: load(month) -> GET /api/org-admin/usage response.
-->
<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({ load: { type: Function, required: true } });

const data = ref(null);
const loading = ref(true);
const error = ref('');
const month = ref(null);
const onlyPub = ref('');

async function fetchMonth(m) {
  loading.value = true;
  error.value = '';
  try {
    data.value = await props.load(m);
    month.value = data.value.month;
  } catch (e) {
    error.value = e?.data?.error || 'Usage could not be loaded.';
  } finally {
    loading.value = false;
  }
}
onMounted(() => fetchMonth(null));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym, withYear = false) => {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
};
const monthChoices = computed(() => (data.value?.months || []).slice(0, 6).reverse());
const pubs = computed(() => data.value?.publications || []);
const colourOf = (code) => pubs.value.find((p) => p.code === code)?.colour || '#525252';
const nameOf = (code) => pubs.value.find((p) => p.code === code)?.title || code;
const dates = computed(() => data.value?.daily?.dates || []);
const dayHead = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return { n: d.getUTCDate(), w: 'SMTWTFS'[d.getUTCDay()], weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
};

function cellStyle(papers) {
  if (!papers) return { background: 'rgba(15,27,45,.05)' };
  const list = onlyPub.value ? papers.filter((c) => c === onlyPub.value) : papers;
  if (!list.length) return { background: '#cbd5e1' }; // active, signed in, no paper opened
  if (list.length === 1) return { background: colourOf(list[0]) };
  const step = 100 / list.length;
  const stops = list.map((c, i) => `${colourOf(c)} ${i * step}% ${(i + 1) * step}%`).join(',');
  return { background: `linear-gradient(135deg,${stops})` };
}
function cellTitle(m, iso, papers) {
  if (!papers) return `${m.name}, ${iso}: not active`;
  if (!papers.length) return `${m.name}, ${iso}: signed in`;
  return `${m.name}, ${iso}: ${papers.map(nameOf).join(' and ')}`;
}

const members = computed(() => {
  const list = [...(data.value?.members || [])];
  return list
    .filter((m) => !onlyPub.value || m.seatPublications.includes(onlyPub.value))
    .sort((a, b) => b.daysActive - a.daysActive || a.name.localeCompare(b.name));
});

const k = computed(() => data.value?.kpis || {});
const delta = (now, before, unit = '') => {
  // no comparison until there is a previous month to compare with
  if (!before) return null;
  const d = Math.round((now - before) * 10) / 10;
  return { text: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}${unit} vs ${monthLabel(prevMonth.value, false)}`, up: d >= 0 };
};
const prevMonth = computed(() => {
  if (!month.value) return '';
  const [y, m] = month.value.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
});

function fmtLastSeen(s) {
  if (!s) return 'Never';
  const [d, t] = s.split(' ');
  const [, m, dd] = d.split('-').map(Number);
  return `${dd} ${MONTHS[m - 1]}, ${t}`;
}

// ---- charts (plain SVG) ----
const W = 720;
const H = 180;
const PAD = { l: 42, r: 8, t: 10, b: 22 };
const daily = computed(() => {
  const ds = dates.value;
  const active = data.value?.daily?.active || [];
  const max = Math.max(1, ...active);
  const bw = (W - PAD.l - PAD.r) / Math.max(1, ds.length);
  const y = (v) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const bars = ds.map((iso, i) => ({ x: PAD.l + i * bw + 2, w: Math.max(2, bw - 4), y: y(active[i] || 0), h: H - PAD.b - y(active[i] || 0), v: active[i] || 0, iso, label: dayHead(iso).n }));
  const lines = pubs.value.map((p) => {
    const vals = data.value?.daily?.series?.[p.code] || [];
    return { code: p.code, colour: p.colour || '#525252', d: vals.map((v, i) => `${i ? 'L' : 'M'}${PAD.l + i * bw + bw / 2},${y(v)}`).join(' ') };
  });
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ v, y: y(v) }));
  return { bars, lines, ticks };
});
const history = computed(() => {
  const ms = data.value?.history?.months || [];
  const bw = (W - PAD.l - PAD.r) / Math.max(1, ms.length);
  const y = (v) => H - PAD.b - (v / 100) * (H - PAD.t - PAD.b);
  const lines = pubs.value.map((p) => {
    const vals = data.value?.history?.series?.[p.code] || [];
    let d = '';
    let pen = false;
    const dots = [];
    vals.forEach((v, i) => {
      if (v === null || v === undefined) { pen = false; return; }
      const x = PAD.l + i * bw + bw / 2;
      d += `${pen ? 'L' : 'M'}${x},${y(v)} `;
      pen = true;
      dots.push({ x, y: y(v), v });
    });
    return { code: p.code, colour: p.colour || '#525252', d, dots };
  });
  return { labels: ms.map((m, i) => ({ x: PAD.l + i * bw + bw / 2, t: monthLabel(m) })), lines, ticks: [0, 50, 100].map((v) => ({ v, y: y(v) })) };
});

function downloadCsv() {
  const ds = dates.value;
  const head = ['Member', 'Email', 'Seat papers', ...ds, 'Days active', ...pubs.value.map((p) => `${p.code} days`), 'Last seen'];
  const rows = members.value.map((m) => [
    m.name, m.email, m.seatPublications.join(' '),
    ...ds.map((d) => (m.days[d] ? (m.days[d].join('+') || 'signed in') : '')),
    m.daysActive, ...pubs.value.map((p) => m.perPublication[p.code] || 0), m.lastSeen || 'never'
  ]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
  a.download = `usage-${month.value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <section class="bg-white rounded-b-xl shadow-sm p-4 sm:p-5" aria-label="Usage">
    <div class="flex flex-wrap gap-3 items-center justify-between">
      <div class="flex flex-wrap gap-3 items-center">
        <div class="inline-flex flex-wrap bg-neutral-100 rounded-xl p-1" role="group" aria-label="Month">
          <button
            v-for="m in monthChoices"
            :key="m"
            class="h-9 px-3 rounded-lg text-sm"
            :class="m === month ? 'bg-white shadow-sm font-semibold' : 'text-neutral-600'"
            @click="fetchMonth(m)"
          >{{ monthLabel(m, m === month) }}</button>
        </div>
        <div v-if="pubs.length > 1" class="inline-flex flex-wrap bg-neutral-100 rounded-xl p-1" role="group" aria-label="Paper">
          <button class="h-9 px-3 rounded-lg text-sm" :class="!onlyPub ? 'bg-white shadow-sm font-semibold' : 'text-neutral-600'" @click="onlyPub = ''">All papers</button>
          <button v-for="p in pubs" :key="p.code" class="h-9 px-3 rounded-lg text-sm" :class="onlyPub === p.code ? 'bg-white shadow-sm font-semibold' : 'text-neutral-600'" @click="onlyPub = p.code">{{ p.title }}</button>
        </div>
      </div>
      <button v-if="data" class="h-9 px-3 rounded-lg border border-neutral-300 hover:border-neutral-900 text-sm" @click="downloadCsv">Download (CSV)</button>
    </div>

    <p v-if="loading" class="py-10 text-center text-sm text-neutral-500">Loading usage…</p>
    <p v-else-if="error" class="py-10 text-center text-sm text-red-700">{{ error }}</p>

    <template v-else-if="data">
      <div class="mt-4 flex flex-wrap gap-3">
        <div class="flex-1 basis-[180px] min-w-0 rounded-xl border border-neutral-200 border-t-4 border-t-[#2f55e4] p-3">
          <p class="text-xs text-neutral-500">Members active this month</p>
          <p class="text-2xl font-extrabold mt-1">{{ k.activeMembers }} <span class="text-sm font-normal text-neutral-500">of {{ k.members }}</span></p>
          <p v-if="delta(k.activeMembers, k.previousActiveMembers)" class="text-xs mt-0.5" :class="delta(k.activeMembers, k.previousActiveMembers).up ? 'text-emerald-700' : 'text-red-700'">{{ delta(k.activeMembers, k.previousActiveMembers).text }}</p>
        </div>
        <div class="flex-1 basis-[180px] min-w-0 rounded-xl border border-neutral-200 border-t-4 border-t-emerald-500 p-3">
          <p class="text-xs text-neutral-500">Average days active</p>
          <p class="text-2xl font-extrabold mt-1">{{ k.averageDays }} <span class="text-sm font-normal text-neutral-500">of {{ k.daysSoFar }} days</span></p>
          <p v-if="delta(k.averageDays, k.previousAverageDays, ' days')" class="text-xs mt-0.5" :class="delta(k.averageDays, k.previousAverageDays).up ? 'text-emerald-700' : 'text-red-700'">{{ delta(k.averageDays, k.previousAverageDays, ' days').text }}</p>
        </div>
        <div v-for="s in data.seatUse" :key="s.code" class="flex-1 basis-[180px] min-w-0 rounded-xl border border-neutral-200 border-t-4 p-3" :style="{ borderTopColor: colourOf(s.code) }">
          <p class="text-xs text-neutral-500">{{ nameOf(s.code) }} seat use</p>
          <p class="text-2xl font-extrabold mt-1">{{ s.usePct }}%</p>
          <p class="text-xs text-neutral-500 mt-0.5">{{ s.used }} of {{ s.seats || s.holders }} {{ s.code }} seats opened {{ s.code }}</p>
        </div>
        <div class="flex-1 basis-[180px] min-w-0 rounded-xl border border-neutral-200 border-t-4 border-t-amber-400 p-3">
          <p class="text-xs text-neutral-500">Never signed in</p>
          <p class="text-2xl font-extrabold mt-1">{{ k.neverSignedIn }}</p>
          <p v-if="k.invitesPending" class="text-xs text-amber-800 mt-0.5">{{ k.invitesPending }} invite{{ k.invitesPending === 1 ? '' : 's' }} not yet accepted</p>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap justify-between gap-3 items-baseline">
        <h3 class="font-bold text-base">Who signed in, and which paper they opened</h3>
        <div class="flex flex-wrap gap-3 text-xs text-neutral-600">
          <span v-for="p in pubs" :key="p.code" class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-sm inline-block" :style="{ background: p.colour || '#525252' }" />{{ p.title }}</span>
          <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-sm inline-block bg-slate-300" />Signed in only</span>
          <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-sm inline-block bg-neutral-100 border border-neutral-200" />Not active</span>
        </div>
      </div>
      <div class="overflow-x-auto mt-3 -mx-1">
        <table class="border-separate [border-spacing:3px] text-xs">
          <thead>
            <tr>
              <th class="text-left min-w-[170px] pl-1 font-medium text-neutral-500">Member</th>
              <th v-for="d in dates" :key="d" class="font-mono font-medium text-[10px] w-6" :class="dayHead(d).weekend ? 'text-neutral-900' : 'text-neutral-500'">{{ dayHead(d).n }}<br>{{ dayHead(d).w }}</th>
              <th class="pl-2 font-medium text-neutral-500">Days</th>
              <th v-for="p in pubs" :key="p.code" class="font-mono font-medium text-neutral-500 px-1">{{ p.code }}</th>
              <th class="text-left pl-2 font-medium text-neutral-500">Last seen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in members" :key="m.seatId">
              <td class="pr-2 pl-1 whitespace-nowrap">
                <span class="font-semibold">{{ m.name }}</span>
                <span v-if="m.role === 'admin'" class="ml-1 text-[10px] text-neutral-500">admin</span>
                <span class="block font-mono text-[10px] text-neutral-500">{{ m.seatPublications.join(' · ') || 'no paper' }}<template v-if="m.status === 'suspended'"> · suspended</template></span>
              </td>
              <td v-for="d in dates" :key="d" class="w-6 h-6 rounded" :style="cellStyle(m.days[d])" :title="cellTitle(m, d, m.days[d])">
                <span class="sr-only">{{ cellTitle(m, d, m.days[d]) }}</span>
              </td>
              <td class="pl-2 text-center font-mono font-semibold">{{ m.daysActive }}</td>
              <td v-for="p in pubs" :key="p.code" class="text-center font-mono" :style="{ color: colourOf(p.code) }">{{ m.perPublication[p.code] || 0 }}</td>
              <td class="pl-2 whitespace-nowrap text-neutral-600">{{ fmtLastSeen(m.lastSeen) }}</td>
            </tr>
            <tr v-if="!members.length"><td :colspan="dates.length + 4" class="py-4 text-neutral-500">No members.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="mt-6 grid lg:grid-cols-2 gap-5">
        <figure>
          <figcaption class="font-bold text-base">Active members per day</figcaption>
          <p class="text-xs text-neutral-500">Bars: members active · lines: members who opened each paper</p>
          <svg :viewBox="`0 0 ${W} ${H}`" class="w-full mt-2" role="img" aria-label="Active members per day">
            <g v-for="t in daily.ticks" :key="t.v">
              <line :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" stroke="#e5e7eb" />
              <text :x="PAD.l - 6" :y="t.y + 4" text-anchor="end" font-size="11" fill="#6b7280">{{ t.v }}</text>
            </g>
            <rect v-for="b in daily.bars" :key="b.iso" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="2" fill="#e2e8f0"><title>{{ b.iso }}: {{ b.v }} active</title></rect>
            <path v-for="l in daily.lines" :key="l.code" :d="l.d" fill="none" :stroke="l.colour" stroke-width="2.5" stroke-linejoin="round" />
            <text v-for="(b, i) in daily.bars" v-show="i % 2 === 0" :key="'l' + b.iso" :x="b.x + b.w / 2" :y="H - 6" text-anchor="middle" font-size="10" fill="#6b7280">{{ b.label }}</text>
          </svg>
          <div class="flex flex-wrap gap-3 text-xs text-neutral-600">
            <span v-for="p in pubs" :key="p.code" class="flex items-center gap-1.5"><span class="w-4 h-0.5 inline-block" :style="{ background: p.colour || '#525252' }" />Opened {{ p.title }}</span>
          </div>
        </figure>
        <figure>
          <figcaption class="font-bold text-base">Seat use, month by month</figcaption>
          <p class="text-xs text-neutral-500">Share of paid seats that opened their paper at least once</p>
          <svg :viewBox="`0 0 ${W} ${H}`" class="w-full mt-2" role="img" aria-label="Seat use by month">
            <g v-for="t in history.ticks" :key="t.v">
              <line :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" stroke="#e5e7eb" />
              <text :x="PAD.l - 6" :y="t.y + 4" text-anchor="end" font-size="11" fill="#6b7280">{{ t.v }}%</text>
            </g>
            <g v-for="l in history.lines" :key="l.code">
              <path :d="l.d" fill="none" :stroke="l.colour" stroke-width="2.5" stroke-linejoin="round" />
              <circle v-for="(d, i) in l.dots" :key="i" :cx="d.x" :cy="d.y" r="4" :fill="l.colour"><title>{{ l.code }}: {{ d.v }}%</title></circle>
            </g>
            <text v-for="lb in history.labels" :key="lb.t" :x="lb.x" :y="H - 6" text-anchor="middle" font-size="11" fill="#6b7280">{{ lb.t }}</text>
          </svg>
          <p class="text-xs text-neutral-500">A line starts in the month the organisation first paid for that paper.</p>
        </figure>
      </div>

      <p class="text-xs text-neutral-500 mt-5">
        A day counts when the member signed in or read anything that day (Kampala time). A paper counts when it was opened with the organisation's seat.
        Organisation admins see days and papers only — never pages or stories.
      </p>
    </template>
  </section>
</template>
