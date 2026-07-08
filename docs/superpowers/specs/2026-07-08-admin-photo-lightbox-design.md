# Admin Photo Lightbox — Design

**Date:** 2026-07-08

## Goal

Give the admin Photos page the same photo viewer the public Photos page uses
(sliding carousel, zoom/pan, keyboard nav, low-q→full fade-in), but with admin
controls embedded: heart toggle, five "Set as Hero" targets, Edit Details, and
Delete. The existing per-tile hover overlay buttons stay — the viewer is
additive.

## Approach

Extract the lightbox currently embedded in `src/components/PhotoGallery.tsx`
into a reusable `src/components/PhotoLightbox.tsx`. Both the public gallery and
the admin page render it. This avoids maintaining two copies of the delicate
slide/zoom logic.

### `PhotoLightbox.tsx` (new)

Contains all viewing mechanics, moved verbatim from `PhotoGallery`:
slide carousel (3-slot window), zoom/pan, prefetch, keyboard nav, body-scroll
lock, portal to `<body>`.

**Props:**
- `photos: Photo[]` — the list to page through
- `index: number` — currently open photo (component is mounted only when open)
- `onClose: () => void`
- `onNavigate: (newIndex: number) => void` — controlled; parent owns the index
  so admin mutations (heart/delete) stay in sync
- `controls?: (photo: Photo) => React.ReactNode` — optional slot rendered as a
  toolbar inside the lightbox chrome. Public gallery omits it; admin supplies
  the button bar.

Internal view state (slot, zoom, pan, prefetch generation) resets on each open.

### `PhotoGallery.tsx` (refactor)

Becomes thin: fetch hearted photos → render grid → render `<PhotoLightbox>`
(no `controls`) with its own `selectedIndex` state. Public behavior must remain
byte-for-byte identical.

### Admin `src/app/admin/photos/page.tsx` (change)

- Add `viewerIndex: number | null` state.
- Each grid tile's body gets `onClick` → `setViewerIndex(index)`. The drag
  handle already captures its own pointer events, and the heart/overlay buttons
  `stopPropagation`, so no conflict.
- Existing hover overlay buttons stay unchanged.
- Render `<PhotoLightbox photos={photos} index={viewerIndex} ... controls={...}>`.
- The `controls` slot renders a compact bottom toolbar:
  - Heart toggle (reflects `photo.hearted` live)
  - Set Home Hero / Set About Hero / Set Footer Hero / Set Wedding Logo /
    Set Venue Photo (compact row)
  - Edit Details (opens the existing edit modal over the lightbox)
  - Delete
- Reuse existing handlers: `handleToggleHeart`, `setHero`, `handleEditPhoto`,
  `handleDelete`.
- Delete flow: remove the photo from `photos`; if it was the last remaining,
  close the viewer; otherwise clamp `viewerIndex` to a valid index.
- The admin viewer pages through **all** photos in current grid order, not just
  hearted ones.

## Success Criteria

- Clicking any admin grid tile opens the lightbox at that photo.
- Inside the lightbox: heart toggles and re-sorts; each Set-Hero updates config;
  Edit opens the modal; Delete removes and advances/closes correctly.
- Carousel, zoom, keyboard nav work in the admin viewer.
- Public `/photos` page is visually and behaviorally unchanged after the refactor.

## Out of Scope

- Changing the public gallery's appearance or behavior.
- New API endpoints (all handlers already exist).
- Reworking the hover overlay buttons.
