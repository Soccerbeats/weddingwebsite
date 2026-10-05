# Honeymoon second pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** A Files tab that is a real file explorer (with documents that genuinely work offline), a locked-until-tapped date calendar on touch screens, and the twelve fixes in the spec.

**Architecture:** Document logic is pure (`src/lib/honeymoonFiles.ts`, tested by `check:honeymoon`); the tab is `FilesTab.tsx` built from the existing kit; offline is a new cache in `public/honeymoon-sw.js` fed by a message from the Files tab. Everything else is targeted edits to existing components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-honeymoon-second-pass-design.md`

## Global Constraints

- No schema changes. Version **v0.10.1**. Push to `main` is the deploy.
- Every control ≥44px on a phone; every time through `useTimeFormat`; places open through `openPlace`.
- Documents stay private: nothing about them reaches the share link (`/honeymoon/<token>`).

## Review Focus

1. A document with no `expires_on` — no warning, and no crash in the sort.
2. A trip with no dates — expiry rules that need the trip's last day say nothing rather than guessing.
3. Uploading a file whose name says nothing ("IMG_2231.jpg") — kind falls back to the folder you are in, else Other.
4. Offline: a document deleted after it was cached is evicted, not served forever.
5. A mouse on a touch-screen laptop (`pointer: fine` primary) — the calendar is not locked.

---

### Task 1: `honeymoonFiles.ts` — pure document logic
**Files:** Create `src/lib/honeymoonFiles.ts`; test in `scripts/verify-honeymoon.mts`.
**Produces:**
```ts
guessDocumentKind(filename: string, fallback?: DocumentKind): DocumentKind
documentWarnings(docs: TripDocument[], trip: Pick<Trip,'start_date'|'end_date'>): DocWarning[]  // { documentId: number|null; level: 'warn'|'info'; message: string }
documentFolders(docs: TripDocument[]): { kinds: Folder[]; people: Folder[] }  // Folder { key; label; icon; count }
filterDocuments(docs, folder: string, query: string): TripDocument[]
```
- [ ] RED: assertions for each (passport.pdf→passport, "Boarding pass"→ticket, "AXA policy"→insurance, "IMG_2231"→fallback; passport expiring mid-trip → warn; within 6 months of end → warn; 8 months after → none; no passport → info; no trip dates → no expiry warnings; folders counted and ordered by DOCUMENT_KINDS; people incl. "Shared"; search matches name and notes, case-insensitive).
- [ ] GREEN, commit.

### Task 2: Files tab
**Files:** Create `FilesTab.tsx`, `files/page.tsx`; modify `HoneymoonShell.tsx` (TABS, `g f`), `MobileTabBar.tsx` (More), `SettingsTab.tsx` (remove Documents card + TripFiles import), delete `TripFiles.tsx`.
- [ ] Folders (sidebar md+, chip row on phone), Grid/List `Segmented` (useLocalPref `hm-files-view`), search, drop zone + "+ Add files" (kind = `guessDocumentKind(name, folderKind)`), tiles with thumbnail/PDF tile and warning badge, warnings banner, viewer `Sheet` (image / `<iframe>` PDF, ← → keys and buttons, editable fields via `InlineText`/`MiniSelect`/date input, for-what select of places + legs, Open, Delete).
- [ ] Commit.

### Task 3: Offline documents
**Files:** `public/honeymoon-sw.js`, `FilesTab.tsx`.
- [ ] SW: `FILES = 'honeymoon-files-v1'` in KEEP; message `{ type: 'honeymoon-sw:files', urls }` → fetch missing, delete cached ones not listed, reply `{ type: 'honeymoon-sw:files-done', saved, total }`; fetch handler: `/api/photos/` → network, fall back to FILES cache.
- [ ] FilesTab posts the list on load and on change, shows "Saved for offline: n of m".
- [ ] Commit.

### Task 4: Calendar lock on touch
**Files:** `DateRangePicker.tsx`.
- [ ] `matchMedia('(pointer: coarse)')` after mount → `locked` default true; locked = no `touch-none`, cell pointerdown ignored, quick-set hidden, header shows **Change dates**; unlocked shows **Done**, grid ring highlight. Commit.

### Task 5: The rest of the fixes
- [ ] A4 phone calendar cells (`CalendarCellBox` compact below md).
- [ ] A5 `PlaceForm` container queries (`@container` + `@md:`/`@2xl:`), Sheet `startTall` prop used in form mode, Cost/Hours help → `Hint`.
- [ ] A6 LegFields date/time `flex-col sm:flex-row`; stop add-row time input `min-w-0`.
- [ ] A7 TodaySheet `DayArrow` labels + disabled styling; TodayTab link to Files.
- [ ] A8 Sheet handle drag (pointer events: dy>80 close, dy<-60 tall).
- [ ] A9 TripMap `insetRight` padding when the sheet is open (MapTab passes 480 on md+).
- [ ] A10 `Button`/`Segmented`/`FilterButton`/`RatingPills`/`OverflowMenu` trigger: `active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none`, `motion-reduce:transform-none`.
- [ ] A11 Settings card descriptions → one line + `Hint`; remove "Adding places" card (tips into PlaceForm's Location `Hint`).
- [ ] Commit per group.

### Task 6: Checks, screenshots, ship
- [ ] `verify-honeymoon-ui.mts`: Files tab + More entry; Settings has no Documents; viewer opens; touch calendar locked; phone calendar fits; inner-overflow probe on every tab and in the leg editor; sheet swipe-down closes.
- [ ] Full suite + build; README screenshots retaken (`docs/images/honeymoon-*.jpg`); CHANGELOG v0.10.1; AGENTS.md; wiki; vault; push; CI green.
- [ ] Visual review document (before/after) published as an artifact.
