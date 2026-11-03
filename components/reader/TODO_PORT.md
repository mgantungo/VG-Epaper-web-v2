# What's left to port into Vue components

Everything below has its state already living in `stores/reader.ts` /
`stores/account.ts` — none of this needs new store logic, just templates
following the same pattern as `EpaperToolbar.vue` / `ArchiveModal.vue`.

## Search overlay
In the HTML mockup: a text input filtering the mapped story hotspots by
headline/kicker/teaser, jumping to the matching page and opening its pullout.
To port: a `SearchOverlay.vue` that calls a new `GET /api/editions/:date/search?q=`
on the middleware (not built yet — right now search would need to filter
client-side over whatever pages/stories are already loaded in
`reader.edition.pages`, which only covers the currently open edition, not the
whole archive). Decide whether search should be edition-scoped (simple, matches
the mockup) or cross-archive (needs a real Strapi query + its own entitlement
handling, since search shouldn't leak story text from unpurchased editions).

## Contents drawer
A slide-over listing every page number with a short label, click to jump.
`reader.edition.pages` already has `pageNumber` + `section` for exactly this —
`ContentsDrawer.vue` is mostly a `v-for` over that array calling `reader.jumpTo()`.

## Account popover
Shows subscription status + purchased archive dates + a sign-out action.
`stores/account.ts` already exposes everything needed
(`subscriptionActive`, `subscriptionExpiresAt`, `purchasedDates`). This also
needs actual sign-in/sign-up UI, which the mockup never had (it assumed an
already-authenticated demo account) — that's new work, not a port, and depends
on how you want to run Strapi's Users & Permissions flow (email/password,
OAuth, OTP, etc.).

## Info popover
Edition metadata (volume/issue number/page count/price). Trivial — same
pattern as `PulloutPanel.vue`, just reading fields already returned by
`GET /api/editions/:date`.

## Archive thumbnail grid
The HTML mockup's Archive opened on a scrollable grid of recent front-page
thumbnails (with lock badges) before you ever touched the year sidebar;
`ArchiveModal.vue` here only has the year → month/day calendar, not that
landing grid. To port it: fetch a small `pageNumber=1` thumbnail per recent
date (the middleware doesn't have a batch/thumbnail endpoint yet — add one,
rather than firing N individual `/api/editions/:date` requests for a grid of
thumbnails) and reuse the lock-badge logic already in the calendar cells.
