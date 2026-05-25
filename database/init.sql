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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

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
