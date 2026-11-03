import { useRuntimeConfig, useCookie, $fetch } from '#imports';
import { trackingHeaders, takeVia } from '~/composables/useReadingTracker';

/**
 * apps/web/composables/useEpaperApi.js  (srcDir-relative)     MODIFIED (organisations)
 * Change: adds `orgAdmin` (Organisation Admin dashboard calls) and
 * inspectInvite()/acceptInvite(). Everything that was here is unchanged.
 *
 * Phase 0 (publications, 23 Oct 2026): every paper is sold separately, so
 * editions, access ranges, plans and checkout all name a publication.
 * getCatalogue() feeds the landing page; mediaUrl() makes a public URL
 * (front-page covers) usable directly in <img src>.
 *
 * Phases 1–4 (analytics): every middleware call carries the visitor and
 * session ids (x-visitor-id, x-session-id) so an edition opened and the
 * pages then read join up into one reading session; getEdition() says where
 * the reader came from (?via=landing|archive|search). startCheckout() names
 * the paper being read, for the paywall-to-paid funnel.
 */

/**
 * Options for the `token` cookie (the reader's short-lived access token).
 * Every place that WRITES it must use these, or the write turns it into a
 * session cookie that dies when the browser closes or a phone discards the
 * tab — which used to happen on every silent refresh, since this file
 * opened the cookie without a maxAge while stores/account.js used 30 days.
 */
export const TOKEN_COOKIE_OPTS = { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' };

/** Seconds-since-epoch expiry of a JWT, or null if it can't be read. Client-side only, no verification. */
export function tokenExpiry(jwt) {
  try {
    const part = String(jwt).split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * The access token as it is RIGHT NOW. In the browser it's read from the
 * cookie itself on every call, not from a useCookie ref: each component
 * opens its own ref and they don't reliably update together, so a request
 * built from a stale ref would resend a token that was already replaced.
 */
function readTokenCookie() {
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (!m) return null;
  try {
    const v = decodeURIComponent(m[1]).replace(/^"|"$/g, '');
    return v && v !== 'null' && v !== 'undefined' ? v : null;
  } catch {
    return null;
  }
}
/** Writes the cookie immediately (useCookie writes it a tick later), with the same options. */
function writeTokenCookie(jwt) {
  document.cookie = `token=${encodeURIComponent(jwt)}; path=/; max-age=${TOKEN_COOKIE_OPTS.maxAge}; samesite=lax`;
}

// One refresh at a time for the whole tab: when a page turn fires several
// image requests and they all 401 together, they share a single
// POST /api/auth/refresh instead of each sending their own.
let refreshInFlight = null;

export function useEpaperApi() {
  const config = useRuntimeConfig();
  const token = useCookie('token', TOKEN_COOKIE_OPTS); // short-lived access token (20 min), set at login — see the middleware's services/tokens.js

  /**
   * Exchanges the httpOnly refresh cookie for a new access token.
   * Resolves true when renewed. A 401 from /refresh means the session is
   * really over (refresh cookie expired or revoked): the token is cleared
   * and it resolves false. Any OTHER failure — offline, a timeout, a 5xx —
   * rejects and leaves the token alone, so a brief network drop never
   * signs the reader out; the next attempt (or the keep-alive plugin)
   * renews it once the network is back.
   */
  function renewToken() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const refreshed = await $fetch(`${config.public.middlewareUrl}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });
        if (import.meta.client) writeTokenCookie(refreshed.jwt); // visible to every request from now on
        token.value = refreshed.jwt;
        return true;
      } catch (err) {
        const status = err?.response?.status ?? err?.statusCode ?? err?.status;
        if (status === 401) {
          console.warn('[api] refresh rejected — session over, signing out:', err?.data?.error || err?.message);
          token.value = null;
          return false;
        }
        throw err;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  function currentToken() {
    return import.meta.client ? readTokenCookie() : token.value;
  }

  function authHeaders(jwt = currentToken()) {
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }

  /**
   * Wraps an authenticated call: on a 401 (access token expired — expected
   * regularly, tokens last 20 minutes; the middleware answers 401 for an
   * expired token on every reader route, page images included), renews it
   * via renewToken() and retries the original call ONCE. If the session is
   * really over, the retry goes out anonymously (see below); if /refresh
   * couldn't be reached at all, the original error is re-thrown and the
   * session is kept. plugins/session-keepalive.client.js renews ahead of
   * expiry, so in practice this path is the fallback, not the norm.
   *
   * Centralizing this here means every other file — the account store, the
   * paywall, every page — just calls getAccount()/startCheckout()/etc. as
   * if tokens never expired, without needing its own retry logic.
   */
  async function authedFetch(url, opts = {}) {
    const attempt = (jwt) => $fetch(url, {
      ...opts,
      headers: { ...trackingHeaders(), ...(opts.headers || {}), ...authHeaders(jwt) },
      credentials: 'include'
    });

    const sent = currentToken();
    try {
      return await attempt(sent);
    } catch (err) {
      const status = err?.response?.status ?? err?.statusCode ?? err?.status;
      if (status !== 401 || !sent) throw err;

      // Another request already renewed the token while this one was in
      // flight (a page turn loads two images at once): just retry with it.
      const now = currentToken();
      if (now && now !== sent) return await attempt(now);

      console.log(`[api] ${url} -> 401, renewing token…`);
      try {
        await renewToken();
      } catch {
        throw err; // couldn't reach /refresh (offline?) — keep the session, surface the original error; callers retry
      }
      // renewed: retry with the new token. Not renewed: the session is over
      // and the token is now cleared, so the same retry goes out anonymously
      // — an edition then comes back locked (paywall / sign in) instead of
      // failing outright, and sign-in-only routes 401 as they should.
      return await attempt(currentToken());
    }
  }

  /** dateIso: YYYY-MM-DD, 'today' or 'latest'. publication: NV, BK, … */
  async function getEdition(publication, dateIso) {
    const pub = String(publication || 'nv').toLowerCase();
    const via = takeVia();
    return authedFetch(`${config.public.middlewareUrl}/api/editions/${pub}/${dateIso}`, via ? { query: { via } } : {});
  }

  /** What this reader can open of one publication: { ranges: [{ start, end, source }] }. */
  async function getRanges(publication) {
    return authedFetch(`${config.public.middlewareUrl}/api/editions/me/ranges`, { query: { publication } });
  }

  /** Landing page: titles -> publications (latest edition, reader's access), plans. */
  async function getCatalogue() {
    return authedFetch(`${config.public.middlewareUrl}/api/catalogue`);
  }

  /** Absolute URL for a public middleware path (e.g. a cover.jpg). */
  function mediaUrl(relativeUrl) {
    return relativeUrl ? `${config.public.middlewareUrl}${relativeUrl}` : null;
  }

  async function getAccount() {
    return authedFetch(`${config.public.middlewareUrl}/api/account/me`);
  }

  /**
   * Starts a real payment — phoneNumber/paymentmethod are now required by
   * the middleware's /checkout (it proxies to Strapi's epaper-transaction
   * initialize, which needs both to actually request a PIN prompt from the
   * integrator). Returns { receiptToken, invoiceNumber, amount, currency,
   * status } — NOT a checkoutUrl to redirect to; there's no hosted
   * checkout page, the integrator pushes the prompt straight to the
   * customer's phone. Callers should show a "check your phone" state and
   * poll getPaymentStatus(receiptToken) — see PaywallModal.vue.
   */
  /**
   * Real plan data (key, label, price, currency, kind, durationDays) from
   * Strapi's epaper-plan collection — powers the paywall's plan picker
   * with actual, currently-configured prices instead of a hardcoded
   * value. Not authedFetch: plan listings are public information (the
   * same prices anyone would see on a pricing page), no reason to require
   * a valid session just to view them.
   */
  async function getPlans(publication) {
    return $fetch(`${config.public.middlewareUrl}/api/pay/plans`, { query: publication ? { publication } : {} });
  }

  /**
   * Starts a real payment — phoneNumber/paymentmethod are required by the
   * middleware's /checkout (it proxies to Strapi's epaper-transaction
   * initialize, which needs both to actually request a PIN prompt from
   * the integrator). planKey is now explicit — which plan the reader
   * picked in the radio selector — rather than always being silently
   * derived from the date; omit it to fall back to the old
   * today-is-daily/otherwise-single_archive behavior. Returns
   * { receiptToken, invoiceNumber, amount, currency, status } — NOT a
   * checkoutUrl to redirect to; there's no hosted checkout page, the
   * integrator pushes the prompt straight to the customer's phone.
   * Callers should show a "check your phone" state and poll
   * getPaymentStatus(receiptToken) — see PaywallModal.vue.
   */
  /**
   * Phase 0: { planKey, phoneNumber, paymentmethod, dates? }. dates is only
   * used by single-issue plans (the edition(s) being bought); the server
   * works out the price and the editions itself.
   */
  async function startCheckout({ planKey, phoneNumber, paymentmethod, dates, publication }) {
    return authedFetch(`${config.public.middlewareUrl}/api/pay/checkout`, {
      method: 'POST',
      body: { planKey, phoneNumber, paymentmethod, ...(dates?.length ? { dates } : {}), ...(publication ? { publication } : {}) }
    });
  }

  /**
   * Polls a transaction's status by its receiptToken — proxies to Strapi's
   * epaper-transaction status action. Deliberately NOT authedFetch: the
   * receiptToken itself is the access control here (24 random bytes, same
   * unguessable-reference pattern as the receipt page), not the reader's
   * own login state — this needs to keep working even if their access
   * token happens to expire mid-poll.
   */
  async function getPaymentStatus(receiptToken) {
    return $fetch(`${config.public.middlewareUrl}/api/pay/status/${receiptToken}`);
  }

  /**
   * A page image is entitlement-gated, which a plain <img src="..."> can't
   * authenticate for two reasons: it can't attach an Authorization header
   * at all, AND the access-token cookie is scoped to this frontend's own
   * domain (set via a plain client-side useCookie), never the middleware's
   * separate API domain — so even the cookie fallback in attachUser never
   * had anything to receive. Fetching the bytes explicitly through
   * authedFetch (same 401-retry-on-expiry handling as every other call)
   * and handing the component back a Blob is the actual fix; the caller
   * turns that into an object URL for the <img> tag. See PageFace.vue.
   */
  async function fetchImageBlob(relativeUrl) {
    return authedFetch(`${config.public.middlewareUrl}${relativeUrl}`, { responseType: 'blob' });
  }

  // email/password — matches the epaper-user identity store (see
  // apps/cms/src/api/epaper-user), not Strapi's users-permissions, which
  // used `identifier` and required a separate username. Sent as `email`
  // specifically because that's the exact body key the middleware's
  // /api/auth/login expects — sending `identifier` (the old key name)
  // silently 400s, since the field just isn't there at all. (This exact
  // mistake made it back into this file once already, from editing a
  // stale prior copy — see the login flow that surfaced it.)
  async function login(email, password) {
    return $fetch(`${config.public.middlewareUrl}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      body: { email, password }
    });
  }

  async function register(email, password, displayName, phone) {
    return $fetch(`${config.public.middlewareUrl}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      body: { email, password, displayName, phone }
    });
  }

  // ---- Organisation Admin dashboard (pages/organisation/*) -------------
  // ADDED (organisations). All authedFetch, so an expired access token is
  // refreshed and retried exactly like every other signed-in call. Whether
  // the reader is actually an Org Admin is decided by the server on every
  // request (403 otherwise); nothing here sends an organisation id.
  const orgAdminBase = () => `${config.public.middlewareUrl}/api/org-admin`;
  const orgAdmin = {
    summary: () => authedFetch(`${orgAdminBase()}/summary`),
    members: (query = {}) => authedFetch(`${orgAdminBase()}/members`, { query }),
    addMember: (body) => authedFetch(`${orgAdminBase()}/members`, { method: 'POST', body }),
    grantAccess: (seatId, body) => authedFetch(`${orgAdminBase()}/members/${seatId}/access`, { method: 'POST', body }),
    setStatus: (seatId, status, reason) => authedFetch(`${orgAdminBase()}/members/${seatId}/status`, { method: 'POST', body: { status, reason } }),
    setRole: (seatId, role) => authedFetch(`${orgAdminBase()}/members/${seatId}/role`, { method: 'POST', body: { role } }),
    remove: (seatId, reason) => authedFetch(`${orgAdminBase()}/members/${seatId}/remove`, { method: 'POST', body: { reason } }),
    resendInvite: (seatId) => authedFetch(`${orgAdminBase()}/members/${seatId}/resend-invite`, { method: 'POST' }),
    // Phase 0: which paid publications this member reads, e.g. ['NV', 'BK']
    setPublications: (seatId, publications) => authedFetch(`${orgAdminBase()}/members/${seatId}/publications`, { method: 'POST', body: { publications } }),
    audit: (query = {}) => authedFetch(`${orgAdminBase()}/audit`, { query }),
    // Phases 1–4: days each member was active and the papers they opened (no pages or stories)
    usage: (month) => authedFetch(`${orgAdminBase()}/usage`, { query: month ? { month } : {} }),
    template: () => authedFetch(`${orgAdminBase()}/import/template`, { responseType: 'blob' }),
    // formData: FormData with `file` and optionally `defaults` (JSON string)
    previewImport: (formData) => authedFetch(`${orgAdminBase()}/import/preview`, { method: 'POST', body: formData }),
    commitImport: (importId) => authedFetch(`${orgAdminBase()}/import/${importId}/commit`, { method: 'POST' })
  };

  // ---- Organisation invites (pages/invite.vue) ---------------------------
  // Not authedFetch: the person accepting has no session yet. acceptInvite
  // returns { jwt, user } like login(), and sets the refresh cookie.
  async function inspectInvite(token) {
    return $fetch(`${config.public.middlewareUrl}/api/auth/invite/inspect`, { method: 'POST', body: { token } });
  }
  async function acceptInvite(token, password, displayName) {
    return $fetch(`${config.public.middlewareUrl}/api/auth/invite/accept`, {
      method: 'POST',
      credentials: 'include',
      body: { token, password, displayName }
    });
  }

  return {
    getEdition, getRanges, getCatalogue, mediaUrl, getAccount, startCheckout, getPaymentStatus, getPlans,
    login, register, fetchImageBlob,
    orgAdmin, inspectInvite, acceptInvite,
    renewToken
  };
}