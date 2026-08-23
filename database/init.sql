-- Create RSVPs table
CREATE TABLE IF NOT EXISTS rsvps (
  id SERIAL PRIMARY KEY,
  guest_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  attending BOOLEAN NOT NULL,
  number_of_guests INTEGER DEFAULT 1,
  dietary_restrictions TEXT,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create work-in-progress toggles table
CREATE TABLE IF NOT EXISTS wip_toggles (
  id SERIAL PRIMARY KEY,
  page_path VARCHAR(255) NOT NULL UNIQUE,
  page_label VARCHAR(255) NOT NULL,
  is_wip BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create guest list table
CREATE TABLE IF NOT EXISTS guest_list (
  id SERIAL PRIMARY KEY,
  guest_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  party_size INTEGER DEFAULT 1,
  side VARCHAR(50),
  notes TEXT,
  invited BOOLEAN DEFAULT true,
  rsvp_status VARCHAR(50),
  plus_one_name VARCHAR(255),
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Idempotent migrations for columns added after initial deploy
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS plus_one_name VARCHAR(255);
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS party_members JSONB;
-- Added with the guest-list bulk editor; the API adds these at runtime too, and
-- the two must stay in step so a fresh database is not a column behind.
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS flag VARCHAR(20);
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS relationship VARCHAR(255);
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
-- Per-page "hidden from the nav" flag, added with the WIP controls. Created at
-- runtime by /api/wip-status too; both must stay in step.
ALTER TABLE wip_toggles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- ---------------------------------------------------------------------------
-- Donations against the honeymoon fund.
--
-- Mirrored by ensureDonationsTable() in src/app/api/admin/donations/route.ts,
-- which runs the same statements on first request. Both must stay in step — a
-- fresh database that has never had that route called still needs the table,
-- which is how the demo seed discovered it was missing here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER,
  guest_name TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  fund_item_id TEXT,
  fund_item_title TEXT,
  event TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE donations ADD COLUMN IF NOT EXISTS co_donors JSONB DEFAULT '[]'::jsonb;
-- A donation can be money, a physical gift, or both, so amount is not required.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS gift TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMP;
ALTER TABLE donations ALTER COLUMN amount SET DEFAULT 0;
ALTER TABLE donations ALTER COLUMN amount DROP NOT NULL;

-- Migrate plus_one_name into party_members and backfill remaining slots as null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_list' AND column_name = 'party_members'
  ) THEN
    -- For rows that have plus_one_name set but no party_members yet
    UPDATE guest_list
    SET party_members = (
      SELECT jsonb_agg(
        CASE
          WHEN idx = 0 THEN jsonb_build_object('name', plus_one_name)
          ELSE jsonb_build_object('name', NULL)
        END
      )
      FROM generate_series(0, party_size - 2) AS idx
    )
    WHERE plus_one_name IS NOT NULL
      AND plus_one_name <> ''
      AND party_members IS NULL
      AND party_size > 1;

    -- For rows with party_size > 1 but no plus_one_name and no party_members yet
    UPDATE guest_list
    SET party_members = (
      SELECT jsonb_agg(jsonb_build_object('name', NULL))
      FROM generate_series(1, party_size - 1)
    )
    WHERE (plus_one_name IS NULL OR plus_one_name = '')
      AND party_members IS NULL
      AND party_size > 1;
  END IF;
END $$;

-- Migrate dietary_restrictions from TEXT to JSONB
DO $$
BEGIN
  -- Only run if the column is still TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rsvps'
      AND column_name = 'dietary_restrictions'
      AND data_type = 'text'
  ) THEN
    -- Rename old column
    ALTER TABLE rsvps RENAME COLUMN dietary_restrictions TO dietary_restrictions_legacy;
    -- Add new JSONB column
    ALTER TABLE rsvps ADD COLUMN dietary_restrictions JSONB;
    -- Migrate existing non-empty text values into the new structure
    UPDATE rsvps
    SET dietary_restrictions = jsonb_build_array(
      jsonb_build_object(
        'name', guest_name,
        'note', dietary_restrictions_legacy,
        'vegetarian', false,
        'vegan', false,
        'gluten_free', false,
        'nut_allergy', false
      )
    )
    WHERE dietary_restrictions_legacy IS NOT NULL AND dietary_restrictions_legacy <> '';
  END IF;
END $$;

-- Seating chart tables
CREATE TABLE IF NOT EXISTS floor_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Main Floor Plan',
  room_width INTEGER,
  room_height INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seating_tables (
  id SERIAL PRIMARY KEY,
  floor_plan_id INTEGER REFERENCES floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  table_type TEXT NOT NULL DEFAULT 'round',
  seat_count INTEGER NOT NULL DEFAULT 8,
  x FLOAT NOT NULL DEFAULT 100,
  y FLOAT NOT NULL DEFAULT 100,
  rotation FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  id SERIAL PRIMARY KEY,
  seating_table_id INTEGER REFERENCES seating_tables(id) ON DELETE CASCADE,
  seat_index INTEGER NOT NULL,
  guest_list_id INTEGER REFERENCES guest_list(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT '',
  party_group_id INTEGER,
  UNIQUE(seating_table_id, seat_index)
);

CREATE TABLE IF NOT EXISTS floor_plan_room (
  id SERIAL PRIMARY KEY,
  floor_plan_id INTEGER REFERENCES floor_plans(id) ON DELETE CASCADE,
  vertices JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_plan_walls (
  id SERIAL PRIMARY KEY,
  floor_plan_id INTEGER REFERENCES floor_plans(id) ON DELETE CASCADE,
  x1 FLOAT NOT NULL,
  y1 FLOAT NOT NULL,
  x2 FLOAT NOT NULL,
  y2 FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Honeymoon portal
--
-- Mirrored by ensureHoneymoonTables() in src/lib/honeymoonDb.ts, which runs the
-- same statements on first request so an already-deployed database migrates
-- itself. Both must stay in step.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS honeymoon_trip (
  id INTEGER PRIMARY KEY DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'Honeymoon',
  start_date DATE,
  end_date DATE,
  home_currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  focus_country TEXT NOT NULL DEFAULT '',
  CONSTRAINT honeymoon_trip_singleton CHECK (id = 1)
);

INSERT INTO honeymoon_trip (id, title) VALUES (1, 'Honeymoon') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS honeymoon_regions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  description TEXT,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- lat/lng nullable: an unpinned place is still a real place.
CREATE TABLE IF NOT EXISTS honeymoon_places (
  id SERIAL PRIMARY KEY,
  region_id INTEGER REFERENCES honeymoon_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'misc',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  price_note TEXT,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  rating TEXT,
  image_url TEXT,
  is_excursion BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS honeymoon_days (
  id SERIAL PRIMARY KEY,
  day_number INTEGER NOT NULL UNIQUE,
  title TEXT,
  base_place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL,
  notes TEXT
);

-- ON DELETE SET NULL: deleting a place demotes its scheduled stops to plain
-- text rather than tearing holes in the itinerary.
CREATE TABLE IF NOT EXISTS honeymoon_stops (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES honeymoon_days(id) ON DELETE CASCADE,
  place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL,
  custom_label TEXT,
  start_time TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS honeymoon_travel (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES honeymoon_days(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'flight',
  from_text TEXT,
  to_text TEXT,
  depart_time TEXT,
  arrive_time TEXT,
  confirmation_ref TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS honeymoon_todos (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  result TEXT,
  category TEXT,
  due_on DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS honeymoon_notes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT,
  source TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE honeymoon_notes ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS rating TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS is_excursion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS focus_country TEXT NOT NULL DEFAULT '';

-- Where a travel leg starts and ends, once it has been looked up. Nullable: a
-- leg is useful as "DPS -> SIN, 14:05" long before anyone pins it, and the map
-- simply doesn't draw the ones it cannot place.
-- Where a stay sits in the shortlist's own ranking: 1 is your favourite, NULL
-- is unranked. Separate from sort_order on purpose — that one decides the order
-- of the whole place library, and ranking hotels must not reshuffle it.
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS rank INTEGER;

ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS from_lat DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS from_lng DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS to_lat DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS to_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS honeymoon_places_region_idx ON honeymoon_places (region_id);
CREATE INDEX IF NOT EXISTS honeymoon_stops_day_idx ON honeymoon_stops (day_id);
