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
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

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
