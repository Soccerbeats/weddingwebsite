# Edit offline, and an app that keeps itself current

**Date:** 2026-10-10
**Status:** approved in advance — "a clear goal that I want you to not stop working on until it's achieved."

## The goal

The site is installed on Austin's iPhone. Opening it should leave the whole site on the phone — every public page and all the admin data, but not photos the site does not use. Offline, the admin must be editable — the honeymoon portal above all — and the edits must reach the server once there is a connection. Every time the app opens it should check whether the server changed and update its copy without being asked.

v0.10.3 had made the site readable offline, with writes refused ("this wasn't saved"), a 12-hour refresh rule, and every photo seen saved.

## Design

**Outbox in the worker.** `public/sw.js` intercepts admin writes. With nothing waiting it sends straight on (20 s limit); if that fails, or writes are already waiting, it stores `{method, url, body, tempIds, key}` in IndexedDB `site-outbox` and answers `202`, `X-Offline-Queued: 1`, with a body shaped like the server's (a created row with a temporary id; `created: [...]` for arrays). Lookups, uploads, shares and archive restores are `NOT_QUEUED` and still fail with the offline message.

**Temporary ids.** Negative microsecond timestamps — far below any real id, price or coordinate. When a queued create succeeds, the real id is stored (`ids` store); every later body and query string is rewritten before it is sent. Direct sends are rewritten too, because a page may still hold a temporary id after the outbox has emptied.

**Replay.** Oldest first, one at a time, each claimed in a transaction so two copies of the worker cannot both send it. No connection or a 502/503/504/408/429 stops the pass; a 401 stops it and asks for sign-in; a 500 is retried twice; any other refusal is set aside and listed. Triggers: the page opening, coming to the foreground, the connection coming back.

**Applied once.** Every send carries `X-Outbox-Key` (the same key for the first attempt and any resend). Create routes are wrapped in `replayable()`, which answers a repeated key with the first answer, kept in memory for a day. Chromium retries a cut-off POST twice by itself; those carry the key as well.

**Showing offline edits.** The honeymoon portal renders `applyQueuedWrites(savedPayload, outbox)`: the payload flattened into tables, each write applied with the route's own field rules (moved to `honeymoonResources.ts`) and defaults and the schema's cascades, then rebuilt with the same derivations the server's read does (`refileLegsByDate`, `basesFromBookings`). Site-config edits are merged by the worker into the config it serves. Other admin sections send their edits the same way but show them only once sent.

**Keeping current.** `/api/offline/manifest` adds `data`: a hash of Postgres's per-table insert/update/delete counters (minus tables written on read: route and weather caches, `finance_snapshots`) and the config files' sizes and times. `updateNeeded(record, server)` → `full` (no copy, new build, signed-in vs signed-out) / `data` (fingerprint differs or > 12 h) / nothing. `data` re-fetches every saved page and response in place, then reopens each page in the hidden frame to pick up anything new.

**Photos.** Photos requested by `/admin/photos` are never stored; a full pass records every photo asked for and then drops the rest. The hidden frame fetches every image on a page, so lazily loaded gallery rows are saved too. Offline, a photo saved at another size answers. Other sites' images (map tiles, booking photos) go in their own capped cache as they are seen.

## Limits

Last write wins. Outside the honeymoon portal and site settings, offline edits appear once sent. The in-memory repeat guard does not survive a server restart.

## Testing

`check:offline` (126, CI) and `check:offline:ui` (72, production build, real browser behind a proxy that can drop connections or lose answers).
