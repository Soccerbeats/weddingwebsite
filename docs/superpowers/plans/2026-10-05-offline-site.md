# The whole site, offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Every page of the site opens with no connection, showing the last saved content; writes fail with a clear offline message.
**Spec:** `docs/superpowers/specs/2026-10-05-offline-site-design.md`

## Global Constraints
- The image name, the deploy-by-push rule and the admin auth model are unchanged.
- The worker never saves a redirected response, an auth route, or a non-200.
- The warm-up pass never writes (the worker refuses non-GET from nested frames).

## Review Focus
1. A session that has expired while the site warms — admin pages must not be saved as the login page.
2. A redeploy — old code files are dropped only after the new ones are saved.
3. A page that is open in the invisible frame running its own OfflineManager — it must not start a second warm-up.
4. iOS "Lie-Fi" (a connection that hangs) — the 6-second timeout must fall back to the saved copy.
5. A guest's ordinary browser — no automatic full-site download.

### Task 1: `public/sw.js` and its rules (TDD via `scripts/verify-offline.mts`)
- [ ] Rules as pure functions (`routeFor`, `isCacheablePage`, `isStale`) exported under Node, tested first.
- [ ] Caches: site-pages-v1, site-static-v1, site-data-v1, site-photos-v1, honeymoon-files-v1; messages: `site-sw:precache`, `honeymoon-sw:files`, `site-sw:clear`.
- [ ] `honeymoon-sw.js` → `importScripts('/sw.js')`.

### Task 2: `src/lib/offline.ts` + `GET /api/offline/manifest`
- [ ] Page lists (public, admin); check that every `src/app/**/page.tsx` is listed or excluded.
- [ ] Manifest: buildId, static files from `.next/static` (production), icons/manifests, `/offline`, pages (admin only with a valid session).

### Task 3: Client — `OfflineManager` in AppShell, `/offline` page, admin sidebar status, logout clears
- [ ] Register `/sw.js` everywhere; offline bar; warm-up (standalone, stale, online, visible, top frame only); progress events; Save for offline button; logout posts `site-sw:clear`.
- [ ] Today/Files/SharedTodayView register `/sw.js`.

### Task 4: `scripts/verify-offline-ui.mts`, run against a production build
- [ ] Save for offline → network cut → every page renders → a write shows the offline message → logout clears.

### Task 5: Docs, changelog v0.10.3, CI step for `check:offline`, push
