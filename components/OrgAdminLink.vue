<!--
  Repo path: apps/web/components/OrgAdminLink.vue  (srcDir-relative)   UPDATED

  "Manage organisation" link that renders ONLY for Organisation Admins of an
  active organisation. Used in components/reader/EpaperToolbar.vue:

    import OrgAdminLink from '~/components/OrgAdminLink.vue';
    <OrgAdminLink v-if="account.loggedIn" :key="account.user?.email" class="...">label</OrgAdminLink>

  It asks /api/account/me once per signed-in session, and several instances
  share that one call. The cached answer is tied to the current access
  token, so signing out and in as someone else re-checks instead of showing
  the previous reader's link. Renders nothing for signed-out readers,
  ordinary members and personal accounts. Attributes such as class and
  @click pass through to the link.
-->
<script setup>
import { onMounted } from 'vue';
import { useState, useCookie } from '#imports';
import { NuxtLink } from '#components';
import { useEpaperApi } from '~/composables/useEpaperApi';

// { token, role, name, pending } — role: null = not checked, '' = not an admin
const state = useState('epaper-org-admin-link', () => ({ token: null, role: null, name: '', pending: null }));

onMounted(async () => {
  const token = useCookie('token').value || null;
  if (!token) { Object.assign(state.value, { token: null, role: '', name: '' }); return; }
  if (state.value.token === token && state.value.role !== null) return;

  // Share one in-flight request between instances (menu + inline).
  if (!state.value.pending || state.value.token !== token) {
    state.value.token = token;
    state.value.role = null;
    state.value.pending = useEpaperApi().getAccount()
      .then((me) => {
        const org = me?.organisation;
        state.value.role = org && org.status === 'active' ? org.role : '';
        state.value.name = org?.name || '';
      })
      .catch(() => { state.value.role = ''; })
      .finally(() => { state.value.pending = null; });
  }
  await state.value.pending;
});
</script>

<template>
  <NuxtLink
    v-if="state.role === 'admin'"
    to="/organisation"
    :title="state.name ? `Manage ${state.name}` : 'Manage organisation'"
  >
    <slot>Manage organisation</slot>
  </NuxtLink>
</template>