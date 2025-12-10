#!/bin/sh
# Wait for database to be ready
echo "Waiting for database to be ready..."
until node -e "const { Client } = require('pg'); const client = new Client(process.env.DATABASE_URL); client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));" 2>/dev/null; do
  sleep 1
done

echo "Database is ready, checking if tables exist..."

# Check if tables exist and create them if they don't
node -e "
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);

const schema = \`
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

CREATE TABLE IF NOT EXISTS wip_toggles (
  id SERIAL PRIMARY KEY,
  page_path VARCHAR(255) NOT NULL UNIQUE,
  page_label VARCHAR(255) NOT NULL,
  is_wip BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

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
\`;

client.connect()
  .then(() => client.query(schema))
  .then(() => {
    console.log('Database schema initialized successfully!');
    client.end();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error initializing database:', err);
    client.end();
    process.exit(1);
  });
"

echo "Database initialization complete!"
