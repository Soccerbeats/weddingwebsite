/**
 * Honeymoon portal persistence.
 *
 * Same convention as financeDb: idempotent CREATE TABLE IF NOT EXISTS /
 * ADD COLUMN IF NOT EXISTS run once per process, so deploys migrate themselves
 * with no separate migration step.
 */
import pool from './db';
import { CATEGORIES } from './honeymoon';
import type {
    Booking, BookingKind, CategoryRow, CostPer, CurrencyRate, Day, DocumentKind, GuideNote,
    HoneymoonPayload, LatLng, Place, PlaceComment, Region, SavedView, ShareLink, ShareScope, Stop,
    PriceCheck, StopOutcome, TodoItem, TodoKind, TravelLeg, Trip, TripArchiveMeta, TripDocument,
    TripInfo,
} from './honeymoon';

let ready: Promise<void> | null = null;

async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_trip (
            id INTEGER PRIMARY KEY DEFAULT 1,
            title TEXT NOT NULL DEFAULT 'Honeymoon',
            start_date DATE,
            end_date DATE,
            home_currency TEXT NOT NULL DEFAULT 'USD',
            notes TEXT,
            focus_country TEXT NOT NULL DEFAULT '',
            CONSTRAINT honeymoon_trip_singleton CHECK (id = 1)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_regions (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT NOT NULL DEFAULT '',
            description TEXT,
            center_lat DOUBLE PRECISION,
            center_lng DOUBLE PRECISION,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    // lat/lng stay nullable: an unpinned place is still a real place, and
    // forcing a coordinate would mean inventing one.
    await pool.query(`
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
            archived BOOLEAN NOT NULL DEFAULT FALSE,
            country TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_days (
            id SERIAL PRIMARY KEY,
            day_number INTEGER NOT NULL UNIQUE,
            title TEXT,
            base_place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL,
            notes TEXT
        )
    `);
    // place_id is nullable and ON DELETE SET NULL so deleting a place demotes
    // its scheduled stops to plain text rather than tearing holes in the plan.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_stops (
            id SERIAL PRIMARY KEY,
            day_id INTEGER NOT NULL REFERENCES honeymoon_days(id) ON DELETE CASCADE,
            place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL,
            custom_label TEXT,
            start_time TEXT,
            notes TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
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
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_todos (
            id SERIAL PRIMARY KEY,
            text TEXT NOT NULL,
            done BOOLEAN NOT NULL DEFAULT FALSE,
            result TEXT,
            category TEXT,
            due_on DATE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_notes (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            category TEXT,
            source TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    // Added after the notes table shipped; harmless on a fresh database.
    await pool.query('ALTER TABLE honeymoon_notes ADD COLUMN IF NOT EXISTS source TEXT');
    // Interested / not interested on a candidate stay.
    await pool.query('ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS rating TEXT');
    await pool.query('ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS rank INTEGER');
    await pool.query(
        'ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS arrive_day_offset INTEGER NOT NULL '
        + 'DEFAULT 0',
    );
    // Coordinates for a travel leg's two ends — see database/init.sql.
    for (const column of ['from_lat', 'from_lng', 'to_lat', 'to_lng']) {
        await pool.query(
            `ALTER TABLE honeymoon_travel ADD COLUMN IF NOT EXISTS ${column} DOUBLE PRECISION`,
        );
    }
    // Preview image scraped from a listing's Open Graph tags.
    await pool.query('ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS image_url TEXT');
    await pool.query(
        'ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS is_excursion BOOLEAN NOT NULL DEFAULT FALSE',
    );
    // Removed from the shortlist but kept — see init.sql for why.
    await pool.query(
        'ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE',
    );
    await pool.query('ALTER TABLE honeymoon_todos ADD COLUMN IF NOT EXISTS result TEXT');
    await pool.query(
        "ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT ''",
    );
    await pool.query(
        "ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS focus_country TEXT NOT NULL DEFAULT ''",
    );
    // When you fly home. Nullable — a trip can be planned in relative days.
    await pool.query('ALTER TABLE honeymoon_trip ADD COLUMN IF NOT EXISTS end_date DATE');
    // Free-text notes on a day and on a stop: both columns shipped with the
    // original schema, so this is only here for databases created before it.
    await pool.query('ALTER TABLE honeymoon_days ADD COLUMN IF NOT EXISTS notes TEXT');
    await pool.query('ALTER TABLE honeymoon_stops ADD COLUMN IF NOT EXISTS notes TEXT');

    // Categories are rows so they can be renamed and deleted like anything else.
    // The built-in list seeds them once; after that the database is the truth,
    // and re-seeding never overwrites an edit.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_categories (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6b7280',
            icon TEXT NOT NULL DEFAULT '●',
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    for (const [index, category] of CATEGORIES.entries()) {
        await pool.query(
            `INSERT INTO honeymoon_categories (key, label, color, icon, sort_order)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING`,
            [category.key, category.label, category.color, category.icon, index],
        );
    }

    await pool.query(`
        INSERT INTO honeymoon_trip (id, title) VALUES (1, 'Honeymoon')
        ON CONFLICT (id) DO NOTHING
    `);

    /* --------------------------------------------------------------
     * The planner's second half: bookings, documents, sharing, caches.
     *
     * Everything below arrived with the improvement pass. Same rules as
     * above — idempotent, mirrored in database/init.sql.
     * ------------------------------------------------------------ */

    // What a booking actually holds. `status: booked` on a place said *that*
    // something was booked and nothing else; this is the confirmation number,
    // the money, and the date after which cancelling costs you.
    //
    // Polymorphic on purpose: a stay, an excursion, a flight and a dinner
    // reservation are the same four questions (who with, what reference, how
    // much, by when), so they are one table rather than four near-copies.
    await pool.query(`
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
        )
    `);

    // Passports, visas, insurance, e-tickets. `path` is a filename in the
    // photos volume, served through /api/photos like everything else.
    await pool.query(`
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
        )
    `);

    // Two people planning one trip: a place can be argued about in writing.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_comments (
            id SERIAL PRIMARY KEY,
            place_id INTEGER NOT NULL REFERENCES honeymoon_places(id) ON DELETE CASCADE,
            author TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // A read-only link for the other half of the couple. The token is the
    // credential, so it is random, revocable and can expire.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_shares (
            id SERIAL PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL DEFAULT '',
            scope TEXT NOT NULL DEFAULT 'today',
            expires_on DATE,
            revoked BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            last_seen_at TIMESTAMP
        )
    `);

    // A named set of filters — "Ubud eats", "Unpinned South Bali".
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_views (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            tab TEXT NOT NULL DEFAULT 'places',
            filters JSONB NOT NULL DEFAULT '{}'::jsonb,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Driving times and road geometry from OSRM, cached per coordinate pair:
    // the public demo server is free and rate-limited, and a day's hops do not
    // change between page loads.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_routes (
            id SERIAL PRIMARY KEY,
            cache_key TEXT NOT NULL UNIQUE,
            mode TEXT NOT NULL DEFAULT 'car',
            seconds INTEGER,
            meters INTEGER,
            geometry JSONB,
            fetched_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Open-Meteo forecasts and climate averages, cached the same way.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_weather (
            id SERIAL PRIMARY KEY,
            cache_key TEXT NOT NULL UNIQUE,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            fetched_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // One rate per currency pair. `manual` marks a rate you typed, so a fetch
    // never overwrites the number you agreed to use.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_rates (
            id SERIAL PRIMARY KEY,
            pair TEXT NOT NULL UNIQUE,
            rate NUMERIC(18, 8) NOT NULL,
            manual BOOLEAN NOT NULL DEFAULT FALSE,
            fetched_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Price history for a stay, so "it went up" is a fact and not a feeling.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_price_checks (
            id SERIAL PRIMARY KEY,
            place_id INTEGER NOT NULL REFERENCES honeymoon_places(id) ON DELETE CASCADE,
            price_note TEXT,
            amount NUMERIC(12, 2),
            currency TEXT,
            checked_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // A whole trip, frozen as JSON.
    //
    // honeymoon_trip is a singleton and threading a trip_id through eleven
    // tables to plan two trips at once is not the trade this portal wants. A
    // snapshot answers what the singleton cannot: keep the honeymoon after you
    // have flown home, and start the next trip from a copy of it.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_archives (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    /* Columns on the existing tables. */
    const columns: [string, string][] = [
        // Real money on a place, next to the free-text price note it replaces.
        ['honeymoon_places', 'cost NUMERIC(12, 2)'],
        ['honeymoon_places', 'cost_currency TEXT'],
        // night | person | total — what the number is per.
        ['honeymoon_places', "cost_per TEXT NOT NULL DEFAULT 'total'"],
        // OSM's own opening_hours string, straight from the geocoder.
        ['honeymoon_places', 'opening_hours TEXT'],
        // "sunset", "avoid weekends" — surfaced when you schedule it.
        ['honeymoon_places', 'best_time TEXT'],
        // Per-person ratings: { "Austin": "yes", "Heaven": "no" }. `rating`
        // stays the shared verdict, so nothing that reads it has to change.
        ['honeymoon_places', "ratings JSONB NOT NULL DEFAULT '{}'::jsonb"],
        // Scraped from a listing's JSON-LD alongside the name and image.
        ['honeymoon_places', 'star_rating NUMERIC(3, 1)'],
        ['honeymoon_places', 'price_range TEXT'],
        ['honeymoon_places', "amenities JSONB NOT NULL DEFAULT '[]'::jsonb"],
        // How long you plan to be there, which is what turns a list into a day.
        ['honeymoon_stops', 'duration_minutes INTEGER'],
        // Post-trip: did | skipped, plus what it was actually like.
        ['honeymoon_stops', 'outcome TEXT'],
        ['honeymoon_stops', 'favourite BOOLEAN NOT NULL DEFAULT FALSE'],
        ['honeymoon_stops', 'journal TEXT'],
        ['honeymoon_stops', "photos JSONB NOT NULL DEFAULT '[]'::jsonb"],
        // Legs were ORDER BY id, so a leg added late sorted last however early
        // it departs.
        ['honeymoon_travel', 'sort_order INTEGER NOT NULL DEFAULT 0'],
        ['honeymoon_travel', 'cost NUMERIC(12, 2)'],
        ['honeymoon_travel', 'cost_currency TEXT'],
        ['honeymoon_travel', 'booked_by TEXT'],
        // IANA zones. A leg home crosses them; Bali to Singapore does not.
        ['honeymoon_travel', 'depart_tz TEXT'],
        ['honeymoon_travel', 'arrive_tz TEXT'],
        ['honeymoon_travel', 'flight_no TEXT'],
        ['honeymoon_travel', 'from_terminal TEXT'],
        ['honeymoon_travel', 'to_terminal TEXT'],
        ['honeymoon_travel', 'aircraft TEXT'],
        // A drawn boundary, so "which region is this place in" is a real answer.
        ['honeymoon_regions', 'boundary JSONB'],
        ['honeymoon_trip', 'budget NUMERIC(12, 2)'],
        ['honeymoon_trip', "partner_names TEXT NOT NULL DEFAULT ''"],
        // Emergency numbers, embassy, insurance policy, the driver's WhatsApp.
        ['honeymoon_trip', "info JSONB NOT NULL DEFAULT '{}'::jsonb"],
        ['honeymoon_trip', "time_format TEXT NOT NULL DEFAULT '24h'"],
        ['honeymoon_trip', "distance_unit TEXT NOT NULL DEFAULT 'km'"],
        // planning | travelling | after — switches the portal's own emphasis.
        ['honeymoon_trip', "phase TEXT NOT NULL DEFAULT 'planning'"],
        // task | packing, and whose bag it goes in.
        ['honeymoon_todos', "kind TEXT NOT NULL DEFAULT 'task'"],
        ['honeymoon_todos', 'person TEXT'],
        // "Book the Ubud driver" belongs to the Ubud day.
        ['honeymoon_todos', 'place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL'],
        ['honeymoon_todos', 'day_id INTEGER REFERENCES honeymoon_days(id) ON DELETE SET NULL'],
        // Which region or place a guide note is about.
        ['honeymoon_notes', 'region_id INTEGER REFERENCES honeymoon_regions(id) ON DELETE SET NULL'],
        ['honeymoon_notes', 'place_id INTEGER REFERENCES honeymoon_places(id) ON DELETE SET NULL'],
    ];
    for (const [table, definition] of columns) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}`);
    }

    for (const [name, definition] of [
        ['honeymoon_bookings_place_idx', 'honeymoon_bookings (place_id)'],
        ['honeymoon_bookings_travel_idx', 'honeymoon_bookings (travel_id)'],
        ['honeymoon_bookings_stop_idx', 'honeymoon_bookings (stop_id)'],
        ['honeymoon_comments_place_idx', 'honeymoon_comments (place_id)'],
        ['honeymoon_documents_place_idx', 'honeymoon_documents (place_id)'],
        ['honeymoon_price_checks_place_idx', 'honeymoon_price_checks (place_id)'],
    ] as [string, string][]) {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${definition}`);
    }

    // Speeds up the map's "everything with coordinates" read once the library
    // is a few hundred rows deep.
    await pool.query(`
        CREATE INDEX IF NOT EXISTS honeymoon_places_region_idx ON honeymoon_places (region_id)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS honeymoon_stops_day_idx ON honeymoon_stops (day_id)
    `);
}

export function ensureHoneymoonTables(): Promise<void> {
    if (!ready) {
        ready = createTables().catch((error) => {
            // Let the next request retry rather than caching a failed migration.
            ready = null;
            throw error;
        });
    }
    return ready;
}

/* ------------------------------------------------------------------ */
/* Row coercion                                                        */
/* ------------------------------------------------------------------ */

/**
 * pg returns DOUBLE PRECISION as a number but DATE as a Date object, and JSONB
 * as already-parsed JSON. Normalise everything to the wire shape the client
 * expects so no component has to guess.
 */
function num(value: unknown): number | null {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown): string | null {
    if (!value) return null;
    // lib/db hands DATE columns back as `YYYY-MM-DD` text, so this is only a
    // trim. A Date here would depend on the server's time zone.
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

/** NUMERIC comes back from pg as a string, because it is exact and a float is not. */
function money(value: unknown): number | null {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/** A TIMESTAMP as an ISO string, or null. */
function isoStamp(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

function jsonObject<T extends object>(value: unknown, fallback: T): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as T;
        } catch { return fallback; }
    }
    return fallback;
}

/** Only the three ratings are ratings; anything else is "not judged". */
function personRatings(value: unknown): Record<string, 'yes' | 'mid' | 'no'> {
    const raw = jsonObject<Record<string, unknown>>(value, {});
    const out: Record<string, 'yes' | 'mid' | 'no'> = {};
    for (const [person, rating] of Object.entries(raw)) {
        if (rating === 'yes' || rating === 'mid' || rating === 'no') out[person] = rating;
    }
    return out;
}

/** A drawn boundary is only a boundary if it has three usable corners. */
function polygon(value: unknown): LatLng[] | null {
    const raw = jsonArray<unknown>(value);
    const points: LatLng[] = [];
    for (const point of raw) {
        const p = point as { lat?: unknown; lng?: unknown };
        const lat = num(p?.lat);
        const lng = num(p?.lng);
        if (lat != null && lng != null) points.push({ lat, lng });
    }
    return points.length >= 3 ? points : null;
}

function jsonArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed as T[] : [];
        } catch { return []; }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function getHoneymoonPayload(): Promise<HoneymoonPayload> {
    await ensureHoneymoonTables();

    const [
        tripRes, categoryRes, regionRes, placeRes, dayRes, stopRes, travelRes, noteRes, todoRes,
        bookingRes, documentRes, commentRes, viewRes, rateRes, shareRes, priceRes, archiveRes,
    ] = await Promise.all([
        pool.query('SELECT * FROM honeymoon_trip WHERE id = 1'),
        pool.query('SELECT * FROM honeymoon_categories ORDER BY sort_order, label'),
        pool.query('SELECT * FROM honeymoon_regions ORDER BY sort_order, name'),
        pool.query('SELECT * FROM honeymoon_places ORDER BY sort_order, name'),
        pool.query('SELECT * FROM honeymoon_days ORDER BY day_number'),
        pool.query('SELECT * FROM honeymoon_stops ORDER BY day_id, sort_order, id'),
        // Legs sort by hand-set order, then by when they leave — a leg added
        // late used to land at the bottom of the day however early it departs.
        pool.query(
            'SELECT * FROM honeymoon_travel ORDER BY day_id, sort_order, depart_time NULLS LAST, id',
        ),
        pool.query('SELECT * FROM honeymoon_notes ORDER BY sort_order, id'),
        pool.query('SELECT * FROM honeymoon_todos ORDER BY sort_order, id'),
        pool.query('SELECT * FROM honeymoon_bookings ORDER BY id'),
        pool.query('SELECT * FROM honeymoon_documents ORDER BY kind, name'),
        pool.query('SELECT * FROM honeymoon_comments ORDER BY created_at, id'),
        pool.query('SELECT * FROM honeymoon_views ORDER BY sort_order, name'),
        pool.query('SELECT * FROM honeymoon_rates ORDER BY pair'),
        pool.query('SELECT * FROM honeymoon_shares ORDER BY created_at DESC, id DESC'),
        // The two most recent price checks per place: enough for "up since last
        // time" without carrying a whole history nobody is looking at.
        pool.query(`
            SELECT place_id, amount, currency, price_note, checked_at FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY place_id ORDER BY checked_at DESC
                ) AS rn
                FROM honeymoon_price_checks
            ) ranked WHERE rn <= 2
        `),
        // The payloads are whole trips; a list of them only needs the shape.
        pool.query(`
            SELECT id, name, created_at,
                   COALESCE(jsonb_array_length(payload -> 'places'), 0) AS places,
                   COALESCE(jsonb_array_length(payload -> 'days'), 0) AS days
            FROM honeymoon_archives ORDER BY created_at DESC, id DESC
        `),
    ]);

    const tripRow = tripRes.rows[0] ?? { id: 1, title: 'Honeymoon', home_currency: 'USD' };
    const trip: Trip = {
        id: 1,
        title: tripRow.title ?? 'Honeymoon',
        start_date: isoDate(tripRow.start_date),
        end_date: isoDate(tripRow.end_date),
        home_currency: tripRow.home_currency ?? 'USD',
        notes: tripRow.notes ?? null,
        focus_country: tripRow.focus_country ?? '',
        budget: money(tripRow.budget),
        partner_names: tripRow.partner_names ?? '',
        info: jsonObject<TripInfo>(tripRow.info, {}),
        time_format: tripRow.time_format === '12h' ? '12h' : '24h',
        distance_unit: tripRow.distance_unit === 'mi' ? 'mi' : 'km',
        phase: tripRow.phase === 'travelling' || tripRow.phase === 'after'
            ? tripRow.phase : 'planning',
    };

    const categories: CategoryRow[] = categoryRes.rows.map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        color: r.color ?? '#6b7280',
        icon: r.icon ?? '●',
        sort_order: r.sort_order ?? 0,
    }));

    const regions: Region[] = regionRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country ?? '',
        description: r.description ?? null,
        center_lat: num(r.center_lat),
        center_lng: num(r.center_lng),
        sort_order: r.sort_order ?? 0,
        boundary: polygon(r.boundary),
    }));

    const places: Place[] = placeRes.rows.map((r) => ({
        id: r.id,
        region_id: r.region_id ?? null,
        name: r.name,
        category: r.category ?? 'misc',
        lat: num(r.lat),
        lng: num(r.lng),
        address: r.address ?? null,
        description: r.description ?? null,
        status: r.status ?? 'idea',
        price_note: r.price_note ?? null,
        links: jsonArray(r.links),
        photos: jsonArray(r.photos),
        source: r.source ?? 'manual',
        needs_review: r.needs_review === true,
        // Whitelisted rather than passed through: the column is plain TEXT, and
        // anything not a known rating is "not judged yet" rather than a value
        // the UI has to defend itself against.
        rating: r.rating === 'yes' || r.rating === 'mid' || r.rating === 'no' ? r.rating : null,
        image_url: r.image_url ?? null,
        is_excursion: r.is_excursion === true,
        archived: r.archived === true,
        country: r.country ?? '',
        rank: num(r.rank),
        sort_order: r.sort_order ?? 0,
        cost: money(r.cost),
        cost_currency: r.cost_currency ?? null,
        cost_per: (['night', 'person', 'total'].includes(r.cost_per)
            ? r.cost_per : 'total') as CostPer,
        opening_hours: r.opening_hours ?? null,
        best_time: r.best_time ?? null,
        ratings: personRatings(r.ratings),
        star_rating: money(r.star_rating),
        price_range: r.price_range ?? null,
        amenities: jsonArray<string>(r.amenities),
    }));

    const stopsByDay = new Map<number, Stop[]>();
    for (const r of stopRes.rows) {
        const stop: Stop = {
            id: r.id,
            day_id: r.day_id,
            place_id: r.place_id ?? null,
            custom_label: r.custom_label ?? null,
            start_time: r.start_time ?? null,
            notes: r.notes ?? null,
            sort_order: r.sort_order ?? 0,
            duration_minutes: num(r.duration_minutes),
            outcome: (r.outcome === 'did' || r.outcome === 'skipped'
                ? r.outcome : null) as StopOutcome,
            favourite: r.favourite === true,
            journal: r.journal ?? null,
            photos: jsonArray<string>(r.photos),
        };
        const list = stopsByDay.get(stop.day_id);
        if (list) list.push(stop); else stopsByDay.set(stop.day_id, [stop]);
    }

    const travelByDay = new Map<number, TravelLeg[]>();
    for (const r of travelRes.rows) {
        const leg: TravelLeg = {
            id: r.id,
            day_id: r.day_id,
            mode: r.mode ?? 'flight',
            from_text: r.from_text ?? null,
            to_text: r.to_text ?? null,
            depart_time: r.depart_time ?? null,
            arrive_time: r.arrive_time ?? null,
            confirmation_ref: r.confirmation_ref ?? null,
            notes: r.notes ?? null,
            arrive_day_offset: Math.max(0, Math.trunc(Number(r.arrive_day_offset) || 0)),
            from_lat: num(r.from_lat),
            from_lng: num(r.from_lng),
            to_lat: num(r.to_lat),
            to_lng: num(r.to_lng),
            sort_order: r.sort_order ?? 0,
            cost: money(r.cost),
            cost_currency: r.cost_currency ?? null,
            booked_by: r.booked_by ?? null,
            depart_tz: r.depart_tz ?? null,
            arrive_tz: r.arrive_tz ?? null,
            flight_no: r.flight_no ?? null,
            from_terminal: r.from_terminal ?? null,
            to_terminal: r.to_terminal ?? null,
            aircraft: r.aircraft ?? null,
        };
        const list = travelByDay.get(leg.day_id);
        if (list) list.push(leg); else travelByDay.set(leg.day_id, [leg]);
    }

    const days: Day[] = dayRes.rows.map((r) => ({
        id: r.id,
        day_number: r.day_number,
        title: r.title ?? null,
        base_place_id: r.base_place_id ?? null,
        notes: r.notes ?? null,
        stops: stopsByDay.get(r.id) ?? [],
        travel: travelByDay.get(r.id) ?? [],
    }));

    const notes: GuideNote[] = noteRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body ?? '',
        category: r.category ?? null,
        source: r.source ?? null,
        sort_order: r.sort_order ?? 0,
        region_id: r.region_id ?? null,
        place_id: r.place_id ?? null,
    }));

    const todos: TodoItem[] = todoRes.rows.map((r) => ({
        id: r.id,
        text: r.text,
        done: r.done === true,
        result: r.result ?? null,
        category: r.category ?? null,
        due_on: isoDate(r.due_on),
        sort_order: r.sort_order ?? 0,
        kind: (r.kind === 'packing' ? 'packing' : 'task') as TodoKind,
        person: r.person ?? null,
        place_id: r.place_id ?? null,
        day_id: r.day_id ?? null,
    }));

    const bookings: Booking[] = bookingRes.rows.map((r) => ({
        id: r.id,
        place_id: r.place_id ?? null,
        travel_id: r.travel_id ?? null,
        stop_id: r.stop_id ?? null,
        kind: (['stay', 'excursion', 'travel', 'table', 'other'].includes(r.kind)
            ? r.kind : 'other') as BookingKind,
        provider: r.provider ?? null,
        confirmation: r.confirmation ?? null,
        url: r.url ?? null,
        contact: r.contact ?? null,
        check_in: isoDate(r.check_in),
        check_out: isoDate(r.check_out),
        check_in_time: r.check_in_time ?? null,
        check_out_time: r.check_out_time ?? null,
        cost: money(r.cost),
        cost_currency: r.cost_currency ?? null,
        cost_paid: money(r.cost_paid),
        deposit_due_on: isoDate(r.deposit_due_on),
        cancel_by: isoDate(r.cancel_by),
        party_size: num(r.party_size),
        dress_code: r.dress_code ?? null,
        paid: r.paid === true,
        documents: jsonArray<string>(r.documents),
        notes: r.notes ?? null,
        created_at: isoStamp(r.created_at),
    }));

    const documents: TripDocument[] = documentRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: (['passport', 'visa', 'insurance', 'ticket', 'vaccination', 'reservation']
            .includes(r.kind) ? r.kind : 'other') as DocumentKind,
        path: r.path,
        place_id: r.place_id ?? null,
        travel_id: r.travel_id ?? null,
        person: r.person ?? null,
        expires_on: isoDate(r.expires_on),
        notes: r.notes ?? null,
        created_at: isoStamp(r.created_at),
    }));

    const comments: PlaceComment[] = commentRes.rows.map((r) => ({
        id: r.id,
        place_id: r.place_id,
        author: r.author ?? '',
        body: r.body ?? '',
        created_at: isoStamp(r.created_at),
    }));

    const views: SavedView[] = viewRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        tab: r.tab ?? 'places',
        filters: jsonObject<Record<string, unknown>>(r.filters, {}),
        sort_order: r.sort_order ?? 0,
    }));

    const rates: CurrencyRate[] = rateRes.rows.map((r) => ({
        id: r.id,
        pair: r.pair,
        rate: money(r.rate) ?? 0,
        manual: r.manual === true,
        fetched_at: isoStamp(r.fetched_at),
    }));

    const shares: ShareLink[] = shareRes.rows.map((r) => ({
        id: r.id,
        token: r.token,
        label: r.label ?? '',
        scope: (['today', 'itinerary', 'all'].includes(r.scope)
            ? r.scope : 'today') as ShareScope,
        expires_on: isoDate(r.expires_on),
        revoked: r.revoked === true,
        created_at: isoStamp(r.created_at),
        last_seen_at: isoStamp(r.last_seen_at),
    }));

    const archives: TripArchiveMeta[] = archiveRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        created_at: isoStamp(r.created_at),
        places: Number(r.places) || 0,
        days: Number(r.days) || 0,
    }));

    const price_checks: PriceCheck[] = priceRes.rows.map((r) => ({
        place_id: r.place_id,
        amount: money(r.amount),
        currency: r.currency ?? null,
        price_note: r.price_note ?? null,
        checked_at: isoStamp(r.checked_at),
    }));

    return {
        trip, categories, regions, places, days, notes, todos,
        bookings, documents, comments, views, rates, shares, price_checks, archives,
    };
}
