# Honeymoon UI rework and mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One place panel opened the same way from everywhere, a shared set of UI parts every honeymoon tab is built from, an itinerary whose timeline shows travel and start–end times under a toolbar that stays put, and a phone layout that can actually be used.

**Architecture:** A small kit (`src/app/admin/honeymoon/kit/`) holds the shared parts. The shell owns one `PlaceSheet` and exposes `openPlace(id)` / `newPlace()` through a context, so no tab renders its own place window again. Timeline maths stays in the pure `src/lib/honeymoonTimeline.ts` (tested by `check:honeymoon`); components own only pixels. Mobile is a CSS class on `<html>` (the mechanism Full screen already uses) plus a bottom tab bar, and the kit parts carry their own phone sizing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Leaflet, @dnd-kit, Playwright (manual UI check).

**Spec:** `docs/superpowers/specs/2026-10-05-honeymoon-ui-rework-design.md`

## Global Constraints

- No schema or data changes; `database/init.sql` untouched.
- Every time printed in the module follows `trip.time_format` (`'12h' | '24h'`).
- Touch targets on phone (< 768px): at least 44×44px. Inputs 16px on phone.
- Photos via `/api/photos/…` with `unoptimized`.
- Only primary/destructive actions inline on a bar; the rest behind ⋯ (`OverflowMenu`).
- Bubbly style: `rounded-full` buttons, `rounded-2xl` gray-50 fields, backdrop-blur overlays.
- Portalled overlays go to `<body>` (the admin frame is a fixed stacking context; anything inside it paints under the site nav).
- `/admin/honeymoon/stays` and `/admin/honeymoon/excursions` must keep working (bookmarks).
- Release: `v0.10.0`, one changelog entry, one push at the end.
- Checks green before push: `check:types`, `lint`, `check:honeymoon`, `check:changelog`, `check:photos`, `check:finance`, `check:seating`.

## Review Focus

1. **A place deleted while its panel is open** — the panel must close itself, not crash on a missing place. (Task 2 test.)
2. **An overnight flight** — must show on the departure day running to midnight *and* on the arrival day from midnight, never as a negative-width bar. (Task 4 test.)
3. **A leg with no times typed** — must not land at 00:00 as if planned; listed as "not timed yet". (Task 4 test.)
4. **Rotating a phone / resizing across 768px with the panel open** — the panel switches shape (drawer ↔ sheet) without losing what was being typed. (Task 2: one component, CSS-only shape change, so state survives.)
5. **Opening the Stays segment from an old `/stays` bookmark with filters remembered in localStorage** — lands on Stays with its own remembered sort/view, not Places' filters. (Task 5: per-segment pref keys kept.)

---

## File structure

**Create**
- `src/app/admin/honeymoon/kit/Segmented.tsx` — one segmented control.
- `src/app/admin/honeymoon/kit/TabToolbar.tsx` — sticky toolbar (left / right slots).
- `src/app/admin/honeymoon/kit/FilterButton.tsx` — "Filters (n)" button + popover/sheet panel + active chips.
- `src/app/admin/honeymoon/kit/RatingPills.tsx` — the rating buttons.
- `src/app/admin/honeymoon/kit/Hint.tsx` — ⓘ help popover.
- `src/app/admin/honeymoon/kit/Sheet.tsx` — drawer (md+) / bottom sheet (phone), portalled.
- `src/app/admin/honeymoon/kit/useTimeFormat.ts` — `fmtTime(hhmm)` per trip setting.
- `src/app/admin/honeymoon/kit/PlaceCard.tsx` — read-only card (grid) and `PlaceRow` (list).
- `src/app/admin/honeymoon/PlaceSheet.tsx` — the one place panel (view + inline edits + full form).
- `src/app/admin/honeymoon/PlaceSheetContext.tsx` — `usePlaceSheet()` → `{ openPlace, newPlace, close }`.
- `src/app/admin/honeymoon/PlacesHub.tsx` — Places with All · Stays · Excursions segments.
- `src/app/admin/honeymoon/MobileTabBar.tsx` — bottom tab bar + More sheet.
- `src/lib/honeymoonPlaceSheet.ts` — pure: which sections a place shows.
- `scripts/verify-honeymoon-ui.mts` — Playwright UI check.

**Modify**
- `src/lib/honeymoonTimeline.ts` — legs + markers in `clockLayout`; new `dayLegs`, `dayMarkers`, `daySequence`.
- `scripts/verify-honeymoon.mts` — new assertions.
- `src/app/admin/honeymoon/PlaceEditor.tsx` — becomes `PlaceForm` (no Modal), used inside `PlaceSheet`.
- `PlaceDrawer.tsx` — deleted (content moves into `PlaceSheet`).
- `HoneymoonShell.tsx` — tabs (9), PlaceSheet host, compact phone chrome, bottom bar, Overview layout.
- `ItineraryTab.tsx`, `DayShape.tsx` — toolbar, checks strip, legs in timeline, phone day-at-a-time, vertical timeline.
- `MapTab.tsx`, `TripMap.tsx` — filters → FilterButton, selection → PlaceSheet, legend chip, refit on first resize.
- `PlacesTab.tsx`, `StaysTab.tsx`, `ExcursionsTab.tsx` — onto kit; cards read-only; paste boxes behind buttons.
- `DashboardTab.tsx`, `ChecklistTab.tsx`, `TravelTab.tsx`, `GuideTab.tsx`, `SettingsTab.tsx`, `TodayTab.tsx`, `SearchPalette.tsx`, `CompareTable.tsx`, `CalendarView` (in ItineraryTab).
- `src/app/admin/honeymoon/places/page.tsx`, `stays/page.tsx`, `excursions/page.tsx`.
- `src/app/globals.css` — `html.hm-compact` rules (phone only).
- `package.json` — `check:honeymoon:ui`.
- `CHANGELOG.md`, `AGENTS.md`, `README.md`, wiki, vault page.

---

### Task 1: The kit

**Files:** Create everything under `kit/` except `PlaceCard.tsx`.

**Interfaces — Produces:**
```ts
// Segmented.tsx
export function Segmented<T extends string>(props: {
  value: T; onChange: (v: T) => void;
  options: { key: T; label: React.ReactNode; count?: number }[];
  size?: 'sm' | 'md'; ariaLabel: string; tone?: 'accent' | 'dark';
}): JSX.Element
// TabToolbar.tsx — sticky top-0 inside the shell's scroll container
export function TabToolbar(props: { left?: React.ReactNode; right?: React.ReactNode; below?: React.ReactNode }): JSX.Element
// FilterButton.tsx
export interface ActiveFilter { key: string; label: string; clear: () => void }
export function FilterButton(props: { active: ActiveFilter[]; onReset: () => void; children: React.ReactNode; title?: string }): JSX.Element
export function FilterChips(props: { active: ActiveFilter[] }): JSX.Element | null
// RatingPills.tsx
export function RatingPills(props: { value: PlaceRating; onChange: (next: PlaceRating) => void; size?: 'sm' | 'md' }): JSX.Element
// Hint.tsx
export function Hint(props: { children: React.ReactNode; label?: string }): JSX.Element
// Sheet.tsx
export function Sheet(props: { open: boolean; onClose: () => void; title: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; side?: 'right' | 'center'; modal?: boolean; guard?: () => boolean; width?: 'md' | 'lg' }): JSX.Element | null
// useTimeFormat.ts
export function formatClock(value: string | null | undefined, format: '12h' | '24h'): string
export function useTimeFormat(): (value: string | null | undefined) => string
```

- [ ] **Step 1:** Write `formatClock` test into `scripts/verify-honeymoon.mts` (new block "Time format"): `formatClock('09:30','12h') === '9:30 AM'`, `formatClock('21:05','24h') === '21:05'`, `formatClock(null,'24h') === ''`, `formatClock('9:5','12h')` returns input unchanged (malformed).
- [ ] **Step 2:** Run `npm run check:honeymoon` → fails (module missing).
- [ ] **Step 3:** Implement `useTimeFormat.ts`: `formatClock` uses `minutesOf` from `honeymoonToday` for validation, `formatTime` for 12h; hook reads `useHoneymoonApi().data?.trip.time_format`.
- [ ] **Step 4:** Implement the components:
  - `Segmented`: `inline-flex rounded-full border bg-white p-0.5`; buttons `rounded-full px-3 py-1.5 text-sm` (phone `min-h-11 px-4`), `aria-pressed`, active `bg-accent text-white` (tone dark → `bg-gray-900`). Horizontal scroll if it overflows (`overflow-x-auto max-w-full`).
  - `TabToolbar`: `sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-gray-50/90 backdrop-blur border-b border-gray-200/60 flex flex-wrap items-center gap-2`; left slot, `flex-1` spacer, right slot; `below` renders under the row (chips).
  - `FilterButton`: Button "⚲ Filters" + count badge; opens a popover (portalled, positioned under the button like `OverflowMenu`) from md up and a `Sheet` on phone (`useIsPhone`). Panel footer: "Reset" + "Done". `FilterChips`: removable pills `× label`.
  - `RatingPills`: three buttons from `RATINGS`, clicking the active one clears (`null`); `sm` = `px-2.5 py-1 text-xs` (phone min-h-11).
  - `Hint`: a 20px ⓘ button (44px hit area on phone via padding) opening a small popover; Escape/outside closes.
  - `Sheet`: `createPortal` to body, `z-[70]`. md+: fixed right panel `w-[min(30rem,100vw)] h-full` (or centered dialog when `side='center'`); phone: bottom sheet `max-h-[92dvh] rounded-t-3xl` with a drag handle, starts at `h-[55dvh]`, grows to full on handle tap or when content scrolls to top. `modal` (default true) draws the blurred backdrop; `modal={false}` draws none and closes on outside pointerdown unless the target is inside `[data-sheet-keep]`. Escape closes (respecting `guard`). Sticky header with title, `actions`, ×. Body `overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]`.
  - `useIsPhone()` (in `Sheet.tsx`, exported): `matchMedia('(max-width: 767px)')`, set after mount.
- [ ] **Step 5:** `npm run check:types && npm run check:honeymoon` → pass.
- [ ] **Step 6:** Commit `kit: segmented, toolbar, filters, rating pills, hint, sheet, time format`.

### Task 2: `PlaceSheet` and one way in

**Files:** Create `PlaceSheet.tsx`, `PlaceSheetContext.tsx`, `src/lib/honeymoonPlaceSheet.ts`. Modify `PlaceEditor.tsx` → export `PlaceForm`. Delete `PlaceDrawer.tsx` at the end of Task 3. Modify `HoneymoonShell.tsx` to host it.

**Interfaces — Produces:**
```ts
// honeymoonPlaceSheet.ts
export type SheetSection = 'plan' | 'where' | 'booking' | 'stay' | 'practical' | 'notes' | 'opinions' | 'photos' | 'nearby';
export function sheetSections(place: Pick<Place,'category'|'is_excursion'>): SheetSection[]
// PlaceSheetContext.tsx
export interface PlaceSheetApi { openPlace: (id: number) => void; newPlace: (defaults?: Partial<Place>) => void; close: () => void; openId: number | null }
export function PlaceSheetProvider(props: { children: React.ReactNode }): JSX.Element
export function usePlaceSheet(): PlaceSheetApi
// PlaceEditor.tsx
export function PlaceForm(props: { api: HoneymoonApi; place: Place | null; defaults?: Partial<Place>;
  onDone: (createdId?: number) => void; onCancel: () => void; registerGuard?: (guard: () => boolean) => void }): JSX.Element
```

- [ ] **Step 1: failing test** in `verify-honeymoon.mts`, block "Place sheet":
```ts
check('every place gets the same core sections, in order',
  sheetSections({ category: 'temple', is_excursion: false }).join() === 'plan,where,booking,practical,notes,opinions,photos,nearby');
check('a stay adds its stay section after booking',
  sheetSections({ category: 'stay', is_excursion: false }).join() === 'plan,where,booking,stay,practical,notes,opinions,photos,nearby');
check('an excursion is the same panel as any place',
  sheetSections({ category: 'activity', is_excursion: true }).join() === sheetSections({ category: 'temple', is_excursion: false }).join());
```
- [ ] **Step 2:** run → fails.
- [ ] **Step 3:** implement `sheetSections` (core list, insert `'stay'` after `'booking'` when `category === 'stay'`).
- [ ] **Step 4:** `PlaceForm` = the body of today's `PlaceEditor` with the `<Modal>` removed; Save/Cancel footer kept; `registerGuard(confirmDiscard)`; `defaults` prefill (name, category, is_excursion, links) for new places; `onDone(id)` after create (read the new id from `api.create` — extend `create` in `useHoneymoon.ts` to return the created row id when the route returns `{ id }`; check the route and keep `boolean` callers working by returning `number | true | false`… simpler: after create, `onDone()` and the sheet closes).
- [ ] **Step 5:** `PlaceSheet` — reads `openId` from context and `api.placeById.get(openId)`; **if the place has gone (deleted/undone) it calls `close()`** (Review Focus 1). Modes: `view` (default) and `edit` (renders `PlaceForm`), `new` (renders `PlaceForm` with `place=null`). Header: photo strip (cover photo / `image_url`), category chip, region, **name as `InlineText`**, status `MiniSelect`, `RatingPills`, actions = "Edit everything" + `OverflowMenu` (Remove from shortlist / Put back, Mark not an excursion / Mark excursion, Pin looks right, Delete). Body = `sheetSections(place)` rendered in order, moving the existing `PlaceDrawer` sections in and adding inline edits: Notes (`InlineText multiline`), Address (`InlineText`), Best time, Price note, Opening hours (`InlineText`), Cost (`InlineText` that parses with `priceValue` — same rule as the stays card), Region (`CustomisableSelect` as on the stays card). Plan section: days list (click → `router.push('/admin/honeymoon/itinerary?day=N')`) + "Add to day…" `MiniSelect` (creates a stop). Stay section: nights from `nightsAtBase`, booking check-in/out, last two `price_checks`. Empty sections show one "+ Add …" line. `Sheet` with `modal={false}` so the map stays usable; map containers carry `data-sheet-keep`.
- [ ] **Step 6:** Context provider in the shell, wrapping children inside `HoneymoonProvider`; `<PlaceSheet />` rendered once. Keep the `honeymoon:new-place` window event → `newPlace()`.
- [ ] **Step 7:** `npm run check:types && npm run check:honeymoon` → pass. Commit `place sheet: one panel, one way in`.

### Task 3: Every entry point calls `openPlace`

**Files:** `PlacesTab.tsx`, `MapTab.tsx`, `TripMap.tsx`, `ItineraryTab.tsx` (DayCard sleep line, StopRow name + ⋯ Edit, CalendarView, DayBar/DayClock `onOpenStop`), `SearchPalette.tsx`, `DashboardTab.tsx` (shortlist, links), `TodayTab.tsx`/`TodaySheet.tsx` (only the admin `TodayTab` wrapper, not the public share view), `StaysTab.tsx`, `ExcursionsTab.tsx`, `CompareTable.tsx`, `RateQueue.tsx` (optional "details").

- [ ] **Step 1:** Replace every `PlaceEditor`/`PlaceDrawer` usage and local `editing/viewing` state with `const { openPlace, newPlace } = usePlaceSheet()`. "+ Add" buttons call `newPlace()`.
- [ ] **Step 2:** Map: `selectPlace(id)` also calls `openPlace(id)`; delete the corner "selected place" card; pin `bindPopup` removed (the sheet is the popup); legs keep their popup.
- [ ] **Step 3:** Delete `PlaceDrawer.tsx`; `ast-grep run --pattern 'PlaceDrawer' src` and `--pattern '<PlaceEditor $$$/>' src` return nothing.
- [ ] **Step 4:** `check:types`, `lint`. Commit `every place click opens the same panel`.

### Task 4: Timeline maths — legs, markers, start–end

**Files:** Modify `src/lib/honeymoonTimeline.ts`; tests in `scripts/verify-honeymoon.mts`.

**Interfaces — Produces:**
```ts
export interface DayLeg { legId: number; label: string; mode: TravelMode; startMinutes: number | null; endMinutes: number | null; fromPrevDay: boolean; toNextDay: boolean }
export function dayLegs(day: Day, arrivals: { leg: TravelLeg; fromDay: Day }[]): DayLeg[]
export interface DayMarker { kind: 'check-out' | 'check-in'; label: string; minutes: number }
export function dayMarkers(dateIso: string | null, bookings: Booking[], placeName: (id: number | null) => string): DayMarker[]
export interface ClockLegItem { legId: number; label: string; mode: TravelMode; startMinutes: number; endMinutes: number; start: string; end: string; startPct: number; widthPct: number; fromPrevDay: boolean; toNextDay: boolean }
export interface ClockLayout { /* existing fields */ legs: ClockLegItem[]; markers: { kind: DayMarker['kind']; label: string; time: string; pct: number }[]; untimedLegs: DayLeg[]; untimedStopIds: number[] }
export function clockLayout(stops: Stop[], labelOf: (s: Stop) => string, extras?: { legs?: DayLeg[]; markers?: DayMarker[] }): ClockLayout
export interface SequenceSlice { kind: 'stop' | 'leg'; id: number; label: string; minutes: number; share: number; assumed: boolean; start: string | null; end: string | null; mode?: TravelMode }
export function daySequence(stops: Stop[], legs: DayLeg[], labelOf: (s: Stop) => string): SequenceSlice[]
```

- [ ] **Step 1: failing tests** (block "Timeline with travel"), using `makeStop`/`LEG_DEFAULTS`:
```ts
const flight = { ...LEG_DEFAULTS, id: 1, day_id: 10, mode: 'flight' as const, from_text: 'CLT', to_text: 'LIS', depart_time: '18:40', arrive_time: '08:15', arrive_day_offset: 1 };
const d1 = { id: 10, day_number: 1, title: null, notes: null, base_place_id: null, stops: [], travel: [flight] };
const d2 = { id: 20, day_number: 2, title: null, notes: null, base_place_id: null, stops: [], travel: [] };
const out = dayLegs(d1, []);
check('a red-eye runs to midnight on the day it leaves', out[0].startMinutes === 1120 && out[0].endMinutes === 1440 && out[0].toNextDay);
const land = dayLegs(d2, [{ leg: flight, fromDay: d1 }]);
check('and from midnight on the day it lands', land[0].startMinutes === 0 && land[0].endMinutes === 495 && land[0].fromPrevDay);
const bare = dayLegs({ ...d1, travel: [{ ...flight, depart_time: null, arrive_time: null, arrive_day_offset: 0 }] }, []);
const lay = clockLayout([], () => '', { legs: bare });
check('a leg with no times is not drawn at midnight', lay.legs.length === 0 && lay.untimedLegs.length === 1);
const s = [makeStop(1, null)]; s[0] = { ...s[0], start_time: '10:00', duration_minutes: 90 };
const withLeg = clockLayout(s, () => 'Temple', { legs: [{ legId: 5, label: '🚗 Ubud → Temple', mode: 'car', startMinutes: 540, endMinutes: 585, fromPrevDay: false, toNextDay: false }] });
check('the axis widens to take in the drive', withLeg.startMinutes === 540);
check('every stop item carries an end time', withLeg.items[0].end === '11:30');
const seq = daySequence(s, [{ legId: 5, label: 'drive', mode: 'car', startMinutes: 540, endMinutes: 585, fromPrevDay: false, toNextDay: false }], () => 'Temple');
check('the stacked bar puts the drive before the stop it leads to', seq.map((x) => x.kind).join() === 'leg,stop');
check('and gives the drive its real length', seq[0].minutes === 45 && !seq[0].assumed);
const marks = dayMarkers('2026-09-14', [{ ...BOOKING_FIXTURE, kind: 'stay', place_id: 7, check_out: '2026-09-14', check_out_time: '11:00', check_in: '2026-09-10' }], () => 'Villa');
check('check-out shows on the day you leave', marks.length === 1 && marks[0].kind === 'check-out' && marks[0].minutes === 660);
check('an untimed stop is reported, not hidden', clockLayout([makeStop(9, null)], () => 'x').untimedStopIds.join() === '9');
```
  (Add a `BOOKING_FIXTURE` constant beside `LEG_DEFAULTS` with every `Booking` field null/empty.)
- [ ] **Step 2:** run → fails.
- [ ] **Step 3:** implement. `dayLegs`: departing legs from `day.travel` (start = depart, end = offset>0 ? 1440 : arrive; if end < start on offset 0, treat as next day → end 1440, toNextDay); arrivals from the `arrivals` argument (start 0, end = arrive). Label `${icon} ${from} → ${to}`. `dayMarkers`: stay bookings whose `check_out === date` (time `check_out_time ?? '11:00'`? — **no default**: skip when no time) and `check_in === date`. `clockLayout`: compute stops as today; then include timed legs and markers in `first/last`; return `legs`, `markers`, `untimedLegs`, `untimedStopIds` (stops with `start_time == null`). `daySequence`: stop slices from `daySegments` with `start/end` from a `clockLayout` of the stops (null start/end for untimed); leg slices with `minutes = end-start` (assumed 60 when unknown); merge sorted by start (fromPrevDay first, unknown legs keep `sort_order` position at the front), recompute `share`.
- [ ] **Step 4:** run → pass (all existing timeline assertions still pass).
- [ ] **Step 5:** Commit `timeline: travel legs, check-in/out markers, start–end`.

### Task 5: Places hub (All · Stays · Excursions) and `PlaceCard`

**Files:** Create `PlacesHub.tsx`, `kit/PlaceCard.tsx`. Modify `PlacesTab.tsx`, `StaysTab.tsx`, `ExcursionsTab.tsx`, `places/page.tsx`, `stays/page.tsx`, `excursions/page.tsx`, `HoneymoonShell.tsx` (TABS).

**Interfaces — Produces:**
```ts
export function PlaceCard(props: { place: Place; selected?: boolean; onToggleSelect?: () => void; active?: boolean;
  onShowOnMap?: () => void; extra?: React.ReactNode; currency: string }): JSX.Element  // click → openPlace
export function PlaceRow(props: { place: Place; selected?: boolean; onToggleSelect?: () => void; dense?: boolean;
  trailing?: React.ReactNode; draggable?: boolean }): JSX.Element
export type PlacesSegment = 'all' | 'stays' | 'excursions'
export default function PlacesHub(props: { segment: PlacesSegment }): JSX.Element
```

- [ ] **Step 1:** `PlaceCard`: image (cover photo / `image_url`), checkbox, rank, name, status chip, booked nights line, price line (read-only, `stayPriceText` moved to `honeymoonBudget.ts`? — keep where it is and export), star/amenity chips, `RatingPills` (optimistic via `api.patchPlace`), ⋯ menu (Open, Show on map, Preview listing, Remove/Put back, Delete for good when removed). Whole card body is a button → `openPlace(place.id)`.
- [ ] **Step 2:** `PlaceRow` = today's Places list row, extracted, calling `openPlace`.
- [ ] **Step 3:** `PlacesHub` renders `TabToolbar` left = `Segmented` (All n · Stays n · Excursions n); routes: `/places` (all), `/places?segment=stays`, `/places?segment=excursions`; `/stays` and `/excursions` pages render `<PlacesHub segment="stays|excursions" />` (no redirect needed, URL stays valid). Segment change uses `router.replace`.
- [ ] **Step 4:** Each segment body (PlacesTab / StaysTab / ExcursionsTab) drops its own top row and puts its controls into the hub toolbar via a `toolbar` render prop: `{ right, below }`. Places: search field + FilterButton (source/region/type/status/review/pin) + sort `MiniSelect` + "+ Add" + ⋯ (Dense rows, Save view, Import, Exports, Assign regions). Stays: rating `Segmented` (All/👍/😐/👎/Unrated/Removed), view `Segmented` (Cards/Ranking/Compare), FilterButton (area) + sort, "+ Add stays" (opens a `Sheet` with the paste box), ⋯ (Price watch → `Sheet` with `<PriceWatch>`, Rate unrated, Get locations, Get photos, Clear ranking). Excursions: rating `Segmented`, FilterButton (type), "+ Add excursions" (paste `Sheet`), ⋯ (Rate unrated, Get photos).
- [ ] **Step 5:** Stays and Excursions cards → `PlaceCard`. Inline name/price/notes/area/type/cost editors on cards removed (they live in `PlaceSheet`).
- [ ] **Step 6:** Places counts row → one line "83 places · 83 pinned · 5 to review · 19 shortlisted · 8 booked" (each a filter shortcut).
- [ ] **Step 7:** Stays map: `TripMap` refits once on the first container resize if the user has not moved it (fixes world zoom); the grey block is the container being taller than Leaflet's last `invalidateSize` — the existing ResizeObserver path covers it once the refit runs after layout.
- [ ] **Step 8:** Shell TABS → `Overview · Today · Itinerary · Map · Places · Travel · Checklist · Guide · Settings`; Places active for `/places`, `/stays`, `/excursions`. `g s`/`g e` shortcuts still go to `/stays`, `/excursions`.
- [ ] **Step 9:** `check:types`, `lint`, `check:honeymoon`. Commit `places hub: stays and excursions as segments, one card`.

### Task 6: Itinerary

**Files:** `ItineraryTab.tsx`, `DayShape.tsx`.

- [ ] **Step 1:** Toolbar: `TabToolbar left={<>{view==='timeline' && <Segmented ariaLabel="Timeline shape" tone="dark" options={[{key:'bars',label:'▤ Stacked'},{key:'clock',label:'⏱ Clock'}]} …/>}<Segmented ariaLabel="View" options={Days/Timeline/Calendar} …/></>} right={<OverflowMenu items={[Print…, Export calendar (navigates to /api/admin/honeymoon/ics), Download offline copy]} />}`. Help sentence → `Hint`.
- [ ] **Step 2:** Checks strip: one collapsed row `⚠ {warnCount} to check · {stretches.length} stays` → expands to the existing two cards. Collapsed by default; remembered with `useLocalPref('hm-itin-checks', false)`.
- [ ] **Step 3:** `DayBar` takes `legs: DayLeg[]` and renders `daySequence`; leg slices use a striped background (`repeating-linear-gradient` on `#64748b`) with the mode icon; resize handles only between two stop slices; each slice shows `start–end` (via `useTimeFormat`) when known, else length.
- [ ] **Step 4:** `DayClock` takes `legs` and `markers`; adds a travel lane above the stop axis (bars from `layout.legs`, label `✈ CLT → LIS 18:40–→`); markers as dashed vertical lines with "Check-out 11:00"; labels print `start–end`; under it "Not timed yet: …" from `untimedStopIds` + `untimedLegs`. Clicking a leg scrolls to/opens its `TravelLegCard` (`document.getElementById('leg-'+id)?.scrollIntoView`).
- [ ] **Step 5:** `DayCard` in timeline mode passes `dayLegs(day, arrivals)` and `dayMarkers(dateIso(start, n), bookings, name)`; the leg cards collapse under a "Travel details" disclosure in timeline mode (they are now drawn on the timeline).
- [ ] **Step 6:** `check:types`, `lint`. Commit `itinerary: sticky toolbar, travel on the timeline`.

### Task 7: Map

**Files:** `MapTab.tsx`, `TripMap.tsx`.

- [ ] **Step 1:** Filters card → one row: country `MiniSelect` (trip-wide, stays visible), `FilterButton` (day, source, region, type, status), toggles `⚠ Unconfirmed` and `🗓 Itinerary` as small chips, base layer + colour-by into ⋯ "Map style". Status line → `FilterChips` + counts in one line.
- [ ] **Step 2:** Legend → a "Legend" chip bottom-left that expands.
- [ ] **Step 3:** Map root gets `data-sheet-keep` so clicking pins keeps the sheet open and swaps the place.
- [ ] **Step 4:** Split view right column uses `PlaceRow` (via `PlacesTab panel`).
- [ ] **Step 5:** Commit `map: filters button, legend chip, panel on pin`.

### Task 8: Overview and the remaining tabs

**Files:** `DashboardTab.tsx`, `HoneymoonShell.tsx`, `ChecklistTab.tsx`, `TravelTab.tsx`, `GuideTab.tsx`, `SettingsTab.tsx`, `TodayTab.tsx`.

- [ ] **Step 1:** Overview: remove `h-full min-h-[34rem]` / `flex-[n] min-h-0` fill; normal `grid` rows that size to content; shell's dashboard branch becomes the ordinary scroller. Download button → `TabToolbar right` ⋯.
- [ ] **Step 2:** Checklist: To do / Packing → `Segmented` in `TabToolbar`; sort + Suggest in right slot; row's date input → "Due ▸" chip (`<label>` wrapping a visually-hidden `input type=date`, shows `formatDate` or "Due"); on phone the chip moves under the text.
- [ ] **Step 3:** Travel: "A new journey" + paste box → `TabToolbar right` "+ New journey" (mode menu) and "Paste flights" (`Sheet`).
- [ ] **Step 4:** Guide, Settings: `TabToolbar` with section links (`Segmented` of anchors on Settings); help paragraphs → `Hint`.
- [ ] **Step 5:** Commit `overview and remaining tabs onto the kit`.

### Task 9: Mobile

**Files:** `globals.css`, `HoneymoonShell.tsx`, `MobileTabBar.tsx`, `ItineraryTab.tsx`, `DayShape.tsx`, `MapTab.tsx`, `CompareTable.tsx`, `StaysTab.tsx` (ranking buttons), `ChecklistTab.tsx`, `SettingsTab.tsx`.

- [ ] **Step 1:** CSS:
```css
@media (max-width: 767px) {
  html.hm-compact [data-site-nav], html.hm-compact [data-admin-topbar], html.hm-compact [data-demo-banner] { display: none; }
  html.hm-compact [data-admin-frame] { top: 0; }
}
```
  Shell adds/removes `hm-compact` on mount/unmount.
- [ ] **Step 2:** Phone top bar (52px): ← (link `/admin`), trip title (truncate), Search button (icon, 44px), ⋯ (saving state, shortcuts). Desktop header unchanged.
- [ ] **Step 3:** `MobileTabBar`: fixed bottom, `pb-[env(safe-area-inset-bottom)]`, five 44px+ items (Today, Itinerary, Map, Places, More); More opens a `Sheet` listing Overview, Travel, Checklist, Guide, Settings. Desktop pill strip hidden below md. Scroll container gets bottom padding for the bar.
- [ ] **Step 4:** Kit phone sizing: Button/MiniSelect/Segmented/OverflowMenu trigger `min-h-11` below md (in `ui.tsx` + kit), text 15px.
- [ ] **Step 5:** Itinerary on phone: day strip (`Segmented`-like horizontal scroller of day chips, plus ‹ › buttons, swipe left/right on the card via pointer events with a 60px threshold); only the selected day's card renders; `?day=N` honoured. Drag handles hidden on touch; stop ⋯ gains "Move up", "Move down", "Move to day…" (reusing `api.reorder('stops', …)` and the existing move-to-day). Timeline on phone renders `DayAgenda`: vertical list, time column 64px, blocks for stops and legs in time order with `start–end`, markers inline ("Check-out 11:00"), untimed at the bottom.
- [ ] **Step 6:** Map on phone: map fills between top bar and tab bar; Filters/Add/Fit as floating 44px buttons; the tools row collapses into ⋯; `PlaceSheet` opens as a half-height sheet.
- [ ] **Step 7:** Places on phone: rows only (no grid), toolbar scrolls horizontally; Compare → horizontally swipeable cards (`snap-x`); Ranking uses ↑/↓ buttons instead of drag.
- [ ] **Step 8:** Checklist rows full width with due chip below; Settings cards as `<details>` accordion below md.
- [ ] **Step 9:** Commit `mobile: compact chrome, bottom tabs, day-at-a-time itinerary, agenda timeline`.

### Task 10: UI check, screenshots, ship

**Files:** `scripts/verify-honeymoon-ui.mts`, `package.json`, `tsconfig.scripts.json` (exclude, like `verify-hero`), `CHANGELOG.md`, `AGENTS.md`, `README.md`, wiki, vault.

- [ ] **Step 1:** `verify-honeymoon-ui.mts` (env `BASE_URL`, default `http://localhost:3000`; logs in with `ADMIN_PASSWORD` unless `DEMO=1`):
  - for each entry point (Places row, Stays segment card, Excursions segment card, itinerary stop, itinerary sleep line, calendar cell → day → stop, ⌘K search, Overview shortlist, map split-view row) click and assert `[data-place-sheet]` is visible and its `data-sections` attribute equals the expected list for that place;
  - itinerary: scroll 1500px, assert the toolbar is in the viewport; assert Stacked/Clock's `x` < Days/Timeline/Calendar's `x`;
  - a day with a flight in Timeline (both shapes) contains `[data-leg-slice]`;
  - at 390×844 every tab: `scrollWidth <= innerWidth`; every visible control in `main` ≥ 44px tall and wide (allow-list: checkboxes inside rows that have a 44px label, Leaflet attribution);
  - Overview: no two `[data-card]` bounding boxes intersect.
- [ ] **Step 2:** run against a local dev server seeded with the demo data (`DATABASE_URL=…demo… npm run seed:demo -- --yes-wipe` into a throwaway `wed-fs-db` database, `DEMO_MODE` off so writes work) → fix until green.
- [ ] **Step 3:** screenshots of every tab at 1440×900 and 390×844 into the scratchpad; review them by eye.
- [ ] **Step 4:** all checks green; changelog `## v0.10.0 — [Released] The honeymoon portal, reorganised — and usable on a phone`; AGENTS.md (kit, PlaceSheet, hub, conventions: "never render your own place window — call `openPlace`"); README; wiki pages (Honeymoon, Features, Architecture); vault entity page.
- [ ] **Step 5:** commit, push, watch CI green. Tell Austin to Pull and redeploy in Portainer.
