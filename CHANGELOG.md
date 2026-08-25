# Changelog

All notable changes to this project are documented here, newest at the top.

> **Living document — this file is the source of truth for the app version.** The current
> version is the topmost `vX.Y.Z` heading, and it is what the admin panel's changelog button
> displays. Every substantive change gets an entry, stamped
> ``## vX.Y.Z — [Unreleased] <title> (`branch`, YYYY-MM-DD HH:MM)`` — times in UTC
> (`date -u '+%Y-%m-%d %H:%M'`). Flip `[Unreleased]` → `[Released]` once it is pushed and
> deployed. Group changes under `### Added`, `### Changed`, `### Fixed` — the in-app viewer
> renders those three as coloured badges. Bump the patch on every deploy, the minor when
> asked. Entries predating this convention carry a date but no time.

## v0.9.42 — [Released] The audit's bugs, fixed (`main`, 2026-08-25 15:44)

Every fixable finding from `docs/bug-audit-2026-08-25.md`, in one release. The three critical items are server-side and guest-facing; the rest range from wrong headline numbers to lint. The audit document carries a status line per finding.

### Fixed
- **`PUT /api/rsvp` no longer trusts a client-supplied id.** Both POST and PUT find the household by the verified guest name; a request cannot overwrite somebody else's RSVP by guessing a number. One RSVP row per household — a second submission updates the first instead of adding a duplicate the dashboard then counted twice.
- **`POST /api/rsvp` refuses names that are not on the guest list** (404) rather than inserting them into `guest_list` as invited guests. Every field is type-checked; a non-array dietary payload can no longer 500 against the JSONB column.
- **The JWT secret is no longer the literal `default_secret_password` when the env var is missing.** `src/lib/auth.ts` reads `JWT_SECRET` (falling back to `ADMIN_PASSWORD`); with neither set, login refuses and every cookie fails verification — a misconfigured instance is locked, not open. Login compares in constant time and is rate-limited (10 tries / 15 min per IP); `/api/rsvp` and `/api/guest-verification` are rate-limited too.
- **Sessions slide.** A token in its last hour is re-issued on any authenticated request, so an afternoon in the seating chart no longer ends with every save quietly returning 401. When one does expire, the finance and honeymoon suites say *sign in again* instead of "Unauthorized". The cookie is `secure` whenever the request arrived over HTTPS.
- **"Make changes" right after a first RSVP works.** The form remembers the row the API just created instead of building `{id: undefined}` and getting a 400.
- **RSVP emails are signed with the couple's names from settings**, not "Sarah & James"; SMTP uses implicit TLS on port 465.
- **The schedule page's "[Hotel Name]" shuttle text and "Black Tie Optional" card are gone.** Both are now optional fields on the admin Schedule page ("Getting There" and "Dress Code") and render only when filled in.
- **Dashboard seating stats.** Tables are created with no fixed capacity, so the card read "5/0, 0% filled"; capacity is now the larger of the declared seat count and the seats in use, on the dashboard and in the floor-plan API alike.
- **The public gallery reads `/api/photos`** (hearted, ordered) instead of the static `/config/photos.json`, which Next only lists at boot — a fresh install or a demo whose seeder lost the race to the web service showed an empty gallery until restart.
- **`site.json` writes are serialised and atomic.** Every route goes through `updateSiteConfig()` — one queue, write-then-rename — so two admin tabs saving together no longer lose each other's keys and a crash mid-write cannot leave the site on its template defaults. The Settings, About, Colour, Home, FAQ, Wedding Party, Schedule and Registry editors post only the keys they own; `pageBgColors` merges one level down.
- **Hearts on phones.** `HeartBurst` sprayed hearts on every tap; it now needs a real double-tap (two touches within 300 ms and 30 px).
- **Deleting a honeymoon day renumbers the rest**, as dragging one does; the calendar counts to the highest day number rather than the row count; "+ Add day N" agrees with the API. Undo re-inserts the day at its old position.
- **`createCategory` no longer treats every 500 as "duplicate, fine"**; the API returns 409 for a real duplicate and the client checks its own list first. Typing a new category in the place editor or on the Excursions tab now creates the row, so it can be renamed, recoloured and bulk-applied.
- **WIP and hidden pages are gated in the middleware**, server-side, so a veiled page never renders for a guest — not for a frame, not without JavaScript. `WipCheck` is gone.
- **Seating drops use party members' names** ("Jane Doe") where the guest list has them, instead of "John's guest 1". Seat assignments are written in one transaction; reordering a table replaces its seat list in one request rather than DELETE-then-POST, which could leave the table empty. Esc leaves room-edit mode, as its legend always promised.
- **Uploads share one guard** (`src/lib/uploads.ts`): basename only, whitelisted image extensions, 25 MB cap, on photos, timeline, wedding-party and nav-cards alike. The wedding-party DELETE and nav-cards PATCH no longer accept `../` paths. The photo route serves SVG as a download rather than `image/svg+xml`, knows HEIC and PDF, checks for a real file, and snaps `?w=` to a fixed ladder.
- **`fetch-meta` and the geocoder's short-link expander go through `safeFetch`**: hostnames are resolved and refused if private, loopback or link-local — on every redirect hop — and bodies are capped. The expander accepts `goo.gl` / `maps.app.goo.gl` by hostname, not by substring.
- **The finance API returns 400 for an amount that is not a number** instead of writing 0 over the real figure; unknown enum values are refused rather than silently mapped; a zero `category_id` fails the required check with a message rather than a constraint error.
- **`database/init.sql` now carries every table** — the nine `finance_*` tables and `honeymoon_categories` were only ever created at runtime — plus the `guest_list_name_unique` index the upsert relies on (created only when no duplicates exist, with a NOTICE otherwise). The guest-list route no longer runs `ALTER TABLE` and `CREATE INDEX` on every request. CSV import's `plus_one_name` column is saved; doubled quotes parse.
- **DATE columns come back as `YYYY-MM-DD` text** (`lib/db.ts`), so trip dates and due dates no longer depend on the server's time zone. Finance default dates use the browser's local day, not UTC.
- Honeymoon: **IDR shows as Rp**; `priceValue` reads the currency-marked figure ("2 bed villa $300" is 300); dashboard headline numbers, the Excursions tab and duplicate-link detection all exclude removed stays; bulk-deleting categories moves their places to Other; a failed undo re-link reports itself; the range picker's drag works with a finger; time and text fields save only when changed and follow edits made elsewhere; day ranges and lasso "add to day" are one request each; `.ics` stop events carry the address and a 23:xx start no longer produces a zero-length event; search indexes the names of place-linked stops; day colours no longer repeat after ten.
- Public site: the schedule's FAQ link lands on the FAQs; the countdown parses the free-text date on every browser and says *We're married!* afterwards; the footer's year comes from the wedding date; the RSVP contact address is a setting; FAQ answers only link to `http(s)`/`mailto`; empty FAQ drafts are hidden; registry cards survive a missing handle or a zero price; about/venue photos load at a sensible size; a leaked `ResizeObserver` per render in the hero is fixed.
- Admin: FAQ "+ Add" adds a draft instead of publishing "New Question / New Answer"; the declined-guests stat counts households; `/admin` redirects on the server; the slideshow interval field cannot save `NaN`; the dashboard uses the shared connection pool; the horizon field commits on blur.

### Changed
- **The check suite is green and CI runs it**: `check:types`, `lint`, `check:photos`, `check:finance` and `check:honeymoon` join the build job. Lint went from 92 errors to 0; `verify-honeymoon`'s fixture learned `archived`; the Playwright-dependent finance UI script is excluded from the type check and its npm script fetches Playwright on demand. `scripts/migrate.js` (CommonJS, duplicated `init-db.sh`) is removed.
- New settings: contact email, wedding-party section titles, schedule detail cards. New optional env var `JWT_SECRET`.
- AGENTS.md describes the auth module, the WIP middleware, the config queue and the upload guard.

## v0.9.41 — [Released] Nine releases get written up (`main`, 2026-08-25 06:01)

### Changed
- **The wiki catches up on v0.9.32 → v0.9.40.** Nine pages changed, and the honeymoon and finance pages had drifted furthest — the Stays section had never heard of areas, the area filter or the Removed bucket, and the finance page still described a tab that has since been rebuilt.
- **Deployment now explains how an image actually reaches a server**, which is the thing that changed most and was documented least: both hosts run a timer that compares the digest of `:latest` against the image their container is running and redeploy only on a difference. The deploy loop's third step is now "nothing".
- **The Portainer webhook finding is written down with its correction.** I first concluded webhooks were unavailable for this stack; a full scan of Portainer's database found **two other stacks that do have persisted ones**, both the same type and neither Git-backed — so the feature works there and it is worth retrying at stack-creation time. The wiki, `ops/README.md` and the vault all now say that, along with the one-line check that tells you whether a token really saved before you wire it into CI.
- README: the honeymoon summary mentions the shortlist you can rank, tag by area and rule out without deleting; the Deployment link says what it now covers.
- Architecture gained the `archived` column beside the three others that encode a decision, Troubleshooting gained the dead-webhook and the 500-on-blank rows, Development mentions `ops/`, Home carries the licence, and Features stops describing the stays tab as it was four versions ago.

## v0.9.40 — [Released] Filter the shortlist by area (`main`, 2026-08-25 05:28)

### Added
- **An area filter on the Stays tab**, beside the sort. Pick Ubud and the shortlist is the Ubud stays; the options are only the areas that actually hold one, each with its count — offering every region you have ever created when six of them have a hotel in makes the control useless, and an option that can only return nothing is a trap.
- **It composes with the rating pills** rather than replacing them, so *"the ones I am interested in, in Ubud"* is a question you can ask. **No area set** appears when some stays have no area yet, so the ones needing tagging are one click away.
- **The map deliberately does not follow it.** Filtering narrows the list; the map answers "where are these, relative to each other", which a map that empties out when you pick an area cannot. Same rule the rating filters have always followed.
- The control hides itself when there is only one area to choose between, and the empty state now names the filter that is hiding things — *"No stays in that area with those ratings — try All areas"* — rather than saying "try All" when the area is the culprit.

### Verified
- The options list exactly the areas in use with correct counts (`Algarve 1 · Douro Valley 2 · Lisbon 1 · Madeira 1 · Porto 1 · Sintra 1`), filtering to Douro Valley shows precisely its two stays, the map stays at seven pins throughout, and a filter combination with no matches shows the area-aware hint.
- **Deleting a removed stay works** — confirmed rather than assumed, since it was asked about: a live stay's ⋯ menu offers *Edit details* and *Remove from the shortlist* and no delete at all; the same menu on a stay inside the Removed bucket offers *Put back on the shortlist* and *Delete for good*, which returns `DELETE 200` and takes the row out of the database rather than re-archiving it. The portal's ten-second Undo covers it like any other delete.

## v0.9.39 — [Released] Removed stays go in a bucket, not the bin (`main`, 2026-08-25 05:22)

### Added
- **Stays can be removed without being deleted.** A stay's ⋯ menu offers **Remove from the shortlist**; it leaves the shortlist, disappears from both maps, and turns up in a **🗑 Removed** bucket beside the rating filters. **Put back on the shortlist** returns it. You ruled a hotel out for a reason, and *"why did we say no to that one?"* comes back a fortnight later.
- **Deleting is no longer offered on a live stay at all.** It exists only inside the Removed bucket, as **Delete for good** — one deliberate step further on, rather than sitting next to Edit details waiting to be misclicked.
- **The bucket is a separate list, not a filter over the shortlist.** `All` means all the ones still in the running, which is what you mean when you look at a shortlist — so the counts on every pill drop when you remove one.
- **The pill only appears once something is in it.** A bucket that is always empty is a button that does nothing, and it would sit there on every trip that never removes a stay.
- A removed stay is **off both maps**: the shortlist's own map and the Map tab's pins. No toggle to bring them back either — the map exists to help you decide, and an option to show the rejects would put them back in the way of that. Verified in a browser: 7 pins to 6 on removing one, still 6 while the Removed bucket is open, back to 7 on restoring it, and the Map tab's own count going 78 → 77 → 78.
- The count on the dashboard and the Base picker in the itinerary skip removed stays too — a headline number that includes the ones you rejected is a wrong number, and a hotel you have ruled out is not a candidate to sleep in. A day whose base is already a removed stay keeps it listed, or the day would silently lose its base.
- One exception, deliberate: **the day view still draws a removed place that is actually scheduled**, exactly as it already does for an unconfirmed pin. If you put it on a day, the route needs it.

### Changed
- New `archived` column on `honeymoon_places`, in `init.sql` and mirrored by the runtime schema owner. Tested on the path a deployed instance will take — an existing database missing the column, a fresh process, and the 83 rows already there all defaulting to `false` rather than null.

## v0.9.38 — [Released] Stays say which area they are in (`main`, 2026-08-25 05:07)

### Added
- **An area dropdown on every stay card** — Ubud, Seminyak, Canggu, whatever you have. It sits with the address and the map pin because it answers the same question, and a shortlist is something you sort by area in your head long before you care what it costs.
- **It is the same set of regions the rest of the portal uses**, not a new field: an area picked here shows up in the map's region filter, and one created here gets its own write-up on the Guide tab. **＋ Custom…** makes a new area without leaving the card and reuses an existing one on a name match rather than creating a near-duplicate; **✎ Edit / remove…** renames or deletes, saying how many places each area holds first. Renaming keeps everything filed where it is; deleting keeps the places and clears their area.
- Editing it inline rather than through the place editor is the point of it: tagging six hotels should not be six trips through a modal.
- The picker is the one the place editor already uses, given a `compact` prop that swaps the form-sized field for a pill. Only the chrome differs — creating and managing behave identically, which is why it is a prop and not a second component.

### Fixed
- **Creating an area with no country returned a 500.** `honeymoon_regions.country` is `NOT NULL DEFAULT ''`, but a blank was being coerced to `null` on the way in, so the insert failed its own constraint. That is exactly what **＋ Custom…** does whenever the trip has no focus country set — so the feature above did not work at all until this was fixed, and neither did the same button in the place editor.
- **Emptying a guide note's text returned a 500**, for the same reason on `honeymoon_notes.body` — and clearing a note you no longer want is an ordinary edit on the Guide tab. Found by checking whether the first bug had siblings rather than assuming it was alone.
- Both are one flag, `blankAsEmpty`, which the field layer already had and which `places.country` and `trip.focus_country` were already using. Two columns had simply been missed.

## v0.9.37 — [Released] A license: free for your wedding, ask about anything else (`main`, 2026-08-24 15:58)

### Added
- **`LICENSE.md` — the PolyForm Noncommercial License 1.0.0**, verbatim from the SPDX license list rather than retyped, because a licence reproduced from memory is a licence with subtle holes in it. Anyone may run this for their own wedding, or a friend's: read it, change it, self-host it, share the changes, no permission needed. Charities, schools, public research bodies and government institutions count as noncommercial too, whatever their funding. Selling it, hosting it as a paid service or building client sites with it needs a separate license, which is an invitation rather than a refusal.
- **A plain-English summary above the licence, marked as non-binding** and explicitly deferring to the text below it, so the intent is readable in fifteen seconds without the summary being able to create an ambiguity of its own.
- **Two exclusions stated outright**: dependencies keep their own licences — this covers the code in this repository, not Next.js or Postgres — and anyone's wedding content belongs to whoever put it there. None of the latter is in this repository; the README's screenshots are all of the fictional demo.
- `license` in `package.json` (`PolyForm-Noncommercial-1.0.0`, a real SPDX identifier) and a License section in the README.

### Changed
- The repository had **no licence at all** until now, which under copyright means "all rights reserved" — so this only *grants* permissions that nobody previously had, rather than withdrawing any. Note that GitHub's sidebar will likely not name the licence: its detector recognises common open-source licences, and this deliberately is not one.

## v0.9.36 — [Released] Production stops waiting to be told (`main`, 2026-08-24 13:23)

### Added
- **The production host now polls for its own image**, the way the demo box already does — `ops/prod-autoupdate/` installs a five-minute timer that compares the digest of `:latest` against the image its container is running and recreates it only on a difference. A merge reaches the live site on its own, with nothing on that machine reachable from CI.
- **Scoped to the web service** (`--no-deps web`), so `wedding-db-prod` is never recreated because an application image moved — a failed recreate on this stack has previously left the database created-but-stopped while pages that don't touch it still answered 200. Compose does the swap, never `docker run`: compose only manages containers carrying `com.docker.compose.config-hash`, which only compose writes and cannot be added afterwards, so a hand-made container silently breaks Portainer's own redeploy button.
- **A post-deploy check**: it curls the site after the swap and logs the status code, because a silent failure here is a wedding site that is down underneath a green log line.
- It uses **Portainer's own** compose file and env, mirrored on the host and verified byte-identical (md5) to the copy inside the Portainer container — so a poll deploys exactly what pressing the button would.

### Changed
- **CI's message when no webhook is configured is now a notice, not a warning**, and says what actually happens: the host will pull this image within about five minutes, and setting the secret makes the deploy synchronous with the merge instead. The old wording said production "was NOT redeployed", which stopped being true the moment the fallback existed.

### Fixed
- **Why the webhook still does not work, established rather than guessed.** Two tokens generated in Portainer's UI were both absent from its database: stack 146 reads `"Webhook":""` and `"AutoUpdate":null`, and the endpoint answers a real token and a made-up one identically — *"Unable to find the stack by webhook ID"*. So the token was never persisted, however the UI produced it. Ruled out along the way: the endpoint is right (Portainer 2.39.4 answers `/api/status`), the stack was genuinely saved (its `UpdateDate` is today), and both containers carry their `config-hash` label, so a failing stack update is not the cause either.

## v0.9.35 — [Released] The admin API asks who you are (`main`, 2026-08-24 04:54)

### Fixed
- **The admin API accepted unauthenticated requests.** `src/middleware.ts` guarded `/admin/*`, but the routes under `/api/admin/*` checked nothing themselves — so anyone who could reach the site could rewrite the guest list, delete photographs, edit any page or read every RSVP with a bare `curl`, without ever seeing the login page. Verified against a running instance before the fix (a cookie-less `PATCH` returned 200 and the row changed) and after it (401, and the row is untouched).
  - The cookie is now required for **every method, GET included**. Reading was as open as writing, and what it exposed was names, addresses, phone numbers and dietary requirements.
  - Three endpoints stay public, to GET only: `site-config`, `registry-items` and `timeline`. They live under `/api/admin/` by an accident of naming but serve the public site — the nav and the RSVP form read the site config, the registry page reads the registry, our-story reads the timeline — so this is why the hole was awkward to close rather than an oversight. Each one returns content that is already rendered on a public page. The allowlist is a named set with a comment saying what adding to it means.
  - Enforced in the middleware rather than in the thirty-odd handlers, so a route added next month is covered before it is written.
  - **The demo instance is unaffected by design**: its writes are still answered without reaching a handler, and its admin GETs still work with no login, because that flag opens the panel deliberately. Verified both, plus that a refused `DEMO_MODE` now lands on the *stricter* path rather than an open one.
- **`npm audit` went from 31 vulnerabilities (1 critical, 10 high) to zero.** Next 16.0.8 → 16.3.2 (Server Actions source-code exposure, a DoS in Server Components), nodemailer 7 → 9 (SMTP command injection via a CRLF in the transport name, and via `envelope.size`), and the rest of the tree with `npm audit fix`.
- **`sharp` is now a declared dependency, pinned to a fixed version.** It was inherited from Next — which meant the photo route imported a library the project never declared, at a version it could not choose, and it was sitting on four libvips CVEs. It processes uploaded images, so it is about as reachable as a dependency gets.
- **The RSVP confirmation email interpolated the guest's typed name into HTML.** The form emails whatever address was entered, so it could be used to deliver a wedding-branded email carrying someone else's markup to a third party. Escaped at the boundary.

### Changed
- **`allowedDevOrigins` is set for the dev server.** Next 16.3 enforces what 16.0 merely warned about, and the dev stack in `docker/` is browsed by the server's LAN address rather than localhost. Without it the pages render while every chunk 403s — so the site loads and then does nothing: forms submit as plain GETs and no button works. It fails in the one way that does not look like a configuration problem, and it cost me twenty minutes of believing I had broken hydration. Development only; `next start` ignores it.

### Verified
- The security fix, in a production build as well as dev: seven public pages 200, anonymous read and write both 401, the three allowlisted reads 200, `/admin` still redirects, and a logged-in session reads and writes normally.
- Every public page renders for a visitor with no cookie, with no console errors beyond a missing `photos.json` that only exists in a deployed volume.
- Six admin pages load and an inline edit still saves, after the framework upgrade.
- The photo route's own suite (`npm run check:photos`) against the new `sharp`, plus the finance, honeymoon and changelog suites.
- No SQL is built by interpolation: 207 of 210 queries are parameterised, and the three that name a table pull it from a whitelist guarded by `hasOwnProperty`.

## v0.9.34 — [Released] The finance tab uses the screen (`main`, 2026-08-24 05:02)

### Fixed
- **The line totals were being cut off.** On the Budget tab the total column was 80px holding `$10,120.00`, and the column beside it held a *badge and a toggle* in 72px — so both overflowed and the badge landed on top of the number. Every unpaid line over four figures read as `$10,120.0` with `NOT PAID` printed across it. The columns are now sized for what they contain.
- **`$` sat at the far left of a cell while its digits sat at the far right**, so a money field read as two unrelated things — `$        6800`. Money cells now show the formatted value when you are not editing them (`$6,800.00`, symbol against the digits, thousands separated) and swap to the raw number on focus, which is what you want to type over. The text is selected on entry, because the common edit is replacing a number rather than appending to one.
- **Escape saved the edit it was supposed to throw away.** It reset the draft and blurred, but `setDraft` is asynchronous, so the commit that the blur fired still saw the abandoned text and wrote it. Pressing Escape after typing 999 into a $7,250 line left the line at $999. Both inline fields now flag the abandon on a ref, which the blur reads synchronously. Found by testing my own change in a browser; it had been there all along.
- Placeholders that never fit their column — `Vendor, confirmation no…` rendering as `Vendor, confirmati` — read as truncated *data*. Shortened.
- **The fifth stat tile on Gift Money** wrapped onto a row of its own with three empty slots beside it: four tiles in a four-column grid, five tiles in the markup.

### Changed
- **The tab was capped at 1024px and centred, throwing away 320px of a 1600px window** — on the very tabs whose columns were clipping for want of it. It now uses the width, with tighter gutters than the rest of the admin panel: 32px of margin either side is breathing room on a form and a lost column on a budget.
- **Overview and Settings go to two columns above 1280px** rather than stretching. Full width is right for a table and wrong for prose and for forms: it had put "Vendor bills" and its one line of text across fourteen hundred pixels, and made every settings input a runway. Multicol rather than a grid, because the cards are wildly different heights and a grid leaves a ragged hole beside every short one. Overview now opens with the biggest line items already on screen, and Settings fits on one screen.
- **The header and the tab bar share a row**, and the tabs are one bordered segmented control instead of six loose pills — two stacked rows of chrome cost a third of the first screen on every tab.
- **The `PAID` badge is gone from lines the toggle already describes.** A badge saying "PAID" beside a switch that is visibly on says it twice; it is kept for *part-paid* and *overpaid*, which a two-state switch cannot express — and which are the two you need to notice.
- Row separators went from `gray-50` to `gray-100`. At 1300px wide the eye needs the line to get from a name to its total.
- A truncated name now carries a tooltip, so a long line item is readable without widening the column for every other row.

## v0.9.33 — [Released] A merge redeploys the running instances (`main`, 2026-08-24 04:22)

### Added
- **CI tells Portainer to redeploy production once the image is published.** A new `redeploy` job POSTs the stack's webhook after the image job, so a merge to `main` reaches the live site without anyone pressing *Pull and redeploy*. Three attempts, because a cold pull can outrun Portainer's own timeout, and the URL is never printed — it is the credential. Only a push to `main` runs it: a `v*` tag deliberately does not redeploy, for the same reason it does not move `:latest`.
- **A webhook, deliberately, and not SSH.** A redeploy webhook's entire power is "re-pull this one stack"; an SSH key in CI is the power to run anything on a box that also hosts production, handed to anyone who can land a commit on a public repository. An earlier draft of the demo workflow did the latter and was dropped for exactly this reason.
- **The OVH instance pulls instead, because it cannot be pushed to.** That host is a Portainer *edge* environment and edge stacks have no per-stack webhook — the option is absent from the UI, so there is nothing for CI to call. It now polls: `ops/demo-autoupdate/` installs a timer that compares the digest of `:latest` against the image its container is running and redeploys only when they differ. Verified end to end: it took the demo from v0.9.30 to v0.9.32, the seed ran, and the *second* run correctly did nothing.
- **Only-when-changed is the whole design.** The demo stack has a one-shot seed service, so a blind `compose up -d` every five minutes would wipe and reseed the demo continuously — three dozen photographs re-fetched each time, and a window where a visitor sees an empty site. Comparing the running container against the freshly pulled image also self-heals: an instance left behind by a half-failed update is noticed on the next tick rather than at the next release.
- **`ops/` now holds the host-side pieces** — the auto-updater and the `DOCKER-USER` port rules — with the reasoning that made each necessary. Both existed as a file on exactly one box with nothing recording why.

### Fixed
- **Published Docker ports were not behind ufw.** ufw was active on the OVH host and every published container port still answered the internet: Docker writes its own DNAT and forwarding rules ahead of ufw's chains, so ufw cannot police a published port. The demo's `3001` — which skips Cloudflare and the reverse proxy entirely — and the proxy's own admin panel on `81` were both reachable from anywhere. Closed with rules in `DOCKER-USER`, matched on `-m conntrack --ctorigdstport` rather than the container's address, because DNAT has already rewritten the packet by the time it reaches `FORWARD` and a container's IP changes on every redeploy. Confirmed still blocking after the stack was recreated with a new container IP, and done for IPv6 too — that host has a public v6 address, so one family alone would have left the port open.

## v0.9.32 — [Released] The demo has an address (`main`, 2026-08-24 03:31)

### Added
- **The demo is live at [weddingwebsitedemo.com](https://weddingwebsitedemo.com), and the README says so** — a badge beside the documentation one, and the callout under the hero now leads with a link you can click instead of instructions for building your own. The screenshot note points there too: every screen in the README is one you can go and poke at, which is a stronger claim than "these are real screenshots".
- The wiki's demo page, Home, Features and sidebar carry the link, and Deployment now describes where the public instance actually runs: the OVH box, as a Portainer stack, with Nginx Proxy Manager in front of it forwarding to `172.17.0.1:3001` — the host gateway rather than the container name, because the proxy and the demo sit on different Docker networks.

## v0.9.31 — [Released] The documentation catches up (`main`, 2026-08-24 02:52)

### Changed
- **The wiki was written at v0.9.5 and the app is at v0.9.30.** Everything it had gone wrong about is now right: Deployment described building the image on a laptop, Installation pointed at paths that moved into `docker/`, Development named a `CLAUDE.md` that is now a symlink to `AGENTS.md`, and the demo page described a stack you filled by hand rather than one that is read-only and seeds itself. Ten of the fifteen pages changed.
- **The demo instance page is rewritten around `DEMO_MODE`** — what the flag changes, why the write block lives in the middleware rather than in the routes that write, why the flag is refused unless the database really is the demo's, and why reseeding on every start is safe *because* nothing persists.
- **Deployment now says what a merge publishes**, which event moves which tag, why a `v*` tag must never move `:latest`, and how to redeploy the demo.
- **Architecture gained how demo mode is put together** — the five files involved, why the browser asks an endpoint instead of reading a `NEXT_PUBLIC_` mirror, and why the banner's height is one variable. Plus the three honeymoon columns that each encode a decision: `rank`, `arrive_day_offset`, and a leg's nullable coordinates.
- **The honeymoon page covers the seventeen versions it had never seen** — the split view, the minimised overlay, flying to a day, travel arcs, the Travel tab, overnight legs, the stays map, ranking, sorting, mid tier — and its Settings section no longer claims that shortening the dates deletes the trailing days, which is exactly the behaviour v0.9.11 removed.
- **Troubleshooting gained six rows**, mostly demo- and pipeline-shaped, including the Leaflet markers that ate clicks and the two ways a demo can look wrong.
- README: the demo is described as what it now is — no login, everything open, every change discarded on refresh.
- Followed the `docker/docker-compose.yml` → `docker/docker-compose.dev.yml` rename through the README, `AGENTS.md`, the wiki, and the file's own header, which still told you to run it under its old name.

### Added
- **`AGENTS.md`'s "document everything" list now includes the wiki.** It went twenty-five versions stale because nothing on that list said to touch it, so the step now names the clone URL, the branch, and the expectation that a feature usually lands on three pages rather than one.
- Its demo-mode notes now describe the immutability rail as something to keep, not just as machinery: the flag's database check and the vestigial `ADMIN_PASSWORD` are both there so a refused flag fails towards production.

## v0.9.30 — [Released] The demo banner stops sitting on the nav (`main`, 2026-08-24 02:01)

### Fixed
- **The banner was drawn over the top of the nav bar**, clipping it. The nav is `position: fixed`, so it knew nothing about a banner sitting above it in the flow. The banner's height is now published once as a CSS variable — `--demo-banner-h`, `0px` on a normal instance — and everything that measures from the top of the window adds it: the nav bar, the island it becomes when you scroll, the mobile drawer that hangs off the bar, and the admin shell's fixed container. One number in one place, so they cannot disagree and clip each other again.
- Measured in a browser rather than eyeballed: the banner occupies 0–28px, the nav bar starts at exactly 28, the scrolled island at 40, and in the admin panel the shell starts at 108 with nothing hidden behind the banner.

### Added
- **The ADMIN button is always on the nav in demo mode.** The whole point is that anyone can walk into the admin panel, and a button they cannot see is a door they will not find. It is a separate `isDemo` prop rather than pretending the visitor is an admin — that flag also decides which pages the nav lists, and a visitor should see the site the way a guest sees it.

## v0.9.29 — [Released] The demo stack stops publishing its database (`main`, 2026-08-24 01:54)

### Fixed
- **The demo's Postgres was published on the host as `5433:5432`, with the password `demo`.** On an instance whose entire promise is that a visitor cannot change anything, that was a door straight past it: `DEMO_MODE` guards the application, not the database, so anyone who could reach the host could have connected with psql and written whatever they liked. The port is gone — the seed service reaches the database over the compose network, which is all anything needs. It was published in the first place so a hand-run seed could reach it from another machine; the seeder runs inside the stack now, so that reason has expired.
- The file's own header still described the old "seed only an empty database" behaviour, one screen above the `SEED_ALWAYS=true` that overrides it. It now says what it does: reseeds on every start, and why that is safe here.

## v0.9.28 — [Released] Demo mode: look at everything, change nothing (`main`, 2026-08-24 01:43)

### Added
- **`DEMO_MODE` turns an instance into a public demo — same image, one variable.** There is no separate demo build, which is the point: the demo always has the newest features because it *is* the production image. On the demo instance the whole admin panel is open with **no login** (the login page sends you inside), and **no write ever persists**: a visitor can rename the couple, delete photos, drag the seating chart about, submit an RSVP — and the next page load has it all back.
- **One interception point, in `src/middleware.ts`.** Every non-GET request to `/api/*` is answered with a plausible success — the fields sent, plus a synthetic id — and never reaches its route. That covers all 26 write routes *and every route added later*, so a new feature cannot forget to be immutable and the guarantee rests on nothing being careful. Verified against a live database: renaming a place, creating a day, deleting a place, patching the site config and posting a public RSVP all returned 200 and changed nothing, in Postgres or on disk.
- **A banner on every page** — *"🎭 Demo instance — everything here is fictional, and nothing you change is saved."* Server-rendered, so no flash, and it renders nothing at all on a normal instance.
- **Changes stay on screen until you leave.** The honeymoon portal skips its post-write refetch in demo mode, so a status dropdown or a rating does not snap back half a second after someone changes it. Creates and deletes still will not appear — lists only ever come from the server — which is the known limit of this approach.
- **The demo reseeds itself on every start** (`SEED_ALWAYS=true` on the seed service). Nothing a visitor did was kept, so there is nothing to preserve — and a fresh seed is how the fictional wedding picks up the data for features that shipped since the last deploy. Left unset, the seeder still skips a database that already has rows.

### Fixed
- **The flag is built to be hard to enable by accident**, because writes that quietly go nowhere are the worst failure this system has. It is off unless explicitly set, so every default fails towards "this is production" — and it *also* requires the database to be the demo's, so `DEMO_MODE` pasted onto the real stack is refused with a log line naming the mismatch. Verified: pointed at a database called `wedding_db` it refused, kept the login, and showed no banner. With the flag off, an authenticated write still persists exactly as before.

## v0.9.27 — [Released] The demo instance seeds itself (`main`, 2026-08-24 00:57)

### Added
- **The demo instance seeds itself.** A new "Demo Instance" workflow runs on every push to `main`: it waits for this build's image to land in the registry, then builds and publishes the one-shot **seeder** image, `ghcr.io/soccerbeats/weddingwebsite-seeder:latest`. That is all it does — it does not touch the server. Bringing the demo up to date stays what it is for production: pull the image, redeploy the stack.
- **The Dockerfile gains a seeder stage, published as a second image.** The production image ships the standalone server and nothing else, so it cannot run the seed. The seeder stage carries the scripts and a small entrypoint, and is published under its own name — the production image and its tags are untouched.

### Changed
- **The demo stack seeds itself on first boot.** A one-shot seed service joins the demo compose stack; it waits for the database, seeds only when the guest list is empty, writes the config and photos straight into the demo volumes, and exits. A fresh stack is complete after `up -d` — the manual SSH-tunnel-and-docker-cp flow in the wiki is gone — and a redeploy finds a non-empty guest list and skips, so a demo someone has been clicking around in is never wiped.

### Fixed
- **The workflow's third job — an SSH deploy to the server — was dropped before this merged.** It would have checked out the commit on the box and brought the demo stack up, gated on four `DEMO_DEPLOY_*` secrets. Two reasons it is gone rather than fixed. The demo runs the *same image* as production, so the job bought one redeploy click; and it cost a shell on the host that also runs production and a client's WordPress site, to anyone able to push to this public repository. And the gate that was meant to keep it dormant could not have worked either way: it read `if: secrets.DEMO_DEPLOY_SSH_KEY != ''` on the job, but the `secrets` context is not available in `jobs.<job_id>.if` — only `github`, `needs`, `vars` and `inputs` are — so the job would have been skipped forever, including after the secrets were set. The awkwardness it was working around is real, though: the demo is a compose file placed by hand at `/data/compose/demo` rather than a Portainer stack. That is worth fixing on the server, where Portainer's own webhook can make the demo hands-off with no key involved.
- **The wait-for-image job inspected a registry it never logged into.** It worked only because the package happens to be public right now; flipping it back to private would have failed with twenty minutes of "manifest unknown". It logs in first.


## v0.9.26 — [Released] The README is a landing page, not a manual (`main`, 2026-08-23 23:33)

### Changed
- **The README now leads with the pitch and the install, not the gallery.** For a self-hoster scrolling GitHub for something to run, the first screen is now: a centred title and one-line hook, a badge row of the stack (Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 15, Docker, PWA — the old "Built with" line, promoted and iconified), the wiki button, the live-site hero, and a demo call-to-action. **What it does** and **Quick start** move above the screenshots; the gallery is proof, shown after the ask.
- **The demo is now something you can click, not a footnote.** The small "The live site / demo instance" note under the hero becomes a centred call-to-action — "Can't wait to self-host? Bring up the demo instance →" — with the one sentence that makes it safe: a completely fictional wedding, ninety guests, a budget, a seating chart and a sixteen-day honeymoon, all loaded, nothing real.
- **The wiki link is a button now.** The old bold one-liner is a `for-the-badge` shield linking to the wiki, and the thirteen-row Documentation table is gone — the wiki's own Home page is that index, one click away, so the README stopped carrying a second copy of it.
- **A dead anchor was fixed on the way.** The Changelog screenshot caption linked `#versions-and-the-changelog`, an in-page anchor that no heading on the page satisfies (the section moved to the wiki in v0.9.5); it now points at the wiki page it means.
- The hero image and every screenshot are untouched — only their order and the framing around them changed.

- **The quick start pointed at the wrong compose file.** It said "nothing to build" and then ran `docker/docker-compose.yml`, which is the development stack and builds from source. It now runs `docker-compose.prod.yml`, which pulls the published image, and copies `.env.example` first — the stack will not start without a database password. This was wrong on `main` too, not something this branch introduced.

## v0.9.25 — [Released] The agent docs consolidate into AGENTS.md (`main`, 2026-08-23 23:20)

### Changed
- **CLAUDE.md, IMPLEMENTATION_PLAN.md and SEATING_CHART_PLAN.md become one file: AGENTS.md**, in the [agents.md](https://agents.md) open format — a single predictable place any coding agent (Claude Code, Codex, Cursor, Copilot, …) reads for the working agreements. CLAUDE.md is now a **symlink** to it, so tooling that looks for CLAUDE.md still finds the full document; nothing is duplicated and there is one file to keep true.
- **What was kept** is the living knowledge: the changelog-as-version-source rules (entry format, UTC stamping, the no-nested-backticks trap), init.sql as the only committed schema (including which tables are runtime-created by `financeDb.ts` / `honeymoonDb.ts` / the donations route), the `/api/photos/…` rule, the sacred image name, the auto-deploy loop, "document everything", setup and all nine check scripts, the deploy checklist, the SMTP env vars, architecture (storage strategy, auth, photo serving, Docker boot behaviour), code style, common tasks and debugging.
- **What was cut** was history, not knowledge: IMPLEMENTATION_PLAN.md described the project at inception (Next.js 14, `tailwind.config.js`, a `photos.json`-only photo workflow, an "admin dashboard" still listed as a future idea) and its "next steps" are all done; SEATING_CHART_PLAN.md is a finished plan (every phase shipped months ago) whose SQL had already drifted — the real schema gained `floor_plan_room` and `floor_plan_walls` and lives in `database/init.sql`, which the consolidated doc points at instead of re-quoting. What survives of the seating plan is one paragraph of still-true behaviour: React Flow canvas, a party being a guest with `plus_one_name` set, split parties flagged.
- `deploy.md`'s pointer from "CLAUDE.md → After Every Code Change" now points at AGENTS.md.


## v0.9.24 — [Released] Pushing to main is the deploy (`main`, 2026-08-23 23:09)

### Changed
- **The working agreement no longer says to build and push the image by hand.** With the *Wedding Planner* pipeline merged, a push to `main` publishes `latest`, `v<version>` and `sha-<short>` on its own in about three and a half minutes — so doing it locally as well meant two different builds of the same commit racing for the tag production pulls, and "which build is deployed" stopped having an answer. `CLAUDE.md` and `deploy.md` now say: push, then pull and redeploy in Portainer.
- **The manual build is kept, demoted to a fallback** — for Actions being down, or an image needed from a working tree that isn't pushed — with the warning that it overwrites what CI published. The knowledge is worth keeping; the habit is not.
- `gh run list --limit 1` / `gh run watch` are documented as the way to see what the pipeline is doing, since that is now the thing to check after a push instead of a local build log.

## v0.9.23 — [Released] The Docker files move into docker/ (`main`, 2026-08-23 22:40)

### Changed
- **The Docker files left the repository root.** The Dockerfile, the dev stack (docker-compose.yml), the production stack (docker-compose.prod.yml), the demo stack (docker-compose.demo.yml) and the env template (.env.example) now live in docker/, so the stack is one folder and the root is source code and docs.
- **The build command gains `-f docker/Dockerfile`.** The build context is still the repository root, so nothing inside the image changed — same stages, same COPY paths, same init.sql. deploy.md, CLAUDE.md and the README quick start all show the new command.
- **The stacks are run with `-f`.** From the root it is now `docker compose -f docker/docker-compose.yml up -d` (and likewise for the prod and demo files). Relative paths in a compose file resolve from the file's own directory, so the dev stack reaches the source tree with `..` — checked with `docker compose config` against the new layout.
- **The .env file moves with the stacks, once.** Compose reads .env from the compose file's directory, so once the stacks sit in docker/ a root .env would silently stop being read — every variable defaults to blank with only a warning, and the database then refuses to start without its user. .env.example now sits beside the stacks; an existing .env moves once with `mv .env docker/`.
- **The stacks pin their project names.** A compose file in docker/ would name its project after that directory — "docker" — which would look for docker_postgres_data and silently start a fresh, empty database instead of reusing the existing weddingwebsite_postgres_data. A top-level `name:` key keeps `weddingwebsite` for the dev and prod stacks, and `weddingdemo` for the demo stack (the flag `-p weddingdemo` used to supply).
- **.dockerignore stays at the root — that is where the builder reads it from**, because the build context has to remain the repository root for the Dockerfile's COPY instructions. Its "Docker files" section now excludes docker/ wholesale, which also keeps the env template out of the image.
## v0.9.22 — [Released] A Travel tab (`main`, 2026-08-23 21:43)

### Added
- **A Travel tab: every flight, boat, car, train and walk of the trip in one list**, in trip order, each with the day it leaves on, its real date, its times, the day it lands, and whether the map can draw it yet. Booking travel is its own afternoon — you sit down with six confirmation emails — and doing that through the itinerary meant opening six day cards.
- **Add a leg from there**: pick the day it leaves on, pick how you are travelling, press **+ Add leg**. It lands on that day's card in the itinerary at the same moment.
- Counts by mode at the top, so *"two flights and a boat"* is visible without reading the list.

### Changed
- **The legs are still on the itinerary, and still editable there.** This is a second *view* of the same rows, not a second store: the leg editor was lifted into its own module and both tabs render it over the same record, so an edit in either place is the same edit. Verified both directions — rename a leg's From on the Travel tab and the itinerary shows it; do it on the itinerary and the Travel tab shows it; delete it from either and it is gone from both.

## v0.9.21 — [Released] A flight can land on another day (`main`, 2026-08-23 21:36)

### Added
- **Travel legs can span days.** Every leg gets a **Lands** control — *same day*, *next day (+1)*, *two days later*, *three days later* — so a 23:40 departure arriving at 06:20 is finally expressible. Until now an overnight flight had to be entered as landing hours *before* it took off.
- **It is an offset, not a date.** A leg hangs off a day, and the days renumber whenever one is inserted or dragged; "one day after this one" survives that, "the 14th" does not.
- **The day it lands says so.** The departure day carries a **+1 day** badge and a line spelling the whole thing out — *"Leaves day 1 at 11:40 PM (Sat, Sep 12), lands day 2 at 6:20 AM (Sun, Sep 13)"* — and the arrival day, which would otherwise look like a free morning, gets *"Arrives 6:20 AM at DPS — the flight that left on day 1 at 11:40 PM"*.
- **Everywhere else too.** The calendar view marks the departure cell **+1d** and shows a ↓ arrival line on the day it lands; the print sheet prints both; the map's leg popup says how many days it takes; and the `.ics` export now writes `DTEND` on the arrival *date*, so an overnight flight imports as one event across midnight instead of one that ends before it began.

### Fixed
- `buildIcs` treated any end time not later than the start as a mistake and replaced it with a one-hour guess. That is right for a same-day event and wrong for a red-eye, so an event carrying an explicit end **date** now keeps its end time whatever the clock says. Eight new checks cover the arithmetic and five cover the export, including that a same-date `endDate` changes nothing.

## v0.9.20 — [Released] Wider photos in the ranking rows (`main`, 2026-08-23 20:03)

### Changed
- **The ranking photos are twice as wide — 288px instead of 144 — at the same 96px row height.** The rows are exactly as tall as they were; the picture just gets twice the area. It is a 3:1 window onto a 3:2 photo, so `object-cover` keeps the middle band and crops the sky and the floor, which is the part of a hotel picture worth looking at anyway.
- It steps back to 144px once the list column itself is under 42rem — drag the map wide enough and it gets there — because a 288px photo in a 360px column leaves nothing for the name.

## v0.9.19 — [Released] The ranking is on the pins too (`main`, 2026-08-23 19:58)

### Added
- **In the ranking view, each map pin carries its position** — #1 in the circle for your favourite, and so on down the list. The map becomes the same ordered list as the rows beside it, which is the point of having both on screen: you can see whether your top three are on the same side of the island. Labelled pins get a couple more pixels so the digits do not touch the ring.
- Only in that view. In the card view the rank is already on the card, and a number in every circle would be noise on a map whose job there is "where is *this* one".
- **A drag renumbers the pins with the rows**, immediately. The optimistic order moved up from the list into the tab so the two read from one source — two copies of "what order are these in" would have shown the list renumbered while the map sat stale for the length of a round trip.

## v0.9.18 — [Released] Ranking rows show a real photo (`main`, 2026-08-23 19:55)

### Changed
- **The photos in the ranking list are 144×96 instead of 56×40**, and they run flush from the top of their row to the bottom. The row has no vertical padding any more, so the photo is what sets its height and nothing frames it; it is 3:2 because that is the shape the listings' own images arrive in, so nothing is cropped out of proportion. Ranking hotels by a thumbnail you cannot see anything in was the wrong trade.
- A stay whose listing gave us no photo keeps the same footprint, so the names still line up down the list rather than stepping in and out. The corners are square, not rounded: a rounded corner touching the row's edge shows a notch of background behind it.

## v0.9.17 — [Released] Three columns of stays, and a divider to drag (`main`, 2026-08-23 19:46)

### Fixed
- **The stays cards were stuck at two columns however wide the window got.** Adding the map column had capped them at `lg:grid-cols-2`; they now go up to three.
- The cards answer to the width of **their own column** rather than the window's, which is the only thing that can be right once the divider moves: the same 1600px screen holds one column of cards or three depending on where you put it. One column under 42rem, two to 64rem, three above — measured on the list, not the viewport.

### Added
- **The divider between the list and the map drags**, left and right, with the same handle the map tab's split view uses — now shared rather than copied. The map is clamped so the list keeps 360px, arrow keys move a focused divider in 24px steps, and the width is remembered per browser. Below 1280px there is no divider: the map stacks under the list, where a 260px-wide map would have been no use to anybody.

## v0.9.16 — [Released] Rank the stays by dragging them (`main`, 2026-08-23 19:40)

### Added
- **A ranking for the stays shortlist, and a view for building it.** The **① Ranking** toggle turns the card grid into one column of thin rows — position, photo, name, address, rating, status, price aligned down the right — and you drag a row by its ⠿ handle to move it. First is #1. Ordering things is a job for a list: dragging inside a wrapping grid means moving a card three positions to shift it one.
- **The rank shows up in the card view too**, as a `#3` beside the name, and **My ranking** is a new option in the sort dropdown — so the order you built is visible and usable without switching views.
- **A drag lands under your hand and saves behind it.** The rows reorder optimistically and the ranking is written in one transaction; the optimistic order stops being used the moment the server agrees, so it never becomes a second source of truth. A drag that waits for a round trip before it lands feels broken.
- **Every drag ranks the whole shortlist**, not just the two rows that moved — otherwise the first drag leaves you with one ranked stay and a tail of nulls that sorts arbitrarily. For the same reason the ranking view ignores the rating filters and says so: ranking inside a filtered subset would renumber those rows 1..n and leave the hidden ones holding stale numbers. **Clear ranking** puts everything back to unranked.
- A new nullable `rank` column on `honeymoon_places`, applied by `init.sql` and mirrored at runtime, plus a `PATCH /places { rank: [ids] }` shape that writes it in one transaction. Deliberately **not** `sort_order`: that decides the order of the whole place library, and ranking six hotels must not reshuffle two hundred places. The API grew a nullable-int field kind for it, because the existing one falls back to `0` — a real position, and not the same thing as "no position".

## v0.9.15 — [Released] The stays shortlist gets a map, and pins stop eating clicks (`main`, 2026-08-23 19:31)

### Added
- **A map down the right-hand side of the Stays tab**, holding every stay that has a location and framing all of them. It re-frames when the set of stays changes — locating one, deleting another — but never on an ordinary edit, because the viewport is yours once you have panned it.
- **Click a stay's photo and its pin lights up**: bigger, ringed, raised above the others, and panned into view if it was off the edge — by the smallest amount that works, so a pin already on screen never moves. Click the photo again to let go. A stay with no photo gets a **◎ Show on the map** link instead, so the two are not different features.
- **Click a pin and its card comes to you**: scrolled to the middle of the list and ringed. If the current filter was hiding that stay the filter gives way — you asked for that one specifically, and doing nothing silently is the worst of the three options.
- The map is deliberately **not filtered** with the list: it answers "where are these, relative to each other", which a map that empties out when you tick 👍 Interested cannot. Filtering narrows the list; the map highlights. It also doesn't cluster — a "5" badge over Canggu would hide the very pin you clicked a photo to find.
- The photo now selects rather than opening the listing preview. **Preview** is still its own button on the card, and pointing at the map is the thing you do far more often.

### Fixed
- **Pins in the lower part of a map that ran past the bottom of the window silently did nothing when clicked.** Leaflet gives every marker a `tabIndex`; clicking a focusable element focuses it, and focusing something partly out of view makes the browser scroll it into view — which moved the pin out from under the cursor between mousedown and mouseup. The click event then landed on the nearest common ancestor, the map container, and the marker's own handler never ran. Markers are no longer focusable, which costs tab-to-a-pin on a map that regularly holds two hundred of them and buys back clicks that work. Found while building the stays map, but it was latent on the map tab too, on any window short enough.
- The stays map is sized to the window rather than to the space below the paste box, so the whole map is always on screen — and the browser test now asserts that, so a future layout change that reintroduces the overflow fails loudly instead of quietly breaking every pin below the fold.

## v0.9.14 — [Released] Travel legs know where they are, and the map draws them (`main`, 2026-08-23 19:10)

### Added
- **A travel leg's From and To can be looked up.** Each end gets a **Find** next to it, and the search goes out *with the leg's mode*: a flight's ends are looked up as airports, a boat's as ferry terminals, a train's as stations. That is what makes **DPS** resolve to Ngurah Rai International rather than — as Nominatim answers a bare three-letter code — a boundary in China. Several hits are offered as a list with their type and coordinates, since the second result for an airport code is regularly a hotel by the runway.
- **Finding a place does not overwrite what you typed.** `DPS → SIN` is the right label for a leg; *"Ngurah Rai International Airport, Jalan Cucak Rowo, Tuban, Denpasar, Badung, Bali, Indonesia"* is not. The lookup sets the pin and leaves the text alone — the exception being a pasted link, which is nobody's idea of a label. Each end shows its coordinates once found, with a **clear** to forget them.
- **Legs are drawn on the map as curved dashed arcs**, in the mode's own colour and dash, with the mode's icon at the top of the arc: a flight is a fine dotted bow in blue, a boat a longer dash in cyan, a car amber, a train violet, a walk a near-straight green stipple. They follow the 🗓 Itinerary overlay rather than having a toggle of their own — "show me the days" and "show me how I get between them" are one question — and the counts line says how many are drawn.
- **The curve is load-bearing, not decoration.** A straight line between two pins is exactly what a day route looks like, and two legs between the same pair of airports — out on the Monday, back on the Friday — would sit on top of each other and read as one. The bow is always to the same side of the direction of travel, so an outbound and a return separate themselves. A flight bows most, a walk barely at all: a hundred-metre stroll drawn as an arc would be a lie about the route.
- New columns on `honeymoon_travel` — `from_lat`, `from_lng`, `to_lat`, `to_lng`, all nullable, applied by `init.sql` and mirrored at runtime. A leg stays useful as *"DPS → SIN, 14:05"* long before anyone pins it; the map simply doesn't draw the ones it can't place. Twelve new checks in `npm run check:honeymoon` cover the arc maths — endpoints, curvature, that a return leg bows the other way, and that two points in the same place produce a line rather than NaN.

### Fixed
- Widening a lookup can find nothing at all — *"Sanur ferry terminal"* matches no such object while *"Sanur"* finds the place. The geocoder now retries the original query when the widened one comes back empty, so adding a word can never make somewhere un-findable.

## v0.9.13 — [Released] Mid tier (`main`, 2026-08-23 18:58)

### Added
- **A third rating — 😐 Mid tier — between 👍 Interested and 👎 Not interested**, on every stay card, with its own filter pill and count. Most of a shortlist is neither a yes nor a no, and forcing those into one or the other threw away the distinction you were trying to record. Clicking the active rating still clears it.
- Excursions get the same button and the same filter: the ratings are one shared vocabulary, and a rating you can set on one tab but not filter on another is a trap rather than a feature. The map's and Places' bulk **Rating** menus offer it too, so a lasso of also-rans can be marked in one go.
- `PlaceRating` is now `'yes' | 'mid' | 'no' | null`, and the database read-back whitelists the new value — the column is plain `TEXT`, so anything not a known rating still reads as "not judged yet" rather than reaching the UI.

## v0.9.12 — [Released] Stays land on the map, and the map flies there (`main`, 2026-08-23 18:48)

### Added
- **A booking link now gives up its address and its map pin.** `fetch-meta` reads the listing's JSON-LD — Booking.com publishes a `Hotel` block with a full postal address — plus the map centre it drops its own pin on, which is where the coordinates come from since their JSON-LD carries no `geo`. A pasted link therefore arrives on the shortlist already knowing where it is, and appears on the map immediately.
- **A `Get locations for N` button on the Stays tab** for the shortlist you already have: it walks every stay whose listing hasn't been asked yet, fills in the address and the pin, and reports how many it found. Stays with a location show it on the card (📍) and those without say **no pin**, so it is obvious which ones the map is still missing.
- Coordinates that come from a listing are marked **reviewed**, not "needs review". They are the listing's own location rather than a geocoder's guess at a name, so they belong on the map straight away instead of behind the map's unconfirmed filter — which would have made a lookup look like it did nothing.
- **The map flies rather than cuts.** Pressing a day's ◎ Map button, or ⤢ Fit, now animates from wherever the map is to where it is going, pulling back through wider zooms on the way and settling in — measured mid-flight zooming out to z4–8 before returning to z13. That arc is what tells you *where* you just went; a cut leaves you somewhere unrecognisable. Arriving at the page still frames instantly: nobody wants a second of animation every time they open the tab.

### Fixed
- The address builder no longer produces *"Strand, Westminster Borough, London, WC2R 0EU, United Kingdom, Greater London, UK"*. Booking's `streetAddress` is usually the whole address already; three or more comma-separated parts is the tell that it needs nothing appended.
- Only a JSON-LD node whose `@type` is a place is read. Booking.com also embeds **its own corporate address** — 82 rue Henri Farman, Issy-les-Moulineaux — in a trader-info block, and a naive scan for `address` finds that instead and pins every hotel in the Paris suburbs.

## v0.9.11 — [Released] Changing the trip dates no longer deletes days (`main`, 2026-08-23 18:35)

### Fixed
- **Shortening the trip's dates deleted the days that fell past the new end, and their stops and travel legs with them.** It asked first — but that is the wrong trade at any level of warning: dragging a date range is an ordinary, exploratory edit, and an hour of planning should not be one mis-drag and one reflexive OK away from gone. Setting the dates is now non-destructive in both directions. A 14-day trip re-dated to 6 days keeps all 14 days, their stops, legs and notes, and they take their new dates from the new start.
- Days that now fall past the end of the trip are **flagged in red instead of removed**: a rose ring and a line on each day card saying why, red cells in the calendar view, a banner at the top of the Itinerary, a note on the Settings card naming the days and saying *nothing was deleted*, and a red **N days past the end** in the portal header — a link, from every tab, to the itinerary that needs fixing. Move their stops onto earlier days, delete the days you don't want, or drag the range back out; the flags clear themselves the moment the dates cover the days again.

### Changed
- A **longer** range still builds the days it is missing, exactly as before — that half was never destructive and is the thing that makes the calendar worth dragging.
- `RangePlan.remove` is now `RangePlan.beyond`: the tail is named so the UI can flag it, not so a caller can delete it. New pure helpers `tripLength()` and `daysBeyondRange()` decide what is out of range, with seven checks over them in `npm run check:honeymoon` — including that a trip with no end date flags nothing.
- Settings' old *"you have 14 days planned for a 6-day trip, drag the range again to line them up"* note is gone; dragging the range no longer lines them up by deletion, so it said the wrong thing. The two real cases now speak for themselves: days past the end (red, with what to do), or a range longer than the days planned (amber, drag again to fill it in).

## v0.9.10 — [Released] The stays shortlist sorts (`main`, 2026-08-23 18:26)

### Added
- **A sort control on the Stays tab**, remembered per browser: **Recently added** (the default), **Price: low first**, **Name: A → Z**, and **Status: booked first**. It composes with the 👍/👎/unrated filters rather than replacing them.
- **Recently added, newest first, is the default** — a shortlist is worked from the top, and the listing you just pasted in is the one you want to look at. There is no `created_at` column and adding one now would stamp every existing stay with the same backfilled time; `id` is a serial, so descending id *is* insertion order, newest first — the same answer with no migration and no lie about old rows.
- **A stay with no price sorts last, not first.** A blank price is not "free", and floating the unpriced to the top of a cost sort buries the cheapest real option. Every sort falls back to the name, so equally-priced or equally-ranked stays keep a stable, readable order.
- Stays that are past **Idea** now show their status chip on the card. A shortlist whose state you cannot see makes the status sort look arbitrary; a chip on every card would have been noise, so it appears only once a stay is shortlisted or booked.

## v0.9.9 — [Released] Every day in the split view can fly the map to itself (`main`, 2026-08-23 18:12)

### Added
- **A ◎ Map button on every day in the map's split view.** It moves the map to that day's stops and, if the routes aren't already drawn, switches the itinerary overlay on — either half alone is only half an answer: a viewport that jumped somewhere without the line and the numbered order arrives as an anonymous cluster of pins.
- The other pins stay where they are. This moves the map, it does not filter it: losing the surrounding places would take away the context that makes *"is this stop miles from the others?"* answerable at a glance. Narrowing to one day is still what the day dropdown is for — and if that dropdown already has a day selected, the button points it at the day you clicked rather than flying to stops the filter has taken off the map.
- The button is **disabled on a day with nothing pinned**, and says so, rather than looking broken when the map doesn't move. It appears only where there is a map to move: the Itinerary tab proper never renders it.

### Changed
- `TripMap` takes a `fitPoints` prop — what the next fit should frame, or null for everything on screen. It is read through a ref, so setting a new target never re-frames on its own; only a bumped `fitSignal` does, which keeps the rule the map has always had: the viewport is yours once you have panned it. `⤢ Fit` and a change of country both clear the target, so they go back to framing the whole trip.

## v0.9.8 — [Released] Insert a day where you need it; the map's itinerary starts out of the way (`main`, 2026-08-23 18:06)

### Added
- **A day can be added before or after any other day**, from that day's `⋯` menu — *Add a day before day 4* / *Add a day after day 4*. Until now the only way to make a day was to append one to the end and drag it up the trip. The insert reuses the reorder the drag handle uses, so the trip renumbers around it and every following day's date shifts along; the days either side keep their stops, travel legs and notes.

### Changed
- **The map's itinerary overlay now opens minimised.** Pressing 🗓 asks for the routes *on the map*, and a panel that immediately covered the top-left corner of them was in the way of the thing it was describing. The corner keeps a **🗓 Itinerary · N days** button instead; clicking it opens the list of days and stops, and the panel has a — to put it back. Switching the overlay off and on starts collapsed again.
- Both the button and the panel sit at `left-14` rather than `left-3`, clear of Leaflet's zoom control — the panel used to cover the **+**, so you could not zoom in while reading the days.

## v0.9.7 — [Released] A place is editable from the day it is on (`main`, 2026-08-23 17:55)

### Added
- **A stop in the itinerary is now a way into the place it points at.** Click a stop's name — on the Itinerary tab, in the calendar's day card, or in the map's split-view column — and the full place editor opens: name, type, region, country, status, the pin on its own map, notes, address, source, price and links. Noticing a wrong address or a missing pin while reading a day no longer means leaving the day, finding the place again in the Places tab, and finding your way back.
- The same edit is on the stop's `⋯` menu as **Edit <place name>**, so it is discoverable rather than only hoverable, and the hovered name underlines to say it is clickable.
- **The day's Base gets a ✎ beside it** when one is set. The base is a place too — the hotel you booked and will want to put a confirmation number on — and it was the one place on the card with no way in.
- One editor per tab rather than one per row, so the same component works unchanged as the map's left-hand column: opening a place from the split view puts the dialog over the map, and saving refreshes the itinerary, the places column and the pins together.

### Changed
- Stops with no place behind them are untouched — a custom label is still edited inline where it sits, because there is no place to open.

## v0.9.6 — [Released] The map, the itinerary and the places at once (`main`, 2026-08-23 17:20)

### Added
- **A ⊞ Split button on the honeymoon map** that turns the map tab into all three planning tabs at once: the itinerary down the left in a single column, the place library down the right in a single column, and the map still holding the middle. It is for the part of planning you cannot do one tab at a time — putting a place on a day while looking at where it actually is, and seeing the day you just changed redraw on the map beside it.
- **Both dividers drag.** Grab the gutter either side of the map and any of the three columns can be given the room; each column is clamped against the other so the map can be squeezed down to 320px but never out of existence. Arrow keys move a focused divider in 24px steps, so it isn't mouse-only.
- Split state and both column widths are **remembered per browser** — how you like to lay out a screen is about your screen, not about the trip, so it is `localStorage` rather than a trip setting. Below 1024px the columns are suppressed and the map keeps the screen, whatever was last saved.
- The two side columns are **the real tabs, not summaries of them**: everything works in the panel exactly as it does on its own page — inline edits, drag-to-reorder days and stops, the overflow menus, bulk selection, the place editor. Each panel scrolls independently of the other and of the map, and carries a `Full tab ↗` link out to the whole page.

### Changed
- `ItineraryTab` and `PlacesTab` take a `panel` prop for the narrow rendering: days stack one-up whatever the window is doing (rather than the page's two- and three-column grid), the calendar view and print/export controls are dropped, and Places loses its five count cards — the portal header already carries those numbers — with the filters stacking two-up so the list keeps the height.
- Defaults are 400px for the itinerary and 340px for places: the widths at which a stop row shows a full place name instead of truncating it.

### Fixed
- **The map now watches its own box, not just the window.** Leaflet only ever invalidated its size on a window resize, so any layout change that moved the map's edges without moving the window's — dragging a divider, most obviously — painted the new space as grey tiles until something else forced a redraw. A `ResizeObserver` on the container fixes it for every case, including the panel-open animation.

## v0.9.5 — [Released] The README is a front page again; the rest is a wiki (`main`, 2026-08-17 19:40)

### Changed
- **The README went from 1,083 lines to 135.** It now carries what a front page is for: what the thing is, the screenshots, a quick start, and an index. Everything technical moved to the repository wiki — **15 pages**, split by what you would be trying to do rather than by where it happened to be written.
- **The move was mechanical, not retyped.** A script partitioned the README by section and wrote each to its page verbatim, shifting only heading levels, then checked that every substantive line of the old README exists in either the new one or a wiki page. Four lines did not survive by design: the old marketing intro, one anchor link that became a wiki URL, and two bare section headings that became pages.
- Pages: Installation, Deployment, The demo instance, Guests and RSVPs, Registry, Finances, Honeymoon portal, Content and settings, Features, Architecture, Versions and the changelog, Development, Troubleshooting, plus a Home index and a `_Sidebar` that GitHub renders on every page.
- **Cross-references were checked rather than assumed.** Every "see *X* below" was verified to still point within its own page, every wiki link resolves to a page that exists, and every page is reachable from both the README and the sidebar.

### Added
- **The Development page is new writing.** It was one line pointing at `CLAUDE.md`; it now covers running the app locally, all nine check scripts and what each actually catches, both seeds, and the four conventions most likely to trip someone up — the changelog as version source, `init.sql` as the only schema, `/api/photos/…` rather than `/photos/…`, and where the working agreements live.

## v0.9.4 — [Released] The live site is the README's first image (`main`, 2026-08-17 19:19)

### Changed
- **The image at the top of the README is now the live site** rather than the demo — Austin's own screenshot of the Heaven & Austin home page, resized to 1600px and encoded at 92KB (down from 1.2MB). The demo's home page moves into the Screenshots gallery beside Our Story, so nothing is orphaned, and the public-site section is now four tidy pairs instead of two pairs and a stray full-width shot.
- Tidied the `&nbsp;` left behind in the phone section after the mobile itinerary shot was removed — a separator with nothing left to separate. `docs/images/mobile-itinerary.jpg` is now unreferenced and kept on disk rather than deleted unasked.
- **The "everything here is fictional" note was corrected rather than left to lie.** It claimed every screenshot on the page came from the demo, which stopped being true the moment the hero changed; it now says the hero is the live site and scopes the fictional-data note to the gallery below it. A note like that is worth more than the screenshots it describes, and only while it is accurate.

## v0.9.3 — [Released] Screenshots in the README (`main`, 2026-08-17 19:08)

### Added
- **Nineteen screenshots in the README**, committed to `docs/images/` and referenced with relative paths — so they render on github.com, in clones and forks, in an editor's preview, and while the repo is private. A hero shot of the home page up top, then a **Screenshots** section grouped into the public site, the admin panel, the honeymoon portal and a phone, using two-column tables for side-by-side pairs and inline `<img width>` so nothing renders at 1400px. Every image carries alt text.
- They are all taken from the **demo instance**, so the couple, guests, budget and honeymoon in them are fictional and no real guest data is published. The README says so where a reader will see it.
- Captured at 1500×940 (620px for the phone shots), resized to 1400px and encoded as both palette-PNG and mozjpeg with the **smaller of the two kept** per image — JPEG won every time. **8.3MB → 1.9MB, 76% smaller**, largest file 216KB. Git keeps binaries forever, so this is worth doing once rather than regretting later.

### Fixed
- **Every afternoon stop in the itinerary read "03:30 PI".** The time input was `w-[5.5rem]`, which is not enough for `09:30 AM` plus Chromium's picker icon, so the browser silently clipped the last character. Widened to `6.75rem`. It had been wrong on screen the whole time and only became obvious when a screenshot of it was about to become the front page of the repository.

### Changed
- Screenshots are shot against the live demo by a script, so refreshing them is a re-run rather than nineteen manual captures. An emoji font had to be installed for the capturing browser — without one, `🖨 Print` and `🗓 Export` photograph as empty boxes and libel the product.

## v0.9.2 — [Released] A demo instance, and the image finally runs init.sql (`main`, 2026-08-17 17:08)

### Added
- **A demo instance with a fictional wedding in it**, for showing the site to someone without showing them the guest list. A separate stack — its own database, its own volumes, port 3001, admin password `demo` — sharing nothing with production but the image, which is why it is a stack rather than a "demo mode" inside the running site. `docker-compose.demo.yml` plus `npm run seed:demo`.
- **`src/lib/demoSeed.ts` — an entirely invented wedding, as filled-out as a real one.** Maya and Theo, married at a stone house outside Asheville; ninety guests with addresses, party members, dietary notes and flags; twenty-six RSVPs with messages; fourteen donations; a twenty-eight-line budget with payers, contributors and purchases; thirteen tables with a hundred-and-thirteen people seated; eleven FAQs, a seven-item schedule, twelve wedding-party members, eight timeline milestones; and a sixteen-day honeymoon in Portugal — eighty-three places across ten regions, fourteen guide notes, twelve to-dos. The guest list comes out of a **fixed-seed generator**, so re-seeding produces the same names and a screenshot taken today still matches tomorrow.
- Photographs are fetched from **Lorem Picsum with a fixed seed per file**, so the demo ships with real images rather than grey rectangles and the same run always yields the same pictures; `--no-photos` skips the download on a re-seed. The honeymoon's places are **real Portuguese landmarks with approximate coordinates**, because a map of invented points looks like a bug and a demo map wants to look like a map.
- `npm run seed:demo` is destructive and says so: it refuses to run without `--yes-wipe` and prints the database it is about to empty.

### Fixed
- **A fresh install came up with a partial schema, and had for a long time.** The Dockerfile built `init-db.sh` by pasting an **inline copy** of the schema into a shell script, and that copy had drifted a long way behind `database/init.sql` — it created three tables with their original columns and nothing else. `init.sql` was never copied into the image and never ran. Everything added since (seating, donations, the finance suite, the honeymoon portal, and six of `guest_list`'s columns) only appeared when its own API route was first called, so a long-running install never noticed while a brand-new one was broken in ways that depended on which page you opened first. **The image now copies `init.sql` and runs it**, as a single query because its `DO $$ … $$` blocks cannot survive being split on semicolons, and it is idempotent so it is safe on every boot. Verified against a genuinely empty database: 17 tables and a complete `guest_list` on first start, where before there were 3. Found because the new demo instance is the first fresh install this project has had in months.
- `database/init.sql` gained the pieces it was missing against production: `guest_list.flag`, `guest_list.relationship`, `wip_toggles.is_hidden` and the whole `donations` table, each mirroring the runtime statement that had been the only copy.
- Production was redeployed onto this and its data checked before and after — 91 guests, 23 RSVPs, 207 places, 133 seat assignments, unchanged. The one data-touching migration in `init.sql` was confirmed to match **zero** rows there first, and a dump was taken before the swap.

## v0.9.1 — [Released] Versioned changelog, and Jarvis's viewer for it (`main`, 2026-08-17 16:10)

### Added
- **Every release now carries a version, and the changelog is the source of truth for it.** All sixteen historical entries are stamped `## vX.Y.Z — [Released] <title> (date)`, oldest first: `v0.1.0` is the initial launch, same-day sessions take a patch (`v0.3.0`–`v0.3.4` are the five 2026-05-25 releases), separate days take a minor, and the honeymoon-portal release is `v0.9.0`. The convention, the bump rules and the UTC stamping are written at the top of the file. **There is no version in `package.json` to keep in step** — the topmost heading *is* the app's version, which is the convention Jarvis uses. One ordering fix came with it: a stray `## [2026-05-25]` entry sat below *Initial launch*, breaking newest-first, and now sits with the rest of its day.
- **The changelog viewer is Jarvis's, carried over class-for-class** (`/admin/changelog`): a sticky version nav down the left — version, Released/Unreleased pill and title per item — beside a reading pane of cards, each with a version pill, a tag pill, its date, and `Added`/`Changed`/`Fixed` rendered as coloured badges. A **scrollspy** highlights the version you are reading and scrolls the *nav* to keep it visible, never the pane. Clicking a version jumps to it. Inter for titles and DM Mono for versions, loaded lazily so the font request belongs to this view rather than the whole panel. The nav hides below a 640px **container** width, not viewport width, because the admin sidebar eats 256px of the window and the pane is what matters. Only the palette is translated: Jarvis's `--primary` is this site's accent, its `--card` white, its `--border` grey-200.
- **The button beside "Admin Panel" is the version.** It reads `v0.9.1` in DM Mono rather than an icon, so the panel says which build you are looking at without opening anything, and it links to the viewer. The unread dot compares the newest version against `localStorage`, so it appears on a deploy and clears when you open it. Before the version has loaded the button shows `···` rather than inventing a number.

### Changed
- The changelog is a **page**, not a dialog — two columns and a scrollspy need the width, and this is something you read rather than dismiss. `/admin/changelog` joins seating and honeymoon as full-bleed so it owns its own scrolling, which its scrollspy needs a named root for.
- `GET /api/admin/changelog?latest=1` now answers with the version and its tag, which is all the button needs.

## v0.9.0 — [Released] Honeymoon portal, dashboard insights, mailing-list export and PWA install (2026-08-17)

### Added
- **Honeymoon portal (`/admin/honeymoon`)** — a private planning tool for the Bali + Singapore trip. Admin-only by design: no public route, no WIP toggle, nothing guest-facing. Five tabs: **Map**, **Itinerary**, **Places**, **Guide**, **Settings**.

  **Map** uses Leaflet with OpenStreetMap raster tiles (no API key, no billing) and always fits the view to whatever is currently showing — unfiltered it frames Singapore and Bali together, filtered to a region it zooms to that island, and selecting a day zooms to that day's stops and draws the numbered route between them. Pins are **clustered** (`leaflet.markercluster`) — browser testing showed the fit-all view collapsing 118 pins into two unreadable blobs over Singapore and Denpasar, so clusters show counts that split as you zoom; clustering is disabled while a day's route is drawn, where merging consecutive stops would hide the ordering the route exists to show. Pins are `divIcon`s coloured by category rather than image markers, which sidesteps Leaflet's broken-default-icon problem under bundlers and keeps seventeen category colours out of the asset pipeline. Leaflet is loaded via `next/dynamic` with `ssr: false` and imported inside an effect, because it touches `window` at module load and the page is still server-rendered for its initial HTML.

  **Itinerary** models a day as a *base* (where you sleep), optional *travel legs* (flight/boat/car/train/walk, with times and a confirmation ref), and an ordered list of *stops* reordered by drag (`@dnd-kit`, already used by the photos admin). Times are optional per stop — set them for the flight and the dinner booking, leave them blank for "waterfall sometime in the morning." Between consecutive pinned stops the portal shows the **straight-line distance** and warns above 40 km in a single hop. This is explicitly not driving time; on Bali's single-lane roads the real journey is often twice that, so the number exists to catch a day pairing a Canggu beach club with a North Bali waterfall, not to promise an ETA.

  **Days are numbered, not dated.** `start_date` is nullable, and a day's real date is derived as `start_date + (day_number - 1)`. Leave it blank to plan in relative days; set it and every day picks up its calendar date and weekday. The arithmetic runs on UTC parts on purpose — `new Date('2026-09-01')` parses as UTC midnight, and adding days in local time would slide the date backwards for anyone west of Greenwich.

  **Places** is the candidate library, built to stay usable at a few hundred rows: search plus filters for region, category, status, *needs review* and *not pinned*, with multi-select for bulk status changes. Every place carries a status (**idea → shortlisted → booked**), and scheduling one onto a day is what promotes it.

  **Coordinates can be entered three ways**, all through one box: a name to forward-geocode (Nominatim, proxied server-side because their policy requires an identifying User-Agent a browser can't set), a **Google Maps link** pasted straight in, or raw `lat, lng`. URL parsing prefers the `!3d/!4d` pin over the `@` map centre, since the centre is offset whenever a side panel is open, and follows `maps.app.goo.gl` short links.

  **Guide** holds the half of the travel guide that has no coordinates — the tap-water warning, the rupiah rate, Grab vs. Gojek, the helmet law, the Ubud and Canggu write-ups. Trip-wide notes become titled cards grouped by category; area prose becomes an editable description on each region.

- **Bali guide seeded as data** — the supplied travel guide is extracted into `src/lib/honeymoonSeed.ts` as **7 regions, 224 places and 12 Know Before You Go notes**, loaded by `npm run seed:honeymoon`. Coordinates were harvested ahead of time by `scripts/harvest-honeymoon-coords.mts` and committed to `src/lib/honeymoonCoords.ts`, so seeding a production database is instant and needs no network — a four-minute rate-limited crawl against a third-party service is a bad thing for a deploy step to depend on. The original document is kept verbatim at `docs/honeymoon/bali-guide.md` so the seed stays auditable.

  **Every seeded pin is written `needs_review = true`.** A geocoder returns *a* result for a name it only half-recognises, and this guide contains waterfalls sharing names across regions (Campuhan, Tukad Cepung and Yeh Bulan each appear under two headings). Unconfirmed pins draw with a dashed amber ring and are filterable in both Map and Places; confirming one by hand clears the flag. Harvesting also rejects any hit outside a Bali/Singapore bounding box, because a bare business name like "Nook" or "Vault" otherwise resolves to England or Texas and would wreck the map's `fitBounds`.

  The seed is **idempotent and non-destructive** — it matches on place name and skips anything present, so re-running never reverts an admin edit. Verified against a live database: a hand-edited row survived a re-run untouched.

- **Referential integrity chosen so the itinerary can't grow holes** — `honeymoon_stops.place_id` is nullable with `ON DELETE SET NULL`, so deleting a place demotes its scheduled stops to plain text rather than deleting them; a day's `base_place_id` clears the same way. Deleting a *day* cascades its stops and travel legs. Both paths verified against a live database.

- **Honeymoon portal — personal additions to the seeded guide.** Driver contacts (`contact@thebalidriver.com`, `poetoealit@yahoo.com`) and the advice to work through your driver for temple and event entry become a **Driver contacts** note. The Ubud day — Monkey Forest, down Jl. Monkey Forest Road via Bali Zen, left at Jl. Raya Ubud to Cafe Lotus past the Starbucks, then the Art Market and Palace — becomes an **Itinerary ideas** note rather than a pre-built day, since it shouldn't presume where it lands in the trip. Seven new places: Hard Rock Hotel Bali, Courtyard by Marriott Bali Seminyak, Beachwalk Shopping Center, Chez Monique Jewelry (with its website), Bali Zen, Cafe Lotus and Ubud Palace. Tegalalang now mentions the swings.

  `SeedPlace` gained an optional `links` field so a seeded place can carry its website, and the harvest script is now **incremental** — names already in `honeymoonCoords.ts` are kept and skipped, so adding a handful of places costs a handful of lookups instead of a full re-crawl, while previously-missed names are retried.

  Multi-line note bodies now **grow to fit** in the Guide tab; a numbered route was previously trapped in a three-row scrollbox.

- **Honeymoon portal — the place editor now shows the pin on a map.** Confirming a bulk-geocoded pin previously meant clicking "Looks right" about a coordinate you couldn't see, which is a coin flip. The Location card now renders a map of the current pin as soon as one exists, and the marker is **draggable with click-to-move** — the usual geocoder failure is right-street-wrong-side, and nudging beats going back to Google Maps for coordinates. Moving the pin by hand clears `needs_review` on its own, since placing it *is* the confirmation. A place with no pin gets a short explanation instead of an empty box.

  Built as its own `PinMap` rather than reusing `TripMap`: that component exists to frame a whole set of pins and owns its viewport via `fitBounds`, so sharing it would have meant bolting a "unless there's only one" branch onto every effect in it. Wheel-zoom is off because the editor lives in a scrollable modal and would otherwise swallow the page scroll whenever the cursor crossed the map.

  Browser testing caught a crash this introduced: the deferred `invalidateSize()` calls that stop the map rendering grey inside a still-animating modal kept firing *after* the modal closed and the map was destroyed, throwing on `_leaflet_pos`. The timer handles are now cleared on unmount, alongside `map.stop()` and a connected-container guard before any animated move.

- **Honeymoon portal — provenance on every suggestion, and bulk delete.** Places and guide notes now record **who suggested them**, so batches from different people stay tellable apart: the bundled data splits into *YouTube Travel Guide* (224 places, 12 notes) and *Amy's Suggestions* (7 places, 2 notes), with anything hand-added defaulting to *Added by me*. Filterable on both the Places and Map tabs, shown inline on each row and note, and editable per place.

  `source` changed from a `'guide' | 'manual'` enum to a **free-text label**. It stopped being enough the moment a second batch arrived from a different person, and an enum would mean a code change for every future list. The filter options are built from the values actually present rather than a hardcoded set, so a new label becomes a filter on its own. Legacy `guide`/`manual` values still in a database are normalised on read — and, importantly, collapse to the *same* filter option as their modern equivalent rather than doubling it, which a regression test pins.

  The bulk bar gained **Delete**, backed by a new `?ids=1,2,3` form on the DELETE endpoint that removes a selection in one statement instead of N requests and N refetches. If any of the selection is on the itinerary, the confirmation says how many and that their stops survive as plain text.

  `npm run seed:honeymoon -- --relabel-sources` backfills provenance onto rows that predate the labels, touching only rows still holding a legacy value so a label set by hand is never overwritten.

- **Honeymoon map — full-bleed layout and lasso select.** The map tab now fills the entire content area instead of a centred `max-w-5xl` column, and nothing on the tab scrolls: the shell treats `/admin/honeymoon` as full-bleed (the same treatment the seating chart already had), the filter row is pinned above, and the legend, selected-place card and lasso actions float over the map rather than stealing height from it. Every other tab keeps its readable centred column and scrolls as before.

  **Lasso select**: arm ◯ Lasso select and drag to draw a freehand loop; everything inside is selected and ringed, and a floating bar offers the same verbs as the Places tab — set status, mark reviewed, delete, clear. Shift/Ctrl/Cmd while drawing adds to the selection instead of replacing it. Clustering is suspended while armed, because drawing around pins hidden inside a count badge is meaningless. Unpinned places can never be lassoed, so they cannot be swept into a bulk delete. Containment is ray-cast point-in-polygon with the vertex test deliberately asymmetric so a pin sitting exactly on the drawn line doesn't flicker in and out; concave loops are handled, pinned by a C-shaped test case.

  Bound to container pointer events rather than Leaflet's mouse events so it works with a finger, and so the drag is swallowed before Leaflet's pan handler sees it. The path is thinned as it's drawn — every pixel-level move would build a polygon of thousands of vertices.

  **Bug found by browser testing, worth remembering: never let React re-render a Leaflet container's `className`.** Making the class depend on `selectMode` (to show a crosshair cursor) meant React rewrote the whole class attribute on toggle, silently stripping the `leaflet-container` / `leaflet-touch` classes Leaflet had added imperatively — so arming the lasso broke the map. The container's className is now static and anything dynamic goes through inline `style`.

- **Honeymoon map — unconfirmed pins are hidden.** A bulk-geocoded guess draws exactly like a real location, so the map now shows only confirmed pins. The **⚠ Unconfirmed** toggle flips to showing *only* the unconfirmed ones, matching how the review job actually goes: see them, lasso the good ones, Mark reviewed.

  The hiding is never silent — the count line reads *"12 pinned · 114 unconfirmed hidden"*, and if nothing confirmed remains the empty state explains why and how to get at them, rather than looking broken. A place scheduled on a day still appears in that day's view whatever its review state, because hiding a stop you deliberately planned would tear a hole in its route.

- **Honeymoon map — the lasso action bar sizes to its contents.** It was a fixed-width row with `overflow-x-auto`, so it scrolled sideways instead of simply being the right size. Now `w-max`, no overflow, wrapping rather than scrolling on a narrow screen. The status dropdown was reusing `SelectField`, which is `w-full` by design because it lives in form grids — inside a floating toolbar that made it four times wider than its longest option. New `MiniSelect` primitive sizes to content, and the options are abbreviated because a native select is sized by its widest one. 144px → 88px.

- **Honeymoon — add a place from the map, and let a Maps link fill itself in.** **+ Add place** now sits on the Map tab as well as Places, so adding somewhere doesn't mean leaving the map.

  A pasted **or dropped** Google Maps link now resolves on arrival — no pressing Find — and fills the **name** (from the link's `/place/` segment, with the trailing address trimmed off), the **address** (reverse-geocoded from the coordinates via Nominatim, so it's a real address rather than a URL slug), the **pin**, and keeps the **link itself** on the place as a Google Maps entry. Previously a pasted link gave you coordinates and nothing else, leaving three fields to retype from something you'd already handed over. Existing values are never clobbered — it only fills blanks — and pasting the same link twice doesn't stack duplicate links.

  Also fixes the pin preview rendering half a screen of grey tiles: the fixed `invalidateSize()` timers only covered the modal's open animation, but the modal reflows again when the paste fills the name and address. A `ResizeObserver` on the container now covers every reflow.

- **Honeymoon — every tab uses the full window width.** Itinerary, Places, Guide and Settings drop the centred `max-w-5xl` column that the map had already left behind. They still scroll inside their own container, so the heading and tab bar stay put.

  Stretching a single column to 1600px is not the same as using the screen — a stop row with its time, name and actions a screen apart reads worse, not better. So the tabs that would suffer lay out in responsive columns instead: **Itinerary** shows days two abreast at `lg` and three at `2xl`, **Guide** does the same for regions and for notes within each category, and **Settings** puts its cards side by side while keeping the inputs a sane width.

  Narrower columns exposed a real bug in the auto-growing note textarea: it estimated height from characters-per-line, which was tuned for one wide column, so the same text wrapped to more lines than predicted and notes ended mid-sentence inside a scrollbox. It now **measures its own `scrollHeight`** instead of estimating, with a `ResizeObserver` to re-measure when the column width changes.

- **Honeymoon — Stays tab for shortlisting accommodation.** Paste or drop **Booking.com links, one per line or several at once**, and each becomes a candidate stay. Rate them **👍 Interested / 👎 Not interested** (clicking the active rating clears it), filter by rating, edit price and notes inline, and **Preview** the listing in a popup without leaving the portal. Stays are ordinary places with category `stay`, so anything already in the library shows up here and a shortlisted stay can still be a day's base on the Itinerary.

  New nullable `honeymoon_places.rating` column, deliberately `text` rather than an enum: an enum coerces an unknown value to a fallback, and clearing a rating back to *unrated* has to survive as NULL rather than snapping to 'yes'.

  **Two limits, both established by testing rather than assumed:**
  - Booking.com answers server-side fetches with a **202 bot challenge** — no OG tags, so the existing `fetch-meta` route can't pull a title, photo or price. The name is derived from the URL slug instead (`/hotel/id/hard-rock-bali.en-gb.html` → *Hard Rock Bali*, locale suffix stripped, numeric-only slugs rejected as ids rather than names).
  - Booking.com sends `frame-ancestors 'none'` **in report-only mode**, so the popup works today but is one config flip from breaking. The frame is treated as best-effort: if it hasn't loaded after six seconds the popup explains and offers the link, and *Open in a tab* is always present. The frame is sandboxed without `allow-same-origin`.

  **No Booking.com favourites import.** There is no public API for a user's wishlist, and the alternative — holding the account password and scraping the logged-in session — is not something this app should do. Bulk paste covers the same ground.

- **Honeymoon Stays — listings now show their own photo.** Adding a booking link pulls the listing's Open Graph image and title, so a shortlist reads as a wall of hotel photos rather than a list of URLs. Stays added before this get a **Get photos for N** backfill button.

  This reverses an earlier conclusion, and the correction is worth recording: the previous build reported that Booking.com couldn't be scraped, based on a plain browser user-agent getting a 202 bot challenge with no metadata. That was true but incomplete — **Booking.com serves the full Open Graph block to link-preview crawlers** (`facebookexternalhit`, `WhatsApp` → HTTP 200 with title and image; Twitterbot, Slackbot and Discordbot still get the challenge). Those tags exist precisely so links unfurl. `/api/admin/fetch-meta` now tries a normal browser agent first and falls back to a preview crawler only when the first attempt yields no metadata — which also helps the registry against any site that behaves the same way. Airbnb gives crawlers nothing, so those still fall back to the URL slug.

  The listing's own title beats the slug for naming — *Hard Rock Hotel Bali* rather than *Hard Rock Bali* — after trimming the town and the "(updated prices 2026)" suffix Booking appends.

  **Fixes a pre-existing bug in the shared metadata fetcher**: `extractMeta` decoded HTML entities in the title and description but not the image URL, so any multi-parameter image arrived with a literal `&amp;` in its query string, turning `&o=` into a bogus `amp;o` parameter. Entity decoding is now one shared helper applied to all three fields. This affected the registry too.

  New nullable `honeymoon_places.image_url`. Images are hot-linked from the listing's CDN with `referrerPolicy="no-referrer"` and hidden on error, so an expired signed URL degrades to a card without a photo rather than a broken icon.

- **Honeymoon Stays — nightly prices format themselves.** Typing `250` into a stay's price field and pressing Enter stores **$250 per night**; `1200` becomes **$1,200 per night**. The symbol follows the trip's `home_currency`, falling back to the currency code for anything without a known symbol.

  Deliberately conservative: anything that isn't a plain number is returned exactly as typed, because price notes elsewhere in the library read like *~500k IDR entry* and rewriting those as dollars would be worse than leaving them alone. Ranges (`250-300`) and foreign symbols (`€200`) are left untouched for the same reason.

  The formatter is **idempotent**, which matters because the field commits on blur as well as on Enter — without that, tabbing through an already-formatted value would compound it into `$$250 per night per night`. A regression test runs it over its own output three times.

- **Honeymoon — custom categories and regions, plus Beach, Hiking and Nature.** Both dropdowns in the place editor end with **＋ Custom…**: pick it, type the name, press Enter. A custom category is used immediately; a custom region is created as a real region row (so it can carry a Guide write-up) and an existing region with the same name is reused rather than duplicated.

  `category` changed from a fixed enum to **free text**, the same move `source` needed earlier — an enum would silently coerce anything typed to `misc`. A blank category is floored to `misc` server-side on every write path, since text coercion turns `''` into NULL and a null category would break the map's colour lookup and every filter.

  `categoryMeta()` no longer collapses an unknown key into "Other": a custom category keeps its own name and gets a **stable colour derived from that name**, so it reads correctly in the map legend and doesn't change on reload. Filter dropdowns and the legend now list built-ins plus whichever custom categories are actually in use.

  Three new built-ins: **Beach**, **Hiking**, **Nature**.

- **Honeymoon map — the unconfirmed toggle now adds instead of swapping.** It previously replaced the confirmed pins with the unconfirmed ones, which meant losing every landmark you were using for orientation at exactly the moment you needed it. **⚠ Show unconfirmed** now layers them on top of the confirmed set, and **⚠ Hide unconfirmed** takes them away again. The button label states which way the next click goes, and the count line reads *"including N unconfirmed"* while they're on.

- **Honeymoon — categories and regions are editable, and the lasso feeds the itinerary.**

  **Categories became rows.** They were a hardcoded constant, which made "edit and remove" impossible; a `honeymoon_categories` table is now seeded from that constant on first run, after which the database is the truth and re-seeding never overwrites an edit. Both dropdowns gained **✎ Edit / remove…**, opening a list with a usage count per entry. Renaming changes only the label — the key is immutable, so nothing gets unfiled. Deleting a category **moves its places to Other** instead of orphaning them, mirroring the itinerary's rule that a delete never destroys rows; *Other* itself is refused, since it's the fallback. Deleting a region keeps its places and clears their region.

  Every colour and label lookup now consults the stored list. Threading it through every marker, chip and legend would have meant a prop in six components, so the data hook publishes a registry that `categoryMeta` reads — set from an async callback, never during render, with one hook instance on the page.

  **Lasso → Add to day…** puts every selected place onto a day as stops, skipping any already there. Drawing a loop round a neighbourhood and sending it to Tuesday is the point of selecting on a map; without it you'd re-find each place by name in the itinerary dropdown.

  **Selects are no longer native chrome.** `appearance-none` plus a background-SVG chevron, so they keep the same rounded shape as every other field while staying real `<select>`s — native picker on mobile, keyboard support for free. The toolbar select now shares Button's padding, text size, border and radius, so a row of pills is uniform rather than one slightly smaller odd one out.

- **Honeymoon — real URLs per tab, a map that keeps your view, a saved country filter, scoped type list, and an itinerary overlay.**

  **Every tab is a route now** (`/admin/honeymoon`, `/itinerary`, `/places`, `/stays`, `/guide`, `/settings`). They were local state, so a refresh always dumped you back on the map. A layout owns the data hook and hands it down through context, so six routes still share one payload rather than refetching per navigation.

  **The map no longer re-frames itself when you change what's drawn.** Fitting was previously keyed off the filters, so toggling a layer threw away the view you'd lined up — infuriating mid-task. `fitKey` became `fitSignal`: the map fits on arrival and when **⤢ Fit** is pressed, and otherwise the viewport belongs to whoever is panning it. This does mean region and day filters no longer auto-zoom either, which is why Fit exists.

  **Country is persisted on the trip** (`honeymoon_trip.focus_country`), not in the browser — it's a decision about the trip, so it survives refreshes, logins and devices. A place with no region is hidden while a country is set, rather than guessed at.

  **The type dropdown lists only types present on the map**, computed from the filtered set *excluding* the category filter itself — otherwise picking a type would collapse the list to that one option. The count is in the label.

  **🗓 Show itinerary** overlays every day at once, each in its own colour with numbered badges, plus a panel listing each day's stops in order with numbers matching the badges. `TripMap` took a single `route`; it now takes `routes[]`.

- **Honeymoon — Excursions tab.** Tours, classes, dives, day trips. Paste or drop **any link**, not just booking sites; name and photo come from the page's Open Graph tags where offered, falling back to the URL's own slug (and then its hostname) so an entry is always recognisable rather than "Untitled". Each card carries **what it is** (the shared category list, custom entries included), **cost**, notes, a 👍/👎 rating and a preview popup.

  Excursions are ordinary places carrying a new `is_excursion` flag, so one can still be pinned on the map and dropped onto a day. The flag is **separate from the category on purpose**: what an excursion *is* varies wildly, and that is exactly the field you want free — tying the tab to a single category would drop anything you re-typed.

  `formatPrice` is deliberately unit-less, unlike the nightly-rate formatter: an excursion might be per person, per couple or per boat, so `120` becomes `$120` and `120 per person` is left exactly as typed rather than having a unit invented for it.

  The listing-preview popup moved out of the Stays tab into a shared `LinkPreview` rather than being copied.

- **Honeymoon map — fixes "failed to update trip" when clearing the country, and re-frames on a country switch.**

  Selecting *All countries* sends an empty string, and text coercion turns an empty string into NULL — but `focus_country` is `NOT NULL`, so clearing the filter failed against the constraint every time. Text nulling out when cleared is right for an optional note and wrong for a NOT NULL column whose empty value is meaningful, so `Field` gained `blankAsEmpty` for exactly that case.

  **Switching country now moves the map** to that country's pins, and clearing back to all countries frames everything. Country is the one filter that is a change of *destination* rather than of what is drawn — switching to Singapore while zoomed on Bali showed an empty sea. Layer toggles still leave the viewport alone, which a regression test pins alongside this.

- **Honeymoon — Dashboard landing page.** The whole trip on one screen, and now the first tab: headline stats (days, countdown to departure, places, pins to review, stays, excursions), the itinerary with each day's stops and empty days flagged, a **Needs attention** list, a rough cost, the shortlist, and a planning-progress bar. The map moved to `/admin/honeymoon/map`.

  Deliberately a read-out rather than another editor — it answers "where are we up to and what needs doing", then sends you to the tab that does the work. **Every number is a link**, because a count you can't act on is trivia.

  The cost figure is honest about its limits: `priceValue` returns null rather than zero for anything without a plain number, so "ask at the desk" is reported as *1 without a price* instead of being quietly counted as free. The card states that it ignores nights and headcount and is a sense of scale, not a budget.

- **Honeymoon — To Do checklist, a map-filter bug fix, and three-way filters.**

  **New To Do tab** (`/admin/honeymoon/checklist`): items with an optional group, tick-off, due dates, drag-to-reorder and a hide-done toggle, backed by a new `honeymoon_todos` table. Groups are free text with earlier ones offered as you type — a fixed set of categories would be wrong for someone else's trip. Outstanding items surface on the dashboard.

  **Fixed: pins missing from the map.** Reported as "says five pinned, should be seven or eight". Production had **ten** confirmed pins; five were being hidden by the Indonesia country filter. Two belonged to regions created through *＋ Custom…*, which only ever sent a name — so they were stored with an empty country and excluded by every country filter — and one place had no region at all. The filter now excludes only places known to be in a **different** country: an unknown country keeps a place visible, and the status line reports how many need classifying. A filter that silently drops unclassified data hides exactly what you need to see to fix it.

  Two supporting fixes so it can't recur: a region created while a country filter is active **inherits that country**, and a region's country is now **editable on the Guide tab**, where regions without one are called out.

  **Three-way filters on the Places tab.** *Review* cycles any → needs review → already reviewed, and *Pin* cycles any → not pinned → pinned. A two-state filter could only ever ask one of the two questions — there was no way to ask "what have I already reviewed". Each label states which of the three you're looking at rather than making you infer it from a colour, and a regression test asserts the two active states are exact complements.

- **Honeymoon dashboard — an overview map, and a re-laid-out top row.** The headline stats now sit top-left with a **small map beside them on the right**, and **Needs attention** moved down a row to make the space. The map shows everything pinned, honours the trip's country filter with the same rule as the map page (exclude only what's known to be somewhere else), and links through to the full map.

  It shows unconfirmed pins as well as confirmed ones — they already draw with a dashed ring, and an overview that hid most of the trip would misrepresent it.

- **Honeymoon — dashboard fits the window, map controls fit one row, and ticking a to-do asks what happened.**

  **The dashboard now fills the viewport with no scrollbar and no dead space**, verified at 1920×1080, 1600×1000, 1440×900 and 1280×800. Two flexible bands plus a thin footer; every card owns its overflow so a long itinerary or shortlist scrolls *inside its card* rather than pushing the page taller. A `min-h` floor is the honest limit — at 1100×600 nothing could fit, so it scrolls instead of crushing the content.

  **The dashboard map shows confirmed pins only**, and now draws **the itinerary** over them, each day in its own colour with numbered stops. It previously included unconfirmed pins; an overview built from guesses is worse than a smaller honest one, and the caption states how many are hidden.

  **All eleven map-page controls now sit on one row.** A fixed grid wrapped Add place and Lasso onto a second line; the bar is now a flex row where the six selects shrink and the five buttons keep their size, with shorter labels to match.

  **Ticking a to-do prompts for a result** — booking reference, outcome, whatever is worth keeping. Stored on the item and shown beneath it, click to edit. The tick is saved *before* the prompt opens, so dismissing it leaves the item done rather than silently undoing the click; that is why the dismiss button says Skip rather than Cancel. Un-ticking doesn't prompt: that's a correction, not an outcome.

- **Honeymoon map — the place detail card moved to the top-right.** It was bottom-right. Top-right keeps it clear of the legend (bottom-left) and the itinerary panel (top-left), and off the pin you just clicked. It is also height-capped now, so a long description scrolls inside the card rather than running off the bottom of the map.

- **Honeymoon itinerary — days can be dragged to reorder.** Drag a day by its handle and the trip renumbers: move day 3 above day 1 and it becomes day 1, with its dates and its stops following. Stops hang off `day_id`, so they travel with their day rather than staying put.

  `day_number` is `UNIQUE`, so assigning the new numbers directly would collide the moment two days swap. Every affected row is parked on `-id` first — unique and negative, so nothing can clash — then given its final number, all inside one transaction.

  Days get their own drag handle in the card header rather than the whole card being draggable, so a day drag can't fight the stop handles or the inline text fields inside it, and the day sensor needs a slightly longer press than the stop sensor for the same reason.

- **Fixed: dialogs closing when a drag ended outside them.** Selecting text in a field and releasing the mouse past the edge of the dialog shut it and threw away what you had typed. A `click` event fires on the **common ancestor** of where the pointer went down and where it came up — drag from inside a dialog to outside and that ancestor is the backdrop, so the release read as a backdrop click.

  The shared `Modal` now records whether the press *started* on the backdrop and only closes when it did. Releasing outside is not clicking outside. This covers every dialog in the honeymoon portal — the place editor, the category and region manager, the listing preview and the to-do result prompt — since they all use the one component.

  Confirmed the regression test catches it: with the fix reverted, the drag-out case fails.

- **`npm run check:honeymoon`** — 44 assertions over the pure logic that would otherwise fail silently and wrongly: great-circle distances against known city pairs, day-number arithmetic across a month boundary, 12-hour time formatting at noon and midnight, Google Maps URL parsing in all three shapes, rejection of null island and out-of-range latitudes, hop calculation across unpinned and deleted stops, and seed-data integrity (no duplicate names, no orphan regions, no unknown categories).
- **Finances suite (`/admin/finances`)** — replaces the `Heav & Aust Wedding Spreadsheet — Budget` tab. Five tabs: **Overview** (reporting), **Budget**, **Purchases**, **Gift Money**, **Settings**. Everything edits inline — commit on blur or Enter, revert on `Esc`, no Save button — and every derived figure recalculates from a single refetch so the grand total, percentages, both deficits and both payment plans can't disagree with each other.

  **Budget** holds sections → line items → optional component parts. A line is either `unit_cost × quantity` or the sum of its parts (Appetizers reaches $1,700 from six dishes). `qty_source` lets a line draw its quantity from the headcount (`adults` / `minors` / `total`) instead of a typed number, so Dinner, Dinner Kids and Bar all move together. `is_paid` becomes a real boolean, replacing the spreadsheet's "bold means it's been payed" convention.

  **Purchases** records what, when, who paid, and what it counts toward — either a single budget line or a whole section. Section-level targeting exists because bills like the venue's cover every line in the section and are paid down in installments; attaching those to the single Venue line both misattributed them and raised a false "over budget by $5,180" on a $4,500 line. `item_id` and `category_id` are mutually exclusive, enforced server-side in the same statement, so a payment can never be counted twice. Each section footer shows budgeted / paid so far / still owed with a progress bar, its installment log, and how much of the total came from gift money. Unlinked spend is kept and surfaced separately rather than silently excluded.

  **Gift money that has been earmarked counts as a payment against that bill**, because it is one — Rob's $5,000 toward the venue leaves the venue $5,000 more paid off. Earmarked receipts roll into a section's and a line's paid total, appear in the Purchases list as badged green rows (editable in place, with a filter pill of their own), and sit in each section footer alongside own-pocket installments. Previously they were only a footnote, so the venue read $9,680 paid when $14,680 had actually gone to it.

  The two roles gift money plays are kept strictly apart to avoid double counting: `outOfPocketTotal` (payers' own money) drives the per-payer shares and *left to cover*, while `paidTotal` = own + earmarked gift drives bill progress. The deficit already nets off contributions, so adding them to spend as well would understate what's left — a regression test pins `stillToSpendCash` at $9,516.26 across the change. Unearmarked receipts are reported separately as `giftUnapplied` (cash in hand, not yet a payment).

  **Gift Money** tracks money toward the wedding bill (parents, family) as a pledge per contributor plus individually logged receipts, each optionally earmarked to a whole section or a single line. Deliberately separate from the existing `donations` table, which tracks wedding/shower *gifts from guests* on the Registry page and stays guest-linked for thank-you notes.

  **Overview** shows per-section payment progress (paid vs budgeted, installment counts, still owed) and reports both planning scenarios side by side — *cash in hand* (received only) and *if pledges land* (all pledges) — with the per-payer share, remaining, and a payment plan in per-month / per-paycheck / per-day terms. The horizon derives from `weddingDate` so it tightens on its own; the spreadsheet hard-coded "12 Months". When no days remain (date passed or unset) the plan says *Due now* instead of printing the whole balance as a monthly figure.

  **Settings** exposes headcount, an editable payer list with adjustable shares (50/50 default; `0%` for someone who buys things but owes nothing, whose spend then reads as a credit), and the plan horizon. Live guest-list counts are offered as a one-click suggestion but never read automatically — a late RSVP shouldn't move a $33k total, and `guest_list` carries no adult/minor marker.

  New `src/lib/finance.ts` holds the whole calculation engine as pure functions; `src/lib/financeDb.ts` owns nine tables via the existing idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` pattern. One `GET /api/admin/finances` returns data + computed summary + live headcount in a single round trip; `POST|PATCH|DELETE /api/admin/finances/[resource]` is a generic CRUD endpoint over a strict table/column whitelist with parameterised queries only — unknown resources 404, unknown columns are dropped, bad enums fall back. `PATCH` with a bare array reorders in one transaction.

  On first run the original spreadsheet is imported (3 sections, 27 line items, 2 payers, 14 purchases, 4 contributors), guarded to run only when the tables are empty and wrapped in a transaction with a re-check so concurrent boots can't duplicate it. Paid flags are not imported — CSV export discarded the bold. Kim's $680 Veil receipt *is* imported, so seeded totals intentionally run $680 ahead of the old sheet, which never rolled it into its received column.

  **Mobile pass.** Row layouts were a desktop table forced into 390px: cells wrapped into an unlabelled two-column grid (an unlabelled `839.3` beside an unlabelled `1`), the description column collapsed to zero width in installment and receipt rows so the text was simply gone, delete targets were 21x24px and expanders 16x16px, and every input was 12-14px — under the 16px threshold where iOS Safari zooms the viewport on focus. Rows now collapse to a scannable summary (name + amount, PAID badge) and expand for editing, with each field labelled via a new `RowField` that reverts to a plain grid cell at `md` through `display: contents`. New `DeleteButton` / `GlyphButton` / `AddButton` / `RowSelect` / `RowDate` primitives give every control a >=32px touch target and 16px text on mobile while leaving the desktop table byte-identical. Stat tiles are compact on small screens — five full-size tiles previously pushed the data most of a screen down. Regression tests assert no sub-16px inputs, no under-32px targets inside the suite, labels hidden when collapsed and present when expanded, and zero horizontal overflow at both 390px and 360px.

  **Logic audit (`scripts/audit-finance-logic.mts`).** A new invariant audit asserts the identities that must hold for any data — sections summing to headline figures, payer shares summing to the deficit, payment sources summing to totals. It found that spending with no budget line was leaking into budget-progress figures: the sections said **$12,153.26** still owed while the headline said **$10,196.26**, off by exactly the $1,957 unbudgeted AirBnb, and buying something outside the budget was reducing what the couple appeared to owe *on* the budget. Budget-progress figures now use `budgetedOutOfPocket` (payments attached to a line or section) rather than raw cash out; `cashOutTotal` keeps the true cash figure, and per-payer rows show both when they differ. All 17 invariants now hold. Also fixed from the same audit: a 0%-share payer was told they were "ahead of their share" and that spending should shift to someone else, when they have no share at all (now "helping out — owes nothing"); shares totalling 0% silently left the whole deficit assigned to nobody (now warned via `unallocatedDeficitCash`); and contributions exceeding the budget produced negative shares with no explanation (now an explicit over-funded message via `isOverFunded`).

  **Eighteen follow-on features.** A **Schedule** tab (`finance_schedule`) records what's owed and when: *Split into payments* turns a line or section into a deposit plus instalments on an interval, with any rounding remainder landing on the final payment so the parts always sum to the bill exactly; rows badge *TODAY* / *30d* / *Overdue* and the tab title carries a **!** while anything is late. **Paid status is derived** from real payments (`paidState`) as *Not paid / Part paid / Paid / Overpaid*, with `is_paid` demoted to an override and a conflict hint when the two disagree — previously all 27 lines could claim to be paid with $12k outstanding. **Cost per guest** reports the marginal cost of one more adult by summing every headcount-driven line's unit cost ($72 = dinner $35 + bar $37) and what a table of ten adds. **Possible mistakes** flags same-amount payments with overlapping wording (it finds the duplicate *Suit* / *Austin Suit* $300 pair) and lines paid at over double their budget (*Austin's Ring*, $1,284 against $300). **What if…** re-runs `buildSummary` against an altered headcount, contingency buffer, or pledges-don't-arrive scenario without writing anything — cheap because the engine is pure. **Trend** stores one snapshot per day (`finance_snapshots`, upserted on read) and draws budget vs paid as a sparkline. **Add to budget** adopts an untracked payment into a new budget line and links it. **Bulk edit** retags payer / target / date across selected payments via `PATCH { ids: [...] }`, only sending fields actually set. **Receipt photos** per payment (`receipt_path`, stored in the photos volume and served by the existing `/api/photos` route, camera capture on mobile). **Templates** add ready-made line item sets wired to the headcount. Plus section **reorder** (⌃⌄, using the previously unused `sort_order` and reorder endpoint), a ten-second **undo** after deleting a payment or line, **refunds** as negative amounts, **notes** on payments (the column existed with no UI), **thank-you tracking** on gift money with a sent count and timestamp, **archive instead of delete** for sections, lines, payments and contributors (excluded from every total, restorable from Settings → Archive), and **CSV / print-PDF export** with print styles that drop the site chrome.

  Two bugs surfaced while testing this batch. `DATE` columns came back from node-pg as `Date` objects while every type declared `string | null`, which crashed `buildSummary` the moment a date was compared server-side; all date columns are now cast with `::text` so the runtime matches the types, pinned by a regression check. And the per-row bulk-selection checkbox was `md:hidden`, so bulk edit was unusable on desktop — it now occupies a real leading grid column.

  Verified by three independent scripts: `verify-finance-math.mts` (49 assertions reproducing the spreadsheet to the penny, including its % column and the −$2,970.87 "Heaven is ahead" figure), `verify-finance-db.mts` (58 assertions — schema, seed, cross-restart idempotency, CRUD, SQL-injection attempts, item/section target exclusivity, FK behaviour on both line and section deletion, settings singleton), and `verify-finance-ui.mts` (95 assertions driving a real Chromium through all five tabs — inline edits moving the grand total, logging an installment and watching the section total move, paid flag surviving a reload, payer filtering, split changes reaching the Overview, and no horizontal overflow at 390px).

- **Bulk editing on the guest list** — with guests ticked, the action bar keeps **Mark as Invited** and **Delete Selected** inline and puts everything else behind a **⋯** overflow menu to the right of *Delete Selected*: Mark as Not Invited, **⚠️ Flag as Issue** and **📌 Flag as Need** (idempotent toggles: if every selected guest already has the flag, it clears it), and **✏️ Edit Selected…** — a modal covering flag, note, side and RSVP status. The menu closes on outside click or `Esc`, and on the selection emptying. Every field defaults to *Leave unchanged* so a bulk edit only writes what was actually set. Notes have three modes — **Add to existing** (default; appends on a new line via `CASE WHEN COALESCE(NULLIF(TRIM(notes),''),'') = '' THEN … ELSE notes || E'\n' || … END`, so existing notes are never clobbered and guests with no note don't get a leading blank line), **Replace**, and **Clear**. A green confirmation pill reports what changed. Backed by a widened `PATCH /api/admin/guest-list` that now accepts `{ ids: [...], flag?, side?, invited?, rsvp_status?, notes?, noteMode? }` and builds the `SET` clause from only the keys present, updating in a single statement via `WHERE id = ANY($n)`; the original `{ id, address }` single-guest shape is untouched so the CSV address-reconcile tool keeps working.

- **Guest list mailing-list export** — an **Export CSV (n)** button beside *Import CSV* downloads exactly the rows currently on screen; both the filter tabs and the search box narrow the export, and the count is in the button label. Filename `guest-list-<filter>-<date>.csv`. New `src/lib/mailing.ts` builds the rows: a `Mail Name` envelope column (1 person → `John Smith`; 2 with a shared surname → `John & Jane Smith`; 2 with different surnames → `John & Jane`; 2 with an unnamed plus-one → `John Smith & Guest`; 3+ → `Smith Family` using the most common surname in the party with ties going to the head guest), plus the free-text address split into `Street` / `City State Zip` / `City` / `State` / `Zip`, an `Address Issue` column naming what didn't parse, a `Shares Address With` column that cross-references the batch to catch two invitations aimed at one house, and the rest of the guest record. Names are cleaned before use — parenthetical notes dropped (`Natalie Williams (Zack's Girlfriend)`, and a plus-one of only `(Collin's Date)` counts as unnamed) and suffixes ignored when comparing surnames (`Nick Lucas Jr.` + `Nicole Lucas` → `Nick & Nicole Lucas`). `party_size` decides the rule rather than the number of names on file, because `plus_one_name` sometimes repeats a party member under a different surname (member `Sallianne Ballard` vs plus-one `Sallianne Roher`) and would otherwise push a couple into the "family" case. Address parsing was written against all 90 production rows and covers line breaks used in place of commas, an apartment either comma-separated or glued onto the city (`Apt. 5 Pewaukee` → unit moved back to the street line), a state riding along with the city (`Muskego WI, 53150`), state-only and ZIP-only tails, and ZIP+4; 88/90 rows parse clean and the 2 that don't are genuine data problems, flagged rather than mangled. CSV is emitted with a UTF-8 BOM and fully quoted fields so Excel keeps accents and leading-zero ZIPs.
- **Gift field on donations** — a donation can now record money, a physical gift, or both. `amount` is optional as long as a gift is named (new `gift` column); the **Fund** selector is disabled for gift-only entries since there is no money to allocate against a fund's progress. New Gift column in the donations table, and the guest list's Donated column now reads `Gift` / `$X + Gift` instead of `-` for gift givers.
- **Recent Activity feed on the dashboard** — a scrollable, newest-first timeline inside the **Content & Insights** card, grouped by day (`Today` / `Yesterday` / date) with sticky day headers, a colour-coded icon per event type, a relative timestamp (`2h ago`) whose `title` carries the exact date and time, and a click through to the relevant admin page. Ticks once a minute so the relative times don't go stale on a tab left open. There is no audit-log table and adding one would only start recording from the day it ships, so the feed is assembled in `src/lib/activity.ts` from timestamps the data already carries — that way a full history exists on the very first load. Ten event kinds across seven sources: RSVP submissions (accepted/declined) plus a separate *changed their RSVP* event when `updated_at` post-dates `created_at` by more than a minute, guest-list additions, logged donations (cash or physical gift), finance payments, gift-money receipts, newly scheduled payments, photo uploads and timeline milestones. Photos and milestones carry no timestamp column, but both use `Date.now()` as their id, so the id *is* the date — ids below 2001 are treated as hand-written and skipped. Each source is capped at 30 rows so one busy table can't crowd out the rest, and the merged feed keeps 60. Every query runs through a `safeRows` helper that swallows *undefined table* errors, so an install missing the finance or donations tables gets a shorter feed rather than a broken dashboard.
- **Finances card on the dashboard** — budget, paid, still owed and gift money as headline stats, a budget-progress bar with *left for you two to cover*, the four biggest sections with paid/budgeted bars, an unearmarked-gift-money footnote, and a red/amber banner for overdue or due-soon payments naming the next one. Sourced from the same `buildSummary()` the finances suite uses, so the two can't disagree; unlike `GET /api/admin/finances` the dashboard deliberately does **not** write a daily snapshot — opening the dashboard shouldn't count as taking a reading of the budget. Falls back to an *Open Finances* empty state when there are no budget lines, and to *Finance data unavailable* if the query fails, both inside the same try/catch that keeps a finance error off the rest of the page.
- **Installable as a proper PWA — fixes iOS dropping its in-app browser chrome on every navigation** — added to the iPhone Home Screen, the site launched standalone but the moment you navigated off the page you started on, iOS pasted its in-app browser UI on top (a **✕** top-left, a back/forward bar bottom-left). The site had **no Web App Manifest at all**, so iOS had no `scope` to compare against and treated every in-app navigation as leaving the app. New `src/app/manifest.ts` declares `scope: '/'`, `start_url: '/'`, `display: 'standalone'` and `id: '/'`, generated per-request so name, description and `theme_color` follow `site.json`. Next emits only the standardised `mobile-web-app-capable`, so `apple-mobile-web-app-capable` is added by hand in the root layout — iOS before 16.4 honours only the apple-prefixed name and would otherwise open the icon in a normal Safari tab. `apple-mobile-web-app-status-bar-style` is `default` and `viewport-fit: cover` is deliberately *not* set, so iOS insets the viewport itself and the fixed nav can't slide under the clock and Dynamic Island — no `env(safe-area-inset-*)` padding needed anywhere. New `GET /api/app-icon?size=` renders square PNGs at 180/192/256/512/1024 with sharp, padding the couple's uploaded `weddingLogo` onto the accent colour, falling back to a heart drawn as an SVG **path** — no text anywhere, because Alpine ships no fonts and anything font-dependent would rasterise to blank boxes in the production image. Without an `apple-touch-icon` iOS uses a screenshot of the page as the Home Screen icon. **iOS reads the manifest only when the icon is added, so an existing Home Screen icon must be deleted and re-added.**
- **Separate "Add to Home Screen" target for the admin panel** — adding `/admin` to the Home Screen produced an icon that opened the public home page. iOS uses the linked manifest's `start_url` and ignores the page you were actually on, so the single site-wide manifest sent every install to `/`. (Before the manifest existed iOS fell back to the current URL, so this was a regression introduced with it.) There are now two variants from one route: the default, and `?app=admin` with `start_url: '/admin'`, `id: '/admin'`, name *Wedding Admin*, short_name *Admin*. `scope` stays `/` in both, so either icon can reach any page without iOS pasting its in-app browser chrome on top. Implemented as a route handler at `src/app/manifest.webmanifest/route.ts` rather than the `app/manifest.ts` convention, whose export receives no request and so can only ever emit one manifest. The admin variant is linked by a new server `src/app/admin/layout.tsx` — a nested layout's `manifest` field wins over the root's — with the existing client shell moved to `AdminShell.tsx` since client components cannot export metadata. The `apple-touch-icon` and `appleWebApp` block are re-declared there too: on iOS the apple-touch-icon takes precedence over the manifest's `icons`, and Next replaces rather than merges `appleWebApp`, so omitting a field would silently drop it. `GET /api/app-icon?variant=admin` grounds the same logo on light grey (`#e5e7eb`) instead of the accent colour. Light rather than dark on purpose — the wedding logo is black calligraphy on transparency and all but vanished against the dark slate first tried; the fallback heart's fill follows the ground for the same reason, or the admin variant would have drawn white on light grey.
- **Admin panel — "What's new", beside the panel's own name.** The project keeps a real `CHANGELOG.md` — every change, why it was made and what broke — and the only way to read it was to open the repository. A ✦ button beside the **Admin Panel** heading now reads it in the panel, with a dot when the newest release is one this browser hasn't opened. The newest release opens expanded, older ones collapsed; each change shows its headline and unfolds to the full reasoning on click. New `src/lib/changelog.ts` parses the file (releases, `### Added` groups, nested bullets, wrapped prose joined back onto its bullet) and tokenises inline markup — **bold**, `code`, *italics* and links — which the renderer turns into **React elements, never `dangerouslySetInnerHTML`**, so nothing in the file can be injected as markup. Bold wrapping a code span is common in this file, so strong/em contents are re-tokenised rather than printed with their backticks still showing. Releases are keyed by a synthetic id because the file has four separate `## [2026-05-25]` headings and a version alone can't identify one. The Dockerfile now copies `CHANGELOG.md` into the production image — standalone output would otherwise leave it in the build stage — and `GET /api/admin/changelog?latest=1` answers "is there anything new" in one string, so the unread dot costs no more than that on a page load. The button renders in the sidebar *and* the mobile top bar, sharing one request, because on a phone the sidebar's header sits behind the site's floating nav and cannot be tapped. 44 assertions in `npm run check:changelog`, run against the real file as well as fixtures.
- **The admin panel has one dialog implementation.** `Modal` moved from the honeymoon folder to `src/components/admin/Modal.tsx`, since the changelog needs the same three hard-won behaviours (portalled above the site nav, closing only on a press that *began* on the backdrop, and Escape). Re-exported from its old home, so every existing import is unchanged.
- **Honeymoon Settings — a trip with a start date but no end shows its range anyway.** `end_date` is new, so an existing trip has a start and a number of days but nothing stored for the end, which left the calendar blank next to a summary that read "day 1 is Oct 19 · day 10 is Oct 28". The picker now derives the end from the day rows when there isn't one; the first drag writes it down properly.
- **Honeymoon portal — the trip's dates are a range you drag on a calendar.** Settings had a bare `<input type="date">` for the start and **no end date at all** — the trip's length was however many `honeymoon_days` rows happened to exist, built one *+ Add day* at a time. Now two months sit side by side and you press on the first day away and release on the last: the range shades live, either end can be picked up and moved afterwards (grabbing the start moves the start; grabbing the end moves the end), and it works dragged in either direction. New `honeymoon_trip.end_date`, kept **alongside** the day rows rather than derived from them, because the two answer different questions — `end_date` is when you fly home, the day rows are how much of it you have planned. **Setting a range reconciles the rows to it**, which is the point of the feature: extending creates the missing days, shortening deletes the trailing ones but only after a confirm naming exactly what is on them ("Days 12–14 would be deleted, along with 7 stops and 1 travel leg"), and moving the whole range shifts every date without touching a row. The arithmetic is a pure `planRange()` returning a plan rather than performing one, so the UI can state the consequences before anything is written; `calendarMonths()` was refactored onto a `monthMatrix(year, month, dayNumberOf)` primitive so the picker can show any month, including for a trip with no dates yet. Quick-set buttons for 7 / 10 / 14 days, because that is how people actually decide.
- **Honeymoon portal — nothing you delete is gone for ten seconds.** Every delete in the module was final behind a `confirm()`, including a bulk delete over a hundred lassoed places and a day delete that cascades its stops and travel legs. There is now an **Undo** toast for places (single and bulk), days, stops, travel legs, guide notes and to-dos. It restores the rows *and their links*: `place_id` is `ON DELETE SET NULL`, so deleting a scheduled place demotes its stops to plain text — the old links are captured first and re-pointed at the restored rows, as is any day whose base it was, and a restored day comes back with its stops and travel legs re-parented to its new id. Hovering pauses the countdown, because reaching for the mouse shouldn't be a race. A new array form of `POST /api/admin/honeymoon/<resource>` inserts many rows in one transaction, so restoring a hundred places is one round trip rather than a hundred. **Most confirms are gone as a result** — a confirm you can undo is two speed bumps for one hazard; the lasso delete keeps its one, because "116 places" is worth reading twice.
- **Honeymoon portal — the place editor stops throwing away your typing.** Closing it discarded everything in the form without a word. Escape, the ✕ and a click outside now all check first and stay put if you say no, via a new `guard` on the shared `Modal`; an untouched form still closes silently. **Escape closes every dialog in the portal** — previously nothing did. **⌘/Ctrl+Enter saves** from anywhere in the form (plain Enter can't: the coordinate box uses it for "look that up"). The dirty check fingerprints the form on open and compares on close — and the fingerprint is taken from the values being *written* rather than read back on a later render, because state updates are queued and reading afterwards captures the previous form, which made every dialog look dirty the instant it opened. That bug was caught by re-running an older regression suite, not by the new tests, and now has a test of its own.
- **Honeymoon portal — ⌘K finds anything.** Search existed on the Places tab and nowhere else, so a guide note or a to-do could only be found by first remembering which tab it was on. The palette searches places, guide notes, to-dos, days and regions at once from any tab (including the map, which owns its whole viewport), with ↑↓ and Enter. Prefix matches beat contained ones and titles beat bodies, and **every kind is guaranteed a seat before the rest fill by score** — searching "ubud" buried the to-do called *Book Ubud driver* under eleven places whose names start with Ubud. Picking a place opens its editor where you stand rather than routing you to a list to find the row again.
- **Honeymoon portal — take the trip with you.** **`.ics` export** (`GET /api/admin/honeymoon/ics`): one all-day event per day carrying its stops in the description, plus timed events for every travel leg and every stop with a time. Built server-side from the same payload the portal renders so the file can't disagree with the screen, with RFC 5545 escaping (backslash, semicolon, comma, newline), 75-octet line folding and CRLF throughout — skipping any of those produces a file that imports fine in one calendar app and silently truncates in another. **Print view**: the itinerary as a clean day-by-day sheet, portalled to `<body>` and shown only in print, because the admin area lives inside a fixed, `overflow: hidden` container that clips a print to a single page no matter how much content there is. **JSON backup** in Settings — the whole portal in one file, for the day a bulk edit goes wrong.
- **Honeymoon portal — two schema columns that had no UI at all.** `honeymoon_days.notes` and `honeymoon_stops.notes` shipped with the original schema and have never been writable. Both are now editable, shown when there is something in them or when asked for via the ⋯ menu — a permanent empty box on every card earns its space only on the days that need one. Same for **`honeymoon_trip.home_currency`**, which drives `formatPerNight` and every price on the dashboard and has never had a control: Settings now has a currency picker.
- **Honeymoon portal — itinerary depth.** **Duplicate day** copies a day's title, base, notes and stops onto the end of the trip (the second beach day is mostly the first beach day). **Move a stop to another day** from its ⋯ menu — cross-day dragging would mean one DnD context spanning every card instead of one per card, giving up the reordering-within-a-day case that arrangement serves well, for a fraction more value. The dashboard's countdown now states the trip's length, and the header carries the nights.
- **Honeymoon portal — Places tab parity.** The tab's selection bar gains **Add to day…** and the **⋯** bulk-field menu, so the verbs no longer depend on whether you selected on a map or in a list. A scheduled place's badge names *which* day it is on rather than just saying "scheduled".
- **Honeymoon portal — mobile.** Walked every one of the nine tabs at 390×844 rather than guessing. Nothing scrolled sideways and no control was stranded off-screen, but the nine-tab strip cut off at *Stays* with no hint that it scrolls, so it now **fades at its right edge on phones only** (above `md` everything fits and a fade would just make the last tab look faulty), with the scrollbar hidden since it sat across the pills.

- **Honeymoon portal — change any field across a lasso selection.** A new **⋯** button on the lasso bar, immediately left of *Mark reviewed*, opens a two-step menu: pick the field, pick the value, and it writes to every selected place at once. Covers type, region, country, status, source, review flag, excursion and rating — every field a selection can sensibly share. Name, notes and coordinates are deliberately excluded: they describe one place and a bulk write would destroy them. Options come from the data rather than a hard-coded list, so a category or region invented a minute ago is immediately bulk-appliable. Two steps rather than one flat list because a flat list would mix "Booked", "Ubud" and "Indonesia" with no clue which field each belonged to. New shared `BulkFieldMenu`. Verified in a browser: 116 lassoed places all took the change in one click.
- **Honeymoon portal — the site nav no longer covers the top of any dialog.** Opening a place from the map cut off the dialog's title bar and close button; clicking where the ✕ appeared hit the nav's *RSVP* link instead. **Cause: the admin area lives inside AppShell's `position: fixed` container, and a fixed element establishes a stacking context** — so `z-50` on the dialog was capped at that container's level, while the site's own fixed nav sits outside it at `z-index: 50` and painted straight over the top. Raising the dialog's z-index could never have fixed it. The shared `Modal` now renders into `<body>` via `createPortal` at `z-[60]`, which puts it in the same stacking context as the nav, above it. Reproduced at 1280×700 before the fix (`elementFromPoint` over the title returned the nav; over the ✕ returned the RSVP link) and re-checked after; the earlier drag-release-outside behaviour still holds through the portal.
- **Honeymoon portal — the place editor fits on screen without scrolling.** It was a single tall column with the pin map stacked above the notes, so it overflowed and scrolled while the space beside the map sat empty. Now two columns from `lg` up — location and map on the left, notes/address/source/price/links on the right — with *Clear pin* moved onto the Location header line beside the coordinates, the pin map trimmed to `h-48` and tighter spacing throughout. **661 → 611px of content**, which fits with no scrollbar at every size from 1920×1080 down to 1280×700; below roughly a 660px-tall window it scrolls again, which is the right fallback rather than crushing the map. The dialog widens to `xl:max-w-5xl` to give the two columns room.
- **Honeymoon portal — the itinerary as a real calendar.** A **☰ Days / 🗓 Calendar** toggle in the tab's upper right switches the day list for a month grid. Renders every month the trip touches as whole Sunday-first weeks, with the surrounding days shown greyed rather than dropped — seeing the trip against the month is the point of looking at a calendar. Each trip day is a tile carrying its title, travel legs and first three stops (then "+N more", so one busy day can't set the row height for the whole week); clicking it opens the same `DayCard` the list view uses, inside a dialog with its own `DndContext`, so there is one implementation of a day and no second one to keep in step. Needs the trip's start date and says so — pointing at Settings — when it isn't set. The view choice persists in `localStorage`: how you like to read the trip is about you and your browser, not about the trip, so unlike the country filter it isn't saved server-side. New pure `calendarMonths()` in `src/lib/honeymoon.ts` does the grid arithmetic on UTC parts (matching `dateForDay`), covered by 20 new assertions in `npm run check:honeymoon` including the month rollover.
- **Honeymoon portal — a place can set its own country.** The place editor's top row is now **Category | Country | Region | Status**. Country is stored on the place (`honeymoon_places.country`, `''` by default) and is normally left blank: it reads *— from region (Indonesia) —* and inherits, so the common case stays a single edit on the region rather than a field to keep in sync on every place under it. It exists for the two cases inheritance can't cover — a place with **no region at all** (Savaya Bali in the live data had none, and the map's country filter had nothing to judge it by), and one that genuinely sits outside its region's country, where the editor warns *Overrides its region (X)*. Blank is a meaningful value here, so the API field carries `blankAsEmpty` — plain text coercion would turn a cleared country into `NULL` against a `NOT NULL` column and 500 the save, the same bug that broke the trip-wide filter earlier in this release. New `effectiveCountry()` resolves place-then-region for the map filter, its unclassified count and the dashboard, so all three agree; `countriesInUse()` builds the dropdown from countries already in the data, with **＋ Custom…** for a new one. The region dropdown now shows each region's country beside its name (`Ubud · Indonesia`, or `Munduk · no country`), which surfaces an unset region at the moment you'd act on it.
- **Thank-you tracking on donations** — row checkboxes and a select-all header checkbox (matching the guest list), with bulk **Mark Thank You Sent** / **Unmark** actions, plus a per-row pill (`✓ Thank you sent`, hover shows the date, or `Not sent`). Header summary gained `X/Y thanked`. Backed by a new `PATCH /api/admin/donations` taking `{ ids, thank_you_sent }` which stamps `thank_you_sent_at`.

### Fixed
- **A hydration mismatch warning on every single admin page.** The inline script in `<head>` adds `no-scrollbar-gutter` to `<html>` before paint on admin routes; the server cannot know the path, so that class was always a mismatch and React logged a warning on every admin page load — noise that hides real errors in the dev overlay. `suppressHydrationWarning` on the `<html>` element, which is what it exists for. Verified: the admin console is now clean across honeymoon, RSVPs, finances, photos and seating.
- **Every photo thumbnail was a broken image** — `/api/photos/<file>/thumb` returned **404** for all inputs, so the admin home page's Hero Slideshow photo picker (both the picker grid and the selected-order list) and the nav-cards gallery modal showed broken-image icons. In `src/app/api/photos/[...filepath]/route.ts` the `fs.existsSync()` guard ran **before** the thumb branch that strips the trailing `thumb` segment, so it stat'd `public/photos/<file>/thumb` — a path that can never exist — and returned early. Broken since the route was converted to a catch-all for subfolder support (`5520021`); the follow-up that added thumb handling to the catch-all (`bc62cea`) put the new branch after the existence check, so it never ran. The route now resolves the source path first (dropping a trailing `thumb`), then does the containment and existence checks once against that real path. Confirmed by curling the live container before the fix (`404 text/plain 14b` vs `200 image/jpeg` for the same file without `/thumb`) and re-verified against the rebuilt production image. Also tightened the traversal guard: the old check permitted `filePath === photosDir`, which fell through to `readFileSync` on a directory and a 500; a zero-segment request is now a 404.
- **Added `npm run check:photos`** (`scripts/check-photo-route.mts`) — calls the photo route handler directly and asserts thumbs (root **and** subfolder), full-size, `?w=` resize, 404s for missing files, and the traversal guard. This route has now broken twice with no symptom other than broken-image icons, so it gets a regression guard.
- **Guest-list select-all ignored the active filter** — the header checkbox's *checked* state was computed from `filteredGuests` but `toggleSelectAll` selected/deselected **every** guest in the table. Filtering to *⚠️ Issue* and clicking select-all therefore swept all 90 guests into the selection while the UI implied only the visible ones, which "Delete Selected" already made dangerous and bulk note/flag editing makes worse. Now it unions/subtracts only the visible rows and leaves selections outside the filter alone.
- **Side was silently unsaveable from the guest edit modal** — the modal has always had a Side field and `guestForm` carried it, but `PUT /api/admin/guest-list` never destructured or wrote `side`, so editing it did nothing (the column kept its old value, with no error). Added to the update.
- **Portainer "Pull and redeploy" 500 — actually diagnosed and fixed.** Docker Compose discovers a project's containers by filtering on the *presence* of the `com.docker.compose.config-hash` label, which compose writes **only on containers it creates itself**. `wedding-web-prod` had been recreated by hand with `docker run`, so it could never carry that label — compose saw **zero** containers for service `web`, tried to create a fresh one, and collided with the pinned `container_name`. The pull always succeeded, so the site silently kept serving the old image. The 2026-07-27 diagnosis (missing `oneoff`/`container-number`) was wrong and its fix never worked; labels are immutable on an existing container, so **no `docker run` recipe can fix this** — the container must be created by compose. Recreated it via `docker compose … up -d --no-deps web` against a mirror of the stack files at Portainer's own paths; `up -d --dry-run` now reports both containers as `Running` instead of `Creating`. The README's manual-deploy recipe was rewritten to use `docker compose` (the old `docker run` recipe was the cause, not the workaround).
- **Database left down by the failed redeploy** — a failed swap leaves `wedding-db-prod` created-but-never-started, so the web container fails DNS on `db` (`EAI_AGAIN`) while still returning 200 on pages that don't touch the DB. Started it; all data intact (90 guests, 9 RSVPs, 16 donations).

## v0.8.0 — [Released] RSVP attendance choice, party-member login, guest table repair, rapid check-off (2026-07-27)

### Added
- **Explicit attending / not attending per guest (public RSVP)** — Every party member now has **two mutually-exclusive checkboxes** (ticking one clears the other; clicking a ticked box clears it back to unanswered), and **the RSVP cannot be sent until every guest has one ticked**. Unanswered cards are highlighted amber, a live line reads "*N guests still need to be marked attending or not attending*", and Send RSVP is disabled with a server-side check behind it naming the specific person. A bolded note under the welcome banner explains the requirement. Card attendance became a tri-state (`'yes' | 'no' | null`) instead of a boolean — previously an unticked box was indistinguishable from "not answered yet", so anyone the submitter forgot to tick was **silently counted as declined and the party under-counted with no warning**. The primary guest stays locked to Attending (already answered by the "Will you be attending?" select; declining there covers the whole party).
- **Any party member can look up the RSVP by their own name** — `POST /api/guest-verification` now matches `guest_name`, `plus_one_name`, **or** any named entry in `party_members` (case- and whitespace-insensitive), so e.g. Kenzie Miller can enter her own name and pull up Max Kulik's party RSVP. Match order is deterministic: an exact primary-guest match beats being listed inside someone else's party, then lowest id. Guarded with `jsonb_typeof` so the rows holding `NULL` `party_members` (23 of 90) can't error. **Names that can log in went from 77 to 140.** The response gained `matched: { name, isPrimary }` so the form greets whoever signed in and notes whose party they belong to instead of showing a stranger's name; login copy now says anyone in the party can use their own name.
- **Rapid guest check-off (admin guest list)** — Type a name in the guest-list search and press **Enter** to tick the top match; the box clears and keeps focus for the next name. Enter is additive and never unticks (reports "*X was already checked*"). Party-member names match too, and the confirmation names whoever was actually ticked. No match keeps the typed text so a typo can be corrected. Takes the top match within the active filter tab.

### Fixed
- **Responsive guest table never dropped any columns** — The measured column-dropping system shipped previously never ran at all: the guest table only renders on the guestlist tab, but the measure effect's deps were `[guests, guestFilter, guestSearch]`. On mount the ref is `null` so the effect early-returned, and clicking the tab changed no dep, so it never re-ran and no `ResizeObserver` was ever attached — all 11 columns crammed at every width. Added `activeTab` to the deps. (Proved by a discriminating test: typing in the search box, which *is* a dep, instantly dropped 11 columns → 5 with zero code change.)
- **Name column could never shrink, clipping Actions off the right edge** — In `table-layout: auto`, `overflow-hidden` does **not** reduce a cell's min-content contribution, so with `truncate` inside and no `max-width` the column was pinned to the longest guest name (~300px), forcing table min-content to ~705px. Fixed with the `w-full max-w-0` flexible-truncating-column pattern (on the main row and the party-member sub-row).
- **Edit/Delete pills stacked vertically, rows 117–135px tall** — `flex-wrap` makes a cell's min-content only as wide as its *widest single button*, so `table-auto` squeezed the Actions column and the pills wrapped. `flex-nowrap` keeps them on one line; rows are now a uniform 78px.
- **"Not Invited" / "No Response" wrapping onto two lines** — Added `whitespace-nowrap` to the Invited/RSVP cells (columns spec'd never to shrink). Flag badges (⚠️ Issue / 📌 Need / 📝 Note) also wrapped one-per-line and ballooned row height; they now stay on one line and clip.
- **Bulk-select checkbox was dropped first** on narrow-ish widths — it is only 40px, so dropping it first lost bulk-select on a 1920px monitor while saving almost no space. Hide order is now `contact → notes → address → donated → relation → select`.
- **Re-opening a submitted RSVP showed blank checkboxes** — Removing the pre-fill entirely also blanked the boxes when a guest re-opened an RSVP they had already sent, which reads as if their answers were lost. Split the cases: a brand-new RSVP still starts completely blank, but re-opening a submitted one restores what was chosen. Attendance isn't stored per member — a submitted RSVP lists exactly its attendees in `dietary_restrictions` (the admin view reads that array as "who's coming") and submitting requires answering everyone, so absence from that list means the member was marked not attending.
- **Existing-RSVP lookup keyed off the typed name** — A plus-one would never have found the party's existing RSVP and would have submitted a duplicate instead of editing it. It now resolves to the primary guest's name first.

### Changed
- Column measurement now uses the wrapper's **border-box** width instead of `clientWidth`, so a scrollbar appearing/disappearing can't feed back into another hide/show cycle (verified stable under ±1px resize).
- The guest table wrapper gained `overflow-x-auto` as a last-resort floor. Below ~640px the five mandatory columns need 479–543px but the wrapper is only 341–446px, and its rounded parent is `overflow-hidden` — so without this the Edit/Delete pills were clipped and **completely unreachable**. Worst case is actually 768–820px, where the admin sidebar squeezes the wrapper to ~446px. Desktop widths (1024+) remain scroll-free.

### Verification
Built a Playwright harness driving the app in a real browser (no test framework in this repo, and no local Postgres — API responses stubbed via `page.route`). The guest table passes at **all 12 widths from 375–1920px**: no clipped-unreachable cells, no stacked action buttons, Name always present, no page h-scroll, uniform 78px rows, stable under ±1px resize. The RSVP flow was verified for a simulated family of four (mutual exclusivity, submit genuinely blocked with no POST fired, correct `guestCount` vs `resolvedMembers` on submit) and the guest-verification SQL was tested **read-only against production data** — "Kenzie Miller", "KENZIE MILLER" and "  max kulik  " all resolve to Max Kulik; unknown names still fail.

## v0.7.1 — [Released] Home page section styling: shadows, larger radius, rounded FAQ card (2026-07-06)

### Added
- **Drop shadows on all home page bands** — Each stacked section below the hero (Intro/Countdown, About header, How We Met, Venue, FAQ) now carries an **upward-casting** shadow (`shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.12)]`). Upward is intentional: each band pulls up `-mt-8` over the one above it, so a normal downward shadow would be buried under the next band. This makes each section's rounded top edge lift off the section above it.

### Changed
- **Section corner radius 22px → 40px** — All home page bands (`rounded-t-[40px]`) for a softer, more pronounced rounded look.
- **Explore (nav cards) section is now white** — Wrapper background changed from `aboutBgColor` to `bg-white`.
- **Details & FAQ is now a fully-rounded card** — Changed from `rounded-t-[40px]` (top only) to `rounded-[40px]` (all four corners) with a two-sided shadow (up + down) so both the rounded top and bottom read as a floating card.

### Fixed
- **Pink strip above the Explore section** — A `mb-14` gap that had been added under the FAQ card exposed a full-width strip of the blush home-page background (`bgColor`, which intentionally peeks through the rounded-corner notches of each white band). Removed the gap; the white Explore section now tucks flush under the FAQ (`-mt-10`), with the FAQ layered on top (`z-10`) so its rounded bottom + shadow render against white instead of the pink background.

## v0.7.0 — [Released] Photo display fix, admin photo UX, dashboard RSVP deadline stat (2026-07-06)

### Fixed
- **Admin & public gallery photos not displaying** — The admin photo grid (and its hero previews) and the public `PhotoGallery` were the only components still referencing images via the raw `/photos/<file>` static path (through Next's image optimizer). Next.js standalone's static file handler only serves `public/` files that existed when the container **started**, so any photo uploaded to the volume afterward returned 404 there (and a 400 from `/_next/image`), leaving the admin card showing just the filename placeholder. Root cause confirmed with live `curl` inside the container: `/photos/<new>` → 404, `/_next/image?url=/photos/<new>` → 400, `/api/photos/<new>` → 200. Both files now route through the `fs`-based `/api/photos/<file>` route used everywhere else, so runtime-uploaded photos always display and future uploads never regress.
- **Hearting a photo jumped the page to the top** — Hearting re-sorts the photo toward the top of the admin grid; the reorder + focused button scrolled the viewport up. Now the scroll position is captured and restored (`requestAnimationFrame` + button `blur()`), so the photo moves up while the viewport stays put.

### Added
- **Scroll-to-top button (admin photos)** — Small fixed **↑** button (bottom-right) that smooth-scrolls the photo management page back to the top.
- **RSVP Deadline stat (dashboard)** — New count stat in the **RSVPs & Guests** card showing days left before the RSVP deadline (`siteConfig.rsvpDeadline`). Amber within 7 days, red once passed, "—" when no deadline is set. `GET /api/admin/dashboard` now returns `countdown.rsvpDaysLeft`.

## v0.6.1 — [Released] Mobile hero polish: scroll hijack, padding, UX fixes (2026-06-01)

### Added
- **Mobile hero scroll hijack** — Outer section is 200svh with sticky inner, mirroring the desktop pattern. Any downward touch/wheel is consumed entirely by the collapse animation; after completion `window.scrollTo` jumps past the section so normal scroll begins immediately. Upward scroll back to section boundary auto-triggers expand (including during iOS momentum via `scroll` event listener). Wheel handler added alongside touch so phone-sized desktop browser windows work identically.
- **Collage padding** — When collapsed, 90px top padding (clears nav bar) and 30px bottom padding animate in with the strips. All strip positions/heights computed in px from `window.innerHeight` so padding is exact.
- **Post-collapse scroll hint** — "scroll ↓" fades in on the bottom strip after animation completes, positioned inside the strip (`padBot + 14px` from bottom).
- **Scrollbar layout shift fix** — `scrollbar-width: none` + `::webkit-scrollbar { display: none }` on mobile in `globals.css` so no reserved scrollbar gutter.

### Fixed
- **Separator lines animate with mid strip** — Lines are `borderTop`/`borderBottom` on the mid strip div, riding the squish from full-screen to center third.
- **Text overlay stays centered in mid strip** — Text translateY follows mid strip center offset `(PTOP−PBOT)/2 × e` as asymmetric padding grows; scales 1.0→0.65 to squeeze text into the smaller strip instead of fading.
- **iOS momentum expand** — Scroll event listener auto-triggers expand when `scrollY ≤ sectionScrollRoom − 80px` so users don't have to stop and re-swipe.
- **Double-animation on expand** — `scrollTo(0)` now fires while state is still `animating`, preventing the race where the job-1 snap-to-collapsed triggered immediately after expand.
- **DevTools phone-size viewport** — `isMobile` now updates via `MediaQueryList` change event; mobile `useLayoutEffect` runs after DOM commit so refs are always populated.
- **Image quality** — Mobile hero slideshow bumped from `medium` (960px) to `large` (1280px) for sharp retina display.
- **Date/location** — Two lines on mobile (`<br className="md:hidden">`), both center-aligned.
- **About image tilt** — `rotate-2` → `md:rotate-2`; image sits straight on mobile.
- **Slideshow dots** — Raised 10px in hero mode (bottom: 66px); lowered 30px in collage mode (bottom: 36px), animated continuously.
- **Scroll hint / dots overlap** — Dots at bottom: 66px, pre-collapse hint at bottom: 20px — no overlap.

## v0.6.0 — [Released] Mobile hero collapse animation and about image tilt fix (2026-06-01)

### Added
- **Mobile hero collapse animation** — On first swipe-up the full-screen hero squishes vertically into the center third while a second photo slides down from above and a third rises up from below, all in the same 900ms cubic ease-in-out as desktop. Swipe down when collapsed to reverse the animation and restore the full hero. Dispatches the same `hero-collapsing` / `hero-expanded` CustomEvents as desktop so the nav pill transition fires simultaneously. Particle burst (gold sparks, white sparks, rose petals) fires at the strip-seam lines at ~70% through both collapse and expand.

### Fixed
- **About section image tilt on mobile** — The couple photo in the "How We Met" section was always rotated 2°. Now the tilt only applies on `md` breakpoint and above (`md:rotate-2`); on mobile the image sits perfectly straight.

## v0.5.0 — [Released] RSVP dietary restrictions overhaul, party member cards, dashboard fixes, nav cards (2026-05-31)

### Added
- **Per-guest dietary restriction cards** — Each guest in the RSVP form now gets their own card with checkboxes: Vegetarian, Vegan, Gluten Free, Nut Allergy, Other. "Other" reveals a required text field; submission is blocked until it's filled in.
- **Attending toggle per guest card** — Additional party members have an attending toggle; toggling on an unnamed slot reveals a required name input.
- **Party members support (families of 4+)** — `party_members JSONB` column on `guest_list`; supports named and unnamed extra guests. Unnamed slots force the RSVP filler to enter a name. Party size enforced server-side.
- **Party sub-rows in RSVP and Guest List admin tables** — Each head guest row shows soft gray sub-rows for additional party members, with their dietary data if available. Styled with `bg-gray-50/60`, thin `border-l-2 border-gray-200` left accent, compact padding, muted text.
- **"Make Changes" button on RSVP success screen** — Replaces the static info box; re-opens the RSVP form pre-filled.
- **Phone number mandatory** — RSVP form and API both require phone before submission.
- **Resolved member names written back to guest_list** — When a guest names an unnamed party slot during RSVP, that name is persisted to `guest_list.party_members` for future sessions.
- **Nav card default photos** — Bundled royalty-free Unsplash photos (`public/images/nav-defaults/`) for each card slug (our-story, wedding-party, schedule, photos, registry, rsvp). Render in grayscale by default.
- **Nav card gallery picker** — "Gallery" button in Admin → Nav Cards opens a modal of all site photos (loaded as thumbnails via `/api/photos/<filename>/thumb` for fast loading). Clicking picks a photo and copies it to the nav-cards slot.
- **Nav card PATCH API** — `PATCH /api/admin/nav-cards` accepts `{ slug, sourceFilename }` to copy an existing site photo to the nav-cards dir.

### Fixed
- **Dashboard guest list counts all showing 0** — SQL was checking `rsvp_status = 'confirmed'` but RSVP API writes `'attending'`. Fixed to use `'attending'`.
- **Dashboard pending count** — Now correctly excludes `attending`, `declined`, and `likely_not_coming` statuses.
- **party_size overwritten on re-RSVP** — Removed `party_size` mutation from the RSVP submit/update API; the pre-set admin value is now preserved.
- **Nav cards crashing the home page** — `dangerouslySetInnerHTML` caused hydration errors; replaced with proper React JSX SVG components.
- **Gallery button crash** — Photos API returns `{ photos: [] }` not a plain array; fixed parsing with `Array.isArray(data) ? data : data.photos`.
- **Docker deploy speed** — Added `--cache-from` flag; dropped the redundant local `npm run build` before `docker build`. Updated `deploy.md`.

### Changed
- **Nav card images are grayscale** — CSS `grayscale` filter applied to all nav card images (both custom and defaults).
- **Admin nav card thumbnails** — Now show real photo previews (custom or default) instead of a gradient placeholder box.

## v0.4.1 — [Released] Venue photo and Get Directions button (2026-05-27)

### Added
- **Venue photo** — A photo can now be assigned to the Venue section on the home page. Go to **Admin → Photos**, hover any photo, and click **"Set Venue Photo"**; the image renders below the venue description as a full-width rounded card (`h-72` mobile / `h-96` desktop). The current assignment is previewed in the photo admin assignments strip alongside Home Hero, About Hero, Footer, and Wedding Logo. Config key: `venuePhoto` in `site.json`.

### Changed
- **"Get Directions" link → pill button** — When a venue address is configured, the plain underline link is now a solid accent-colored rounded pill button (matching the RSVP/FAQ CTA style) with an inline map-pin icon; `uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl`.

## v0.4.0 — [Released] UI animations, hero collapse, nav island, About merged into Home (2026-05-27)

### Added
- **HeroCollapse component** — Desktop: full-screen hero slideshow that animates into a condensed vertical strip on first scroll; scattered polaroid-style photos fly in from off-screen left/right with staggered easing; single wheel event triggers full 900ms RAF animation (not scroll-position-driven); state machine (`full | animating | collapsed`); mobile renders a static non-collapsing hero. Files: `src/components/HeroCollapse.tsx`
- **FadeIn component** — Scroll-triggered entrance animations powered by IntersectionObserver; supports `fade`, `slide-up`, `slide-left`, `slide-right`, `scale`; configurable delay; used on timeline, schedule, wedding party, and home/about sections. Files: `src/components/FadeIn.tsx`, `src/hooks/useInView.ts`
- **HeartBurst component** — Double-click or double-tap anywhere on the page bursts 7 floating hearts from the cursor using CSS `@keyframes heart-float` with `--dx`/`--dy` custom properties. Files: `src/components/HeartBurst.tsx`
- **photoSrc helper** — `photoSrc(filename, size)` and `photoSrcSet(filename)` for responsive image loading; 5 breakpoints (thumb 320, small 640, medium 960, large 1280, xl 1920) via `?w=N` sharp resize; used across timeline, wedding party, hero slideshow. Files: `src/lib/photoSrc.ts`
- **Page transition animation** — `@keyframes page-enter` (fade + slight rise) applied via `key={pathname}` on `<main>` in AppShell; hero text has staggered 200/400/600/800ms entrance delays. Files: `src/app/globals.css`, `src/components/AppShell.tsx`
- **About section merged into Home page** — About content (Our Story, How We Met, The Venue, The Ceremony/Reception, FAQ) now lives at the bottom of the home page under `id="about"`. Nav "About" link changed to `/#about` hash link with auto-scroll. `/about` route redirects to `/#about` so old links still work. Files: `src/app/page.tsx`, `src/app/about/page.tsx`

### Changed
- **Navigation: banner → island animation** — Nav starts as a full-width frosted-glass banner (flush to all screen edges) on every page. On first scroll past 60px it smoothly morphs into a floating pill (rounded corners, centered, inset 16px from edges, content-width). Uses `position: fixed` with CSS-interpolatable `top`/`left`/`right` pixel/calc values — no snap. Pill width is measured from actual DOM logo + link widths. Home page always island (no banner state). `scrolled` state resets on every route change to avoid carry-over.
- **Nav + hero collapse in sync** — HeroCollapse dispatches `hero-collapsing` custom event at animation start and `hero-expanded` at expand start; Navigation listens and transitions simultaneously instead of waiting for the scroll jump.
- **Mobile nav island** — On screens ≤767px the island uses `16px` insets on both sides (full-width pill) so hamburger and Admin button are always enclosed.
- **Responsive images** — Timeline, wedding party, and hero slideshow now use `srcSet` at 5 breakpoints via `photoSrc.ts`; browser picks smallest image that covers the display size.
- **HeroSlideshow** — First image decoded via `img.decode()` before showing; remaining images preloaded silently in background; `fetchPriority="high"` on first slide.

### Fixed
- **`whitespace-nowrap` on nav links** — "Wedding Party" no longer word-wraps to two lines in island mode.
- **About hero image path** — Was using `/photos/` (broken in Docker volume setup); updated to `/api/photos/` to go through the dynamic photo-serving route.

## v0.3.4 — [Released] "Likely Not Coming" guest status (2026-05-25)

### Added
- **"Likely Not Coming" RSVP status** (`rsvp_status = 'likely_not_coming'`) — admin-only status for guests you know probably won't attend but still want to invite
- **Quick flag button (🙁)** on each guest row — one click to toggle the status without opening the edit modal
- **RSVP Status dropdown in Edit Guest modal** — full admin control: No Response / Attending / Declined / Likely Not Coming
- **"Likely Not Coming" stat card** — orange card added to both RSVP tab and Guest List tab stats
- **"Likely Not Coming" filter tab** — filter button in guest list to view only these guests
- **Row styling** — guests with this status show a light red/gray tinted row with muted text
- **Expected headcount exclusion** — "Expected Guests" stat excludes `likely_not_coming` guests from count
- **Seating chart exclusion** — `likely_not_coming` guests are filtered out of the seating chart sidebar entirely
- **Public RSVP override** — if a guest submits an RSVP (attending or declined), it overwrites `likely_not_coming` with their actual response

## v0.3.3 — [Released] Target registry bookmarklet import (2026-05-25)

### Added
- **Target registry bookmarklet import** — Target locks their API, so a browser bookmarklet scrapes items from the rendered Manage Registry page and downloads a CSV. Admin panel has an expandable instructions card (🎯 red) with a draggable bookmarklet link, step-by-step instructions, and an Upload CSV button
- **`/api/admin/registry-items/import-target`** — accepts `{ items: [] }` (JSON from bookmarklet) or `{ csv: string }` (CSV fallback); deduplicates by title; tags all items as store: `target`
- **CLAUDE.md "document everything" convention** — README + CHANGELOG + vault + git push + Docker push
- **CHANGELOG.md** — this file

## v0.3.2 — [Released] Seating chart overhaul and registry imports (2026-05-25)

### Added
- **Amazon registry CSV import** — Upload `.csv` from Amazon registry export; each row imports as a separate item with ASIN-based image URLs. Skips duplicates by title. (`/api/admin/registry-items/import`)
- **Seating chart: RSVP color mode** — Toggle between Party view (green/yellow party cohesion) and RSVP view (green = RSVPed, white = no response)
- **Seating chart: seat reorder modal** — Drag names within a table to set who sits next to who. Rendered via React portal (z:99999) so it always appears on top
- **Seating chart: drag seated person between tables** — Seat chips are now draggable; drop on another table moves that person individually. Splits a party → yellow warning appears
- **Seating chart: guest list filters** — Filter sidebar by side (bride/groom), RSVP status, invited status, and party size
- **Seating chart: snap-to-grid** — Tables snap to a 20px grid when dragging for easy alignment
- **RSVP guest list: bulk "Mark as Not Invited"** — Select guests → bulk uncheck invited status (with confirmation)
- **GitHub topics** — 20 topics added to the repository for discoverability
- **"Document everything" convention** — Defined in CLAUDE.md; includes README, vault, CHANGELOG, git push, and Docker push

### Fixed
- **Seating chart: room layer z-index** — Room SVG now renders before ReactFlow in the DOM so tables are never tinted by the room fill
- **Seating chart: room edges** — Always solid (removed dashed style)

---

## v0.3.1 — [Released] Registry redesign and admin panel additions (2026-05-25)

### Added
- **Registry page** — Redesigned with two tabs: Honeymoon Fund and Registry (product grid)
- **Registry Items admin tab** — Paste a Target or Amazon URL → auto-fetches OG metadata (title, image, description, price); edit before saving; grouped by store
- **Hero slideshow** — Toggle on/off, pick photos, set interval; crossfade with no black flash; dot indicators; `img.decode()` GPU-ready preloading
- **FAQ hyperlink support** — Markdown `[text](url)` in FAQ answers, with "🔗 Insert Link" button
- **WIP "Hidden from Nav"** — Second per-page toggle that removes a page from nav entirely (vs WIP which shows "coming soon")
- **Basic Mode** — Pre-release mode showing only Home/About/Timeline/Photos; optional venue sub-toggle
- **RSVP stats overhaul** — Total Attending (individual guests), Declined per-guest, Missing RSVPs card
- **Admin nav button** — Accent pill in site nav, visible only when logged in (desktop + mobile)
- **Photo thumbnail API** — `/api/photos/[filename]/thumb` (300×200, 70% quality)

### Fixed
- **iPhone hero crossfade** — Reveal-behind z-index technique + `img.decode()` eliminates black flash
- **Viewport height** — JS probe element technique fixes `vh` cross-browser issues on mobile

---

## v0.3.0 — [Released] Seating chart sidebar scroll and MiniMap visibility (2026-05-25)

### Fixed
- **Seating chart sidebar scroll broken**: Guest list never scrolled — the `div` wrapping `<ReactFlowProvider>` in `SeatingPage` was a flex item but not a flex container, so `SeatingCanvas`'s `flex-1` had no effect and the component grew to full content height (~1611px). The sidebar inherited that height and had `scrollHeight == clientHeight`, making scroll impossible. Fix: added `flex flex-col` to the wrapper div.
- **Seating chart MiniMap and Controls not visible**: Same root cause — ReactFlow canvas inflated to 1563px, putting Controls and MiniMap (positioned `bottom: 28px`) at y≈1750px, far below the 900px viewport and clipped by `overflow: hidden`. Fixed by the same one-line change above.
- **Previous attempt (`min-h-0` on list div, removing MiniMap style prop) was a no-op** for both bugs because the height chain was broken two levels up; those changes are kept as correct belt-and-suspenders hygiene but weren't the actual fix.

## v0.2.0 — [Released] Guest list CSV import fixes (2026-05-24)

### Added
- `address` field to `guest_list` table and admin UI
- CSV import upsert: Added / Updated / Failed result counts
- Proper quoted-field CSV parser (handles commas in addresses)

### Fixed
- Upsert now preserves `email`, `phone`, `invited`, `notes`, `side` on reimport
- Duplicate guest blocking unique index creation (case-insensitive index)
- RSVP submission syncs `email`, `phone`, `rsvp_status` back to `guest_list`

---

## v0.1.0 — [Released] Initial launch (2025-12-31)

### Added
- Public site: Home (countdown), About, Timeline, Wedding Party, Schedule, Photos, RSVP
- Admin panel: RSVP management, guest list, photo upload/reorder/heart, timeline editor, content editors, settings
- PostgreSQL database with Docker volumes for persistence
- Docker multi-stage build → GitHub Container Registry → Portainer deployment
