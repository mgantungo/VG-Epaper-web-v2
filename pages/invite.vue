<!--
  Repo path: apps/web/pages/invite.vue  (srcDir-relative)   NEW FILE
  URL:       /invite?token=...

  Where an invite email lands. Shows who the invite is for and which
  organisation sent it, lets the person set their password (and name), then
  signs them straight in and opens the e-paper.

  After accepting, the access token is stored in the same `token` cookie
  useEpaperApi reads, and the page does a full load of "/" so the account
  store starts fresh as a signed-in reader.
-->
<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useCookie, useHead } from '#imports';
import { NuxtLink } from '#components';
import { useEpaperApi, TOKEN_COOKIE_OPTS } from '~/composables/useEpaperApi';

useHead({ title: 'Activate your account — New Vision e-paper' });

const route = useRoute();
const api = useEpaperApi();
const token = String(route.query.token || '');

const state = ref('loading'); // loading | ready | invalid | done
const invite = ref(null);
const displayName = ref('');
const password = ref('');
const confirm = ref('');
const submitting = ref(false);
const error = ref('');

onMounted(async () => {
  if (!token) { state.value = 'invalid'; error.value = 'This link is missing its invite code.'; return; }
  try {
    invite.value = await api.inspectInvite(token);
    displayName.value = invite.value.displayName || '';
    state.value = 'ready';
  } catch (e) {
    state.value = 'invalid';
    error.value = e?.data?.error || 'This invite link is invalid or has expired.';
  }
});

async function submit() {
  error.value = '';
  if (password.value.length < 8) { error.value = 'Use at least 8 characters.'; return; }
  if (password.value !== confirm.value) { error.value = "The two passwords don't match."; return; }
  submitting.value = true;
  try {
    const res = await api.acceptInvite(token, password.value, displayName.value.trim() || undefined);
    useCookie('token', TOKEN_COOKIE_OPTS).value = res.jwt; // same options as every other writer, or it becomes a session cookie
    state.value = 'done';
    window.location.assign('/');
  } catch (e) {
    error.value = e?.data?.error || 'Your account could not be activated. Try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
    <div class="w-full max-w-sm bg-white text-neutral-900 rounded-xl p-8 shadow-2xl">
      <template v-if="state === 'loading'">
        <p class="text-sm text-neutral-500">Checking your invite…</p>
      </template>

      <template v-else-if="state === 'invalid'">
        <h1 class="font-serif font-extrabold text-2xl mb-2">Invite not valid</h1>
        <p class="text-sm text-neutral-600">{{ error }}</p>
        <p class="text-sm text-neutral-600 mt-3">Ask your organisation's e-paper admin to send a new one. If you've already set your password, just sign in.</p>
        <NuxtLink to="/login" class="block text-center w-full bg-neutral-900 text-white rounded-lg py-2.5 font-mono text-sm mt-6">Sign in</NuxtLink>
      </template>

      <template v-else-if="state === 'ready'">
        <h1 class="font-serif font-extrabold text-2xl mb-1">Activate your account</h1>
        <p class="text-sm text-neutral-500 mb-6">
          <template v-if="invite.organisation"><strong class="text-neutral-800">{{ invite.organisation }}</strong> has given you access to the New Vision e-paper. </template>
          Set a password to start reading.
        </p>
        <form class="space-y-4" @submit.prevent="submit">
          <label class="block">
            <span class="text-xs font-mono text-neutral-600">Email (your sign-in)</span>
            <input :value="invite.email" type="email" readonly autocomplete="username" class="mt-1 w-full border border-neutral-200 bg-neutral-50 rounded-lg px-3 py-2 text-sm text-neutral-600">
          </label>
          <label class="block">
            <span class="text-xs font-mono text-neutral-600">Your name</span>
            <input v-model="displayName" autocomplete="name" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
          </label>
          <label class="block">
            <span class="text-xs font-mono text-neutral-600">Password (8+ characters)</span>
            <input v-model="password" type="password" required minlength="8" autocomplete="new-password" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
          </label>
          <label class="block">
            <span class="text-xs font-mono text-neutral-600">Confirm password</span>
            <input v-model="confirm" type="password" required autocomplete="new-password" class="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-900">
          </label>
          <p v-if="error" class="text-red-600 text-xs">{{ error }}</p>
          <button type="submit" :disabled="submitting" class="w-full bg-neutral-900 text-white rounded-lg py-2.5 font-mono text-sm disabled:opacity-60">{{ submitting ? 'Activating…' : 'Activate and start reading' }}</button>
        </form>
      </template>

      <template v-else>
        <p class="text-sm text-neutral-600">You're all set. Opening the e-paper…</p>
      </template>
    </div>
  </div>
</template>