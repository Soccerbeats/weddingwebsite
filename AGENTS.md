# AGENTS.md

Agent-facing guide for this project, in the [agents.md](https://agents.md) format.
Human-facing docs live in `README.md` (front page) and the repository wiki; this
file carries the working agreements an agent needs to change the code without
breaking the project's conventions.

## Project overview

A Next.js 16 wedding website (App Router, Turbopack) with an admin panel for
content management. Black & white photography, gold accent (`#D4AF37`).
TypeScript, Tailwind 4 (CSS-based config — there is no `tailwind.config.js`),
Node 20, PostgreSQL 15. Content config is file-based JSON on a volume;
relational data (RSVPs, guest list, finances, honeymoon, seating) is
PostgreSQL. Deploys as a multi-stage Docker image to GHCR, pulled by Portainer.

## Setup commands

```bash
npm install
npm run dev        # http://localhost:3000, /admin (password = ADMIN_PASSWORD)
npm run build      # production build
```

Local runs need a Postgres to point at — any instance will do:

```bash
docker run -d --name wed-db -e POSTGRES_USER=wed -e POSTGRES_PASSWORD=wed \
  -e POSTGRES_DB=wed -p 5432:5432 postgres:15-alpine

DATABASE_URL=postgresql://wed:wed@localhost:5432/wed ADMIN_PASSWORD=dev npm run dev
```

`npm run dev` does not run `database/init.sql` (the container does, on every
boot), so apply it once by hand: `psql "$DATABASE_URL" < database/init.sql`.

The Docker dev stack (source mounted, hot reload) lives in `docker/`:

```bash
cp docker/.env.example docker/.env   # once, then edit
docker compose -f docker/docker-compose.yml up -d
```

## Checks — run before calling a change done

None need a network except `check:finance:db` (live database), so they are
cheap to run before a commit:

| Command | What it covers |
|---|---|
| `npm run check:types` | `tsc --noEmit` over the app *and* the scripts |
| `npm run lint` | ESLint |
| `npm run check:changelog` | The changelog parser against fixtures *and* the real `CHANGELOG.md` (56 assertions) |
| `npm run check:photos` | The photo route: thumbs, resizing, 404s, the traversal guard |
| `npm run check:finance` | Budget arithmetic |
| `npm run check:finance:db` | The same against a live database |
| `npm run check:finance:ui` | The finance UI's contracts |
| `npm run audit:finance` | A deeper sweep over the finance logic |
| `npm run check:honeymoon` | Distances, date maths, URL parsing, the calendar grid, `.ics` output, search ranking, seed integrity |

Seeds: `npm run seed:honeymoon` (bundles the Bali/Singapore travel guide,
idempotent — matches on place name, never reverts an edit) and
`npm run seed:demo -- --yes-wipe` (a completely fictional wedding;
**destructive**, demo instance only).

## The conventions that will bite you

1. **`CHANGELOG.md` is the source of truth for the version.** There is no
   version in `package.json`; the topmost `## vX.Y.Z` heading *is* the app's
   version — the admin panel's version button displays it and CI tags the
   image with it. Every substantive change gets an entry; the format, bump
   rules and traps are below, and `npm run check:changelog` enforces them.
2. **`database/init.sql` is the only committed copy of the schema.** It is
   idempotent (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
   throughout) and the image runs it on every boot. Some tables are also — or
   only — created at runtime by their owning code (`finance_*` in
   `src/lib/financeDb.ts`, `honeymoon_*` in `src/lib/honeymoonDb.ts`,
   `donations` in its route). **If you add one of those, add it to
   `init.sql` too, or a fresh install comes up without it.**
3. **Photos are served through `/api/photos/[filename]`, never `/photos/…`** —
   with `output: "standalone"`, files written into a volume at runtime are not
   served statically.
4. **The image name is sacred**: always
   `ghcr.io/soccerbeats/weddingwebsite:latest`, never any other name — the
   production Portainer stack is configured against it. (The demo's one-shot
   seeder is a separate image under its own name,
   `ghcr.io/soccerbeats/weddingwebsite-seeder:latest` — a different image,
   never a tag of the sacred name.)
5. **After every code change: deploy automatically — and deploying is just
   pushing.** Austin's standing instruction, overriding the older "only deploy
   when asked" gate in `deploy.md`. Push to `main`; CI builds and publishes the
   image. **Do not build and push it by hand** — two builds of the same commit
   both writing `:latest` leaves no answer to "which build is deployed". Do not
   wait to be asked.

### Changelog entry format

```
## vX.Y.Z — [Released|Unreleased] <title> (`branch`, YYYY-MM-DD HH:MM)
```

- Times are **UTC** — stamp with `date -u '+%Y-%m-%d %H:%M'`.
- Group changes under `### Added`, `### Changed`, `### Fixed` — the in-app
  viewer renders those three as coloured badges.
- Flip `[Unreleased]` → `[Released]` when it is pushed and deployed. Bump the
  patch on every deploy; minor/major only when Austin says so.
- **Never nest backticks inside a code span** — it cannot parse, and the
  result is raw `**` on screen in the viewer.
- Versions must be unique and descend down the file. Entries predating this
  convention carry a date but no time — do not backfill.

## Deployment

**Read `deploy.md` before you deploy.** The loop:

```bash
git add -A && git commit -m "describe the change"
git push origin main

gh run list --limit 1   # the "Wedding Planner" pipeline; ~3.5 minutes
# then Portainer: "Pull and redeploy" (manual, or via webhook)
```

That push is the deploy. `.github/workflows/ci-cd.yml` builds the app, checks
the changelog, builds the production image and publishes `latest`,
`v<version>` (the topmost `CHANGELOG.md` heading) and `sha-<short>` to GHCR. A
pull request gets the same build as a check and publishes nothing, so a broken
commit cannot reach the registry.

Building by hand is a **fallback only** — Actions down, or an image needed from
a working tree that is not pushed. It overwrites whatever CI published:

```bash
docker build --cache-from ghcr.io/soccerbeats/weddingwebsite:latest \
  --target production -t ghcr.io/soccerbeats/weddingwebsite:latest \
  -f docker/Dockerfile .
docker push ghcr.io/soccerbeats/weddingwebsite:latest
```

The Dockerfile runs `npm run build` internally — no local build step needed.

### Environment variables

Set in the Portainer stack (or `docker/.env` for local compose runs):

```env
DATABASE_URL=postgresql://user:password@db:5432/dbname
ADMIN_PASSWORD=securepassword
NODE_ENV=production
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=dbname
# optional — RSVP email notifications (nodemailer over SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=app-password
NOTIFICATION_EMAIL=couple@example.com
```

### Pre-deploy checklist

- [ ] TypeScript compiles; build finishes without errors or warnings
- [ ] No console errors in the browser
- [ ] Admin panel features tested (incl. uploads/display)
- [ ] Public pages tested, responsive on mobile
- [ ] Authentication flow and WIP toggles verified
- [ ] Image pushed, pulled and redeployed in Portainer, live site checked

### "Document everything"

When Austin says **"document everything"** after a feature, do all five, in
order, before the commit:

1. Update `README.md` — the relevant section, with step-by-step usage
2. Add a **version-stamped** `CHANGELOG.md` entry (rules above)
3. Update the vault at `/home/austin/vault/wiki/entities/wedding-website.md` —
   the feature's section, a dated bullet under **Decisions & History**, and
   any new API endpoints, config keys or data formats
4. Commit and push to GitHub
5. Nothing else — the push publishes the image (see *Deployment*)

## Architecture

### Where things live

- `src/app/` — public pages (`/`, about, our-story, wedding-party, schedule,
  photos, rsvp, registry, work-in-progress) and `/admin/*` (dashboard, rsvps —
  which also manages the guest list — photos, timeline, schedule, faqs,
  wedding-party, nav-cards, home, about, seating, finances, registry,
  honeymoon, changelog, settings, color, wip-control, login)
- `src/app/api/` — public routes (rsvp, photos/[filename], guest-verification,
  nav-cards, auth/*) and admin CRUD per feature
- `src/lib/` — `db.ts` (pg pool), `financeDb.ts` and `honeymoonDb.ts` (the
  runtime schema owners), `changelog.ts` (parses CHANGELOG.md for the in-app
  viewer), `demoSeed.ts` (the fictional-wedding generator)
- `public/config/*.json` — file-based content config, written by the admin at
  runtime (`site.json` settings/colors/dates, `photos.json`, `timeline.json`);
  a Docker volume, not in git
- `database/init.sql` — the schema (see conventions above)
- `docker/` — the Dockerfile, the dev/prod/demo compose stacks, `.env.example`
- `scripts/` — the check scripts and seeds, run via the package.json aliases

### Data storage

- **File-based (`public/config/`)** — content that is easily editable and
  portable: site settings, colours, dates, photo metadata, timeline.
- **PostgreSQL** — relational data and forms: `rsvps`, `guest_list`,
  `wip_toggles`, `donations`, the `finance_*` suite (settings, categories,
  items, subitems, payers, purchases, contributors, receipts), the
  `honeymoon_*` suite (trip, regions, places, days, stops, travel, todos,
  notes, categories), and seating (`floor_plans`, `floor_plan_room`,
  `floor_plan_walls`, `seating_tables`, `seat_assignments`).

### Key mechanisms

- **Auth** — one admin password (`ADMIN_PASSWORD`); bcrypt-hashed session in
  an HTTP-only cookie; `src/middleware.ts` protects `/admin/*` and redirects
  non-admins away from WIP pages.
- **Photo serving** — admin uploads land in the `public/photos` volume;
  `GET /api/photos/[filename]` serves them (with thumbs and resizing). Every
  `<Image>` uses `src=/api/photos/…` plus `unoptimized` (required for volume
  photos). The public gallery shows **only the hearted photos**, in the `order`
  the admin's drag-and-drop set — both fields live in `photos.json`.
- **Docker** — multi-stage (deps → dev | builder → production), standalone
  output, non-root `nextjs:nodejs` (UID 1001). On every boot `init-db.sh`
  waits for Postgres, then applies `database/init.sql`. Volumes hold
  `public/photos`, `public/config` and the postgres data — runtime uploads
  live in volumes, never in the image.
- **The demo instance** — runs the same image as production, so nothing is
  built for it. The "Demo Instance" workflow (push to main) only publishes
  the **seeder** image: the Dockerfile's `seeder` stage, under its own name.
  The demo stack's one-shot `seed` service pulls it and fills a *fresh* demo
  on first boot, skipping one that already has data (a hand run is still
  `npm run seed:demo -- --yes-wipe`). Updating the demo is the same act as
  production — pull the image, redeploy the stack. Nothing in CI touches the
  server: a draft of that workflow SSHed in to save the redeploy click, which
  would have let anyone able to push to this public repository run commands on
  the box that also hosts production.
- **Seating chart** (`/admin/seating`) — a React Flow (`@xyflow/react`)
  canvas: draw the room, drop tables, drag guests from `guest_list` into
  seats. A "party" is a guest with `plus_one_name` set — dragging one
  auto-fills the adjacent seat — and split parties are flagged in the UI.
- **Honeymoon portal** (`/admin/honeymoon`) — a private planner (map via
  Leaflet, day-by-day itinerary, travel legs, places/stays/excursions, guide
  notes).
  Admin-only by design: no public route, no WIP toggle.

## Code style

- Components PascalCase (`PhotoGallery.tsx`); pages and API routes lowercase
  (`page.tsx`, `route.ts`).
- TypeScript: interfaces for data structures, no `any`, prefer explicit
  function components over `React.FC`. In Next 16, `params` in dynamic routes
  is a **Promise**.
- Tailwind: order layout → sizing → spacing → colours → effects; semantic
  spacing (`gap-4`, `p-6`), arbitrary values sparingly.
- API routes: proper HTTP methods, consistent `{ success: true }` /
  `{ error: 'message' }` JSON, try-catch, validate input before processing.
- Theme: the accent is a CSS variable on `:root` (`--accent: #D4AF37`,
  `--accent-light: #F4E5C3`, `--accent-dark: #B8941F`), stored in
  `public/config/site.json` and edited in the admin's settings.

## Common tasks

**New public page** — 1) `src/app/<page>/page.tsx`, 2) add to the links array
in `src/components/Navigation.tsx`, 3) add to `publicPages` in
`src/app/admin/wip-control/page.tsx`, 4) editor page in
`src/app/admin/<page>/page.tsx`, 5) nav item in `src/app/admin/layout.tsx`.

**New file-based config** — JSON file in `public/config/`, an API route under
`src/app/admin/` that reads/writes it with `fs`, ensure the directory exists
before writing, volume-mounted in Docker.

**Images** — always:

```tsx
<Image src={`/api/photos/${filename}`} alt="..." fill unoptimized className="object-cover" />
```

## Debugging

- **Photos not displaying** — is the file in the volume
  (`docker exec <web> ls /app/public/photos`)? Does the URL use the
  `/api/photos/` prefix? Does the component have `unoptimized`?
- **Build errors** — Next 16 `params` is a Promise; `ENV` in the Dockerfile
  must be `ENV KEY=value`.
- **Data not persisting** — are the volumes mounted? Are permissions
  `nextjs:nodejs`? Does the API route create the directory before writing?
- **Auth issues** — is `ADMIN_PASSWORD` set? Is the cookie present (HttpOnly,
  SameSite)? Does the middleware redirect unauthenticated users to
  `/admin/login`?

## Known limitations

Photos and the database live in Docker volumes — backups are a separate
strategy. No CDN. A single admin user, no roles. All images are served
`unoptimized` for volume compatibility.
