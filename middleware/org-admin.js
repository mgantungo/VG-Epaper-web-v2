/**
 * Repo path: apps/web/middleware/org-admin.js  (srcDir-relative)   NEW FILE
 *
 * Named route middleware for the /organisation pages:
 *   definePageMeta({ middleware: 'org-admin' })
 * Only checks that the reader is signed in. Whether they are an Org Admin
 * is answered by the server on every call (403 otherwise), and the pages
 * show a clear message in that case.
 *
 * Client-only on purpose: the refresh cookie lives on the API's domain, so
 * an SSR request can't renew an expired access token, and would bounce a
 * perfectly signed-in reader to /login.
 */
import { defineNuxtRouteMiddleware, navigateTo, useCookie } from '#imports';

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const token = useCookie('token');
  if (!token.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
  }
});
