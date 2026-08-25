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

-- One guest-list row per household name. The RSVP form and the CSV import both
-- upsert on this. Guarded: an existing database with duplicate names must not
-- fail to boot — it gets a NOTICE and the upsert path keeps failing loudly until
-- the duplicates are merged in the admin.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'guest_list_name_unique') THEN
    IF EXISTS (
      SELECT LOWER(guest_name) FROM guest_list GROUP BY LOWER(guest_name) HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'guest_list has duplicate names; guest_list_name_unique not created';
    ELSE
      CREATE UNIQUE INDEX guest_list_name_unique ON guest_list (LOWER(guest_name));
    END IF;
  END IF;
END $$;

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

-- Removed from the shortlist without being destroyed. A stay you have ruled out
-- is still worth keeping — you looked at it for a reason, and "why did we not
-- book that one?" is a question that comes back. Archived places are hidden from
-- the shortlist's ordinary buckets and from both maps, and reachable only
-- through the Removed bucket, which can restore them or delete them for good.
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- How many days after departure a leg lands: 0 for the same day, 1 for a
-- red-eye, more for a journey with a long layover. Relative to the leg's own
-- day rather than an absolute date, so inserting or reordering days — which
-- renumbers the whole trip — cannot leave an arrival stranded on the wrong one.
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS arrive_day_offset INTEGER NOT NULL DEFAULT 0;

ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS from_lat DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS from_lng DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS to_lat DOUBLE PRECISION;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS to_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS honeymoon_places_region_idx ON honeymoon_places (region_id);
CREATE INDEX IF NOT EXISTS honeymoon_stops_day_idx ON honeymoon_stops (day_id);

-- ---------------------------------------------------------------------------
-- Finance suite
--
-- Mirrored by createTables() in src/lib/financeDb.ts, which runs the same
-- statements once per process. Both must stay in step.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  adult_count INTEGER NOT NULL DEFAULT 0,
  minor_count INTEGER NOT NULL DEFAULT 0,
  plan_horizon_months INTEGER,
  paycheck_interval_days INTEGER NOT NULL DEFAULT 14,
  CONSTRAINT finance_settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_items (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 1,
  qty_source TEXT NOT NULL DEFAULT 'manual',
  use_subitems BOOLEAN NOT NULL DEFAULT FALSE,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_subitems (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES finance_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_payers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  share_pct NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_purchases (
  id SERIAL PRIMARY KEY,
  payer_id INTEGER REFERENCES finance_payers(id) ON DELETE SET NULL,
  item_id INTEGER REFERENCES finance_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  purchased_on DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_contributors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  pledged NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_receipts (
  id SERIAL PRIMARY KEY,
  contributor_id INTEGER NOT NULL REFERENCES finance_contributors(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES finance_items(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  received_on DATE,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_schedule (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES finance_items(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES finance_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'installment',
  amount NUMERIC NOT NULL DEFAULT 0,
  due_on DATE,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_snapshots (
  taken_on DATE PRIMARY KEY,
  budget_total NUMERIC NOT NULL DEFAULT 0,
  paid_total NUMERIC NOT NULL DEFAULT 0,
  bill_remaining NUMERIC NOT NULL DEFAULT 0,
  gift_received NUMERIC NOT NULL DEFAULT 0,
  still_to_spend NUMERIC NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_items ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_purchases ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_contributors ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_purchases ADD COLUMN IF NOT EXISTS receipt_path TEXT;
ALTER TABLE finance_contributors ADD COLUMN IF NOT EXISTS thank_you_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_contributors ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMP;
ALTER TABLE finance_purchases ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES finance_categories(id) ON DELETE SET NULL;
ALTER TABLE finance_receipts ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES finance_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_items_category_idx ON finance_items(category_id);
CREATE INDEX IF NOT EXISTS finance_purchases_category_idx ON finance_purchases(category_id);
CREATE INDEX IF NOT EXISTS finance_schedule_item_idx ON finance_schedule(item_id);
CREATE INDEX IF NOT EXISTS finance_schedule_category_idx ON finance_schedule(category_id);
CREATE INDEX IF NOT EXISTS finance_subitems_item_idx ON finance_subitems(item_id);
CREATE INDEX IF NOT EXISTS finance_receipts_contributor_idx ON finance_receipts(contributor_id);
INSERT INTO finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Honeymoon categories are rows so they can be renamed and deleted like
-- anything else; honeymoonDb.ts seeds the built-in list on first request.
CREATE TABLE IF NOT EXISTS honeymoon_categories (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  icon TEXT NOT NULL DEFAULT '●',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Honeymoon portal, second half
--
-- Bookings, documents, sharing and the fetch caches. Mirrored by
-- ensureHoneymoonTables() in src/lib/honeymoonDb.ts — both must stay in step.
-- ---------------------------------------------------------------------------

-- What a booking actually holds. `status = booked` on a place recorded *that*
-- something was booked and nothing else: no confirmation number, no money, no
-- date after which cancelling costs you. One table rather than four near-copies,
-- because a stay, an excursion, a flight and a dinner reservation ask the same
-- four questions — who with, what reference, how much, by when.
CREATE TABLE IF NOT EXISTS honeymoon_bookings (
  id SERIAL PRIMARY KEY,
  place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE CASCADE,
  travel_id INTEGER REFERENCES honeymoon_travel(id) ON DELETE CASCADE,
  stop_id INTEGER REFERENCES honeymoon_stops(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'stay',
  provider TEXT,
  confirmation TEXT,
  url TEXT,
  contact TEXT,
  check_in DATE,
  check_out DATE,
  check_in_time TEXT,
  check_out_time TEXT,
  cost NUMERIC(12, 2),
  cost_currency TEXT,
  cost_paid NUMERIC(12, 2),
  deposit_due_on DATE,
  cancel_by DATE,
  party_size INTEGER,
  dress_code TEXT,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Passports, visas, insurance, e-tickets. `path` is a filename in the photos
-- volume, served through /api/photos like every other upload.
CREATE TABLE IF NOT EXISTS honeymoon_documents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  path TEXT NOT NULL,
  place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL,
  travel_id INTEGER REFERENCES honeymoon_travel(id) ON DELETE SET NULL,
  person TEXT,
  expires_on DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Two people planning one trip: a place can be argued about in writing.
CREATE TABLE IF NOT EXISTS honeymoon_comments (
  id SERIAL PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES honeymoon_places(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

-- A read-only link for the other half of the couple. The token *is* the
-- credential, so it is random, revocable and can expire.
CREATE TABLE IF NOT EXISTS honeymoon_shares (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'today',
  expires_on DATE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP
);

-- A named set of filters — "Ubud eats", "Unpinned South Bali".
CREATE TABLE IF NOT EXISTS honeymoon_views (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT 'places',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Driving times and road geometry from OSRM, cached per coordinate pair: the
-- public demo server is free and rate-limited, and a day's hops do not change
-- between page loads.
CREATE TABLE IF NOT EXISTS honeymoon_routes (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'car',
  seconds INTEGER,
  meters INTEGER,
  geometry JSONB,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- Open-Meteo forecasts and climate averages, cached the same way.
CREATE TABLE IF NOT EXISTS honeymoon_weather (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- One rate per currency pair. `manual` marks a rate you typed, so a fetch never
-- overwrites the number you agreed to use.
CREATE TABLE IF NOT EXISTS honeymoon_rates (
  id SERIAL PRIMARY KEY,
  pair TEXT NOT NULL UNIQUE,
  rate NUMERIC(18, 8) NOT NULL,
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- Price history for a stay, so "it went up" is a fact and not a feeling.
CREATE TABLE IF NOT EXISTS honeymoon_price_checks (
  id SERIAL PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES honeymoon_places(id) ON DELETE CASCADE,
  price_note TEXT,
  amount NUMERIC(12, 2),
  currency TEXT,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- A whole trip, frozen as JSON. honeymoon_trip is a singleton, and threading a
-- trip_id through eleven tables to plan two trips at once is not the trade this
-- portal wants. A snapshot answers what the singleton cannot: keep the honeymoon
-- after you have flown home, and start the next trip from a copy of it.
CREATE TABLE IF NOT EXISTS honeymoon_archives (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Real money on a place, beside the free-text price note it replaces; cost_per
-- says what the number is per (night | person | total).
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS cost NUMERIC(12, 2);
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS cost_currency TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS cost_per TEXT NOT NULL DEFAULT 'total';
-- OSM's own opening_hours string, straight from the geocoder's extratags.
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS opening_hours TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS best_time TEXT;
-- Per-person ratings: { "Austin": "yes", "Heaven": "no" }. `rating` stays the
-- shared verdict, so nothing that already reads it has to change.
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS ratings JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Scraped from a listing's JSON-LD alongside the name and the image.
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS star_rating NUMERIC(3, 1);
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS price_range TEXT;
ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '[]'::jsonb;

-- How long you plan to be somewhere, which is what turns a list into a day.
ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
-- Post-trip: did | skipped, plus what it was actually like.
ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS favourite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS journal TEXT;
ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Legs were ORDER BY id, so one added late sorted last however early it departs.
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS cost NUMERIC(12, 2);
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS cost_currency TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS booked_by TEXT;
-- IANA zones. The leg home crosses them; Bali to Singapore does not.
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS depart_tz TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS arrive_tz TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS flight_no TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS from_terminal TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS to_terminal TEXT;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS aircraft TEXT;

-- A drawn boundary, so "which region is this place in" has a real answer.
ALTER TABLE honeymoon_regions ADD COLUMN IF NOT EXISTS boundary JSONB;

ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS budget NUMERIC(12, 2);
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS partner_names TEXT NOT NULL DEFAULT '';
-- Emergency numbers, embassy, insurance policy, the driver's WhatsApp.
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS time_format TEXT NOT NULL DEFAULT '24h';
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS distance_unit TEXT NOT NULL DEFAULT 'km';
-- planning | travelling | after — switches the portal's own emphasis.
ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'planning';

-- task | packing, and whose bag it goes in.
ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task';
ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS person TEXT;
-- "Book the Ubud driver" belongs to the Ubud day.
ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS place_id INTEGER
  REFERENCES honeymoon_places(id) ON DELETE SET NULL;
ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS day_id INTEGER
  REFERENCES honeymoon_days(id) ON DELETE SET NULL;

-- Which region or place a guide note is about.
ALTER TABLE honeymoon_notes ADD COLUMN IF NOT EXISTS region_id INTEGER
  REFERENCES honeymoon_regions(id) ON DELETE SET NULL;
ALTER TABLE honeymoon_notes ADD COLUMN IF NOT EXISTS place_id INTEGER
  REFERENCES honeymoon_places(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS honeymoon_bookings_place_idx ON honeymoon_bookings (place_id);
CREATE INDEX IF NOT EXISTS honeymoon_bookings_travel_idx ON honeymoon_bookings (travel_id);
CREATE INDEX IF NOT EXISTS honeymoon_bookings_stop_idx ON honeymoon_bookings (stop_id);
CREATE INDEX IF NOT EXISTS honeymoon_comments_place_idx ON honeymoon_comments (place_id);
CREATE INDEX IF NOT EXISTS honeymoon_documents_place_idx ON honeymoon_documents (place_id);
CREATE INDEX IF NOT EXISTS honeymoon_price_checks_place_idx ON honeymoon_price_checks (place_id);

-- ---------------------------------------------------------------------------
-- Journeys (v0.9.54)
--
-- Travel was modelled as a leg per day, which is backwards: a ticket is one
-- booking with one reference covering several legs — SAN → SEA → SIN → DPS is
-- *one* flight to enter, not three things to file onto three days. The legs
-- still hang off days, because everything that draws the trip reads them that
-- way; the journey is the thing you edit, and each leg's day follows from its
-- departure date instead of being picked.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS honeymoon_journeys (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'flight',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Null journey_id is a journey of one, so nothing needed migrating.
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS journey_id INTEGER
  REFERENCES honeymoon_journeys(id) ON DELETE SET NULL;
-- The dates a ticket actually states. day_id and arrive_day_offset are still
-- what the itinerary, the calendar and the print sheet read; these are the input
-- they are derived from.
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS depart_date DATE;
ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS arrive_date DATE;
-- One booking covers the whole ticket.
ALTER TABLE honeymoon_bookings ADD COLUMN IF NOT EXISTS journey_id INTEGER
  REFERENCES honeymoon_journeys(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS honeymoon_travel_journey_idx ON honeymoon_travel (journey_id);
CREATE INDEX IF NOT EXISTS honeymoon_bookings_journey_idx ON honeymoon_bookings (journey_id);
