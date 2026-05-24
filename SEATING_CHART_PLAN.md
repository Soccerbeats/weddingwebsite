# Seating Chart Feature — Implementation Plan

**Status**: 🟡 In Progress  
**Started**: 2026-05-24  
**Last Updated**: 2026-05-24

---

## Overview

A visual seating chart builder inside the wedding website admin panel. Drag-and-drop canvas to lay out venue tables, assign guests from the guest list, and get visual feedback about party cohesion.

---

## Tech Decisions

- **Canvas Library**: React Flow (`@xyflow/react`) — handles pan/zoom/drag, node-based canvas
- **Data Source**: Existing `guest_list` PostgreSQL table
- **Storage**: New PostgreSQL tables (no file-based config)
- **Scope**: Internal planning tool only (no export for now)

---

## Data Model

### New DB Tables (added via migration in `init.sql` / startup script)

```sql
-- One floor plan (can expand to multiple drafts later)
CREATE TABLE IF NOT EXISTS floor_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Main Floor Plan',
  room_width INTEGER,   -- optional, in feet
  room_height INTEGER,  -- optional, in feet
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Each table on the canvas
CREATE TABLE IF NOT EXISTS seating_tables (
  id SERIAL PRIMARY KEY,
  floor_plan_id INTEGER REFERENCES floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- "Table 1", "Sweetheart Table", etc.
  table_type TEXT NOT NULL,     -- 'round' | 'rectangular' | 'head'
  seat_count INTEGER NOT NULL DEFAULT 8,
  x FLOAT NOT NULL DEFAULT 100,
  y FLOAT NOT NULL DEFAULT 100,
  rotation FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Guest → seat assignments
CREATE TABLE IF NOT EXISTS seat_assignments (
  id SERIAL PRIMARY KEY,
  seating_table_id INTEGER REFERENCES seating_tables(id) ON DELETE CASCADE,
  seat_index INTEGER NOT NULL,  -- 0-based seat position around table
  guest_list_id INTEGER REFERENCES guest_list(id) ON DELETE SET NULL,
  UNIQUE(seating_table_id, seat_index)
);
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/seating/floor-plan` | Get floor plan + all tables + assignments |
| POST | `/api/admin/seating/floor-plan` | Create/update floor plan settings |
| POST | `/api/admin/seating/tables` | Add a table |
| PATCH | `/api/admin/seating/tables/[id]` | Update table (position, name, seat count, etc.) |
| DELETE | `/api/admin/seating/tables/[id]` | Remove table (cascades assignments) |
| POST | `/api/admin/seating/assign` | Assign guest(s) to seat(s) |
| DELETE | `/api/admin/seating/assign` | Unassign a guest from a seat |

---

## UI Components

### Page: `/admin/seating`

**Layout**: Two-panel
- **Left sidebar** (~280px): Guest list panel
  - Search/filter guests
  - Tabs: "Unassigned" / "All"
  - Guest chips showing name, party size, party color
  - Draggable onto canvas seats

- **Right canvas** (flex-fill): React Flow canvas
  - Room boundary (optional, shown if dimensions set)
  - Table nodes, each rendering seat slots
  - Toolbar: Add Table (round/rect/head), Room Settings, Clear
  - Zoom/pan controls

### Table Node Component

Renders inside React Flow as a custom node:
- **Round**: Circle SVG with N seat circles evenly distributed around perimeter
- **Rectangular**: Rectangle with seats along top/bottom edges
- **Head**: Single row of seats

Each seat slot shows:
- Empty: dashed circle
- Assigned: guest name chip with party color dot

### Party Cohesion Visual States

| State | Visual |
|-------|--------|
| Party all at same table | Seat chip has green left border |
| Party split across tables | Seat chip turns yellow background |
| Solo guest (party_size=1) | Normal, no indicator |

Party color: Each unique `party_id` (guests with same last name OR explicit party grouping) gets a consistent pastel color dot for visual scanning.

---

## Party Grouping Logic

**How we determine a "party"**: Guests in `guest_list` with `plus_one_name` set are treated as a 2-person party. The primary guest and their plus-one are linked.

**Drag behavior**:
- Drag a primary guest (with plus_one) onto a seat → auto-fills next adjacent seat with plus_one
- After auto-fill, each person can be moved independently
- If separated to different tables → both turn yellow

---

## Implementation Phases

### Phase 1 — DB + API + Basic Canvas ✅ TODO
- [ ] Add DB migration for 3 new tables
- [ ] Build all API routes
- [ ] Scaffold `/admin/seating` page with React Flow
- [ ] Add table nodes (round/rect/head) with seat slots rendering
- [ ] Add/drag/delete tables on canvas
- [ ] Save table positions on drag-end
- [ ] Add to admin nav

### Phase 2 — Guest Assignment ✅ TODO
- [ ] Guest list sidebar with unassigned filter
- [ ] Drag guest chip from sidebar → seat slot
- [ ] Click-to-assign as fallback (click seat → pick from dropdown)
- [ ] Unassign guest (click X on seat)
- [ ] Auto-fill plus_one to adjacent seat on party drag

### Phase 3 — Party Cohesion Visuals ✅ TODO
- [ ] Party color dots on all guest chips
- [ ] Green indicator when party is together at same table
- [ ] Yellow indicator when party is split
- [ ] Sidebar shows split-party warnings

### Phase 4 — Polish ✅ TODO
- [ ] Room dimensions settings panel
- [ ] Table rename inline
- [ ] Seat count adjustment
- [ ] Table rotation
- [ ] Mobile-friendly (basic)

---

## Files to Create/Modify

### New Files
- `src/app/admin/seating/page.tsx` — main page
- `src/app/api/admin/seating/floor-plan/route.ts`
- `src/app/api/admin/seating/tables/route.ts`
- `src/app/api/admin/seating/tables/[id]/route.ts`
- `src/app/api/admin/seating/assign/route.ts`
- `src/components/seating/TableNode.tsx`
- `src/components/seating/SeatSlot.tsx`
- `src/components/seating/GuestSidebar.tsx`
- `src/components/seating/PartyChip.tsx`

### Modified Files
- `src/app/admin/layout.tsx` — add nav item
- `src/lib/db.ts` or init SQL — add table migrations

---

## Progress Log

- **2026-05-24**: Plan written, starting Phase 1
