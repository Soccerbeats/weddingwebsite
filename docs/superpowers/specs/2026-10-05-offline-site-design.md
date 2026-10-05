# The whole site, offline

**Date:** 2026-10-05
**Status:** approved in advance — "I would like the entire site to work without internet. Go make that happen."

## The problem

Austin installed the site to an iPhone home screen. With no connection it does not open.

Why: the only service worker (`public/honeymoon-sw.js`) is registered by the honeymoon Today and Files tabs, and it only keeps honeymoon pages, the honeymoon data and the app's scripts. The installed app starts at `/admin` (or `/`), which nothing ever saved, and none of the wedding pages, the admin pages or their data were saved either. On iOS a home-screen app also has its own storage, separate from Safari, so anything saved while browsing in Safari is not there for the installed app.

## What "works offline" means here

- **Every page opens**: the public pages (home, about, our story, wedding party, schedule, photos, RSVP, registry) and every admin page, including the honeymoon portal. Each shows the content and data **as they were when last saved**.
- **Reading works, saving does not.** A change made offline fails with one clear message — "You're offline — this wasn't saved. Try again when you're back online." — instead of a generic error. (Queueing edits to replay later risks silently overwriting changes made elsewhere; read-only offline is the honest scope.)
- **It is obvious when you are offline**: a small bar says so and when the saved copy is from.
- **Map tiles and other sites' content** (OpenStreetMap tiles, booking-site photos, weather lookups) need the internet. Pages still open; those pieces are blank or say so.

## How

**One site-wide service worker, `/sw.js`**, registered from the app shell on every page (public and admin). `honeymoon-sw.js` becomes `importScripts('/sw.js')` so phones that already have the old worker pick up the new one without being re-registered by hand.

| Request | Strategy |
|---|---|
| A page (navigation) | Network first with a 6-second timeout (a bad signal is worse than none); the saved copy if that fails; an `/offline` page if the page was never saved |
| `/_next/static/…` (the app's code, styles, fonts) | Saved copy first — these files never change once built |
| `GET /api/…` (page data) | Network first, 6-second timeout, then the saved copy. Auth and offline-manifest routes are never saved |
| `/api/photos/…` | Network first, then the saved copy; saved as they are viewed, capped so storage cannot grow without limit; travel documents keep their own cache from v0.10.1 |
| Next.js client-navigation data (`RSC` requests) | Network only. Offline, Next falls back to a full page load, which the saved page answers |
| Anything that writes (POST/PATCH/DELETE) | Network; if that fails, a 503 with the offline message above, so every existing error display shows the right words |

**Saving everything, not just what you visited.** A page you never opened cannot be shown offline unless something opens it first. So the site saves itself:

1. `GET /api/offline/manifest` lists the build's code files (read from `.next/static`), the site's icons and manifests, and every page — the admin pages only when the request carries a valid admin session.
2. The worker saves all of those, skipping any page that redirected (a login page must never be saved as `/admin`), and drops code from older builds.
3. The app then opens each page once in an invisible frame, so the data, photos and lazy-loaded code each page actually uses get saved exactly as it uses them. While doing that the worker **refuses every write from the invisible frame**, so the pass cannot change anything (the honeymoon tabs send background weather and route lookups on load; those are refused).

**When it runs:** automatically in the **installed app** (home-screen / standalone mode) when online and the saved copy is missing, from an older version of the site, or over 12 hours old. In an ordinary browser tab it only saves what you visit, unless you tap **Save for offline** in the admin sidebar. Progress shows in the sidebar ("Saving for offline… 14 of 40") and the result stays there ("Saved for offline · today 14:02").

**Logging out clears every saved copy** on that device.

## Testing

- `npm run check:offline` (no browser, runs in CI): the worker's routing rules on representative requests; that every page in `src/app` is in the offline page list or deliberately excluded; the staleness rule.
- `npm run check:offline:ui` (Playwright against a production build, manual like `check:hero`): log in, save for offline, cut the network, then open every page and confirm it renders real content (not the browser's error and not the fallback); a save attempt shows the offline message; logout clears the caches.

## Out of scope

Editing offline and syncing later. Map tiles offline. Push notifications.

Ships as **v0.10.3**.
