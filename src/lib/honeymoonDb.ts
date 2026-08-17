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
    CategoryRow, Day, GuideNote, HoneymoonPayload, Place, Region, Stop, TravelLeg, Trip,
} from './honeymoon';

let ready: Promise<void> | null = null;

async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS honeymoon_trip (
            id INTEGER PRIMARY KEY DEFAULT 1,
            title TEXT NOT NULL DEFAULT 'Honeymoon',
            start_date DATE,
            home_currency TEXT NOT NULL DEFAULT 'USD',
            notes TEXT,
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
    // Preview image scraped from a listing's Open Graph tags.
    await pool.query('ALTER TABLE honeymoon_places ADD COLUMN IF NOT EXISTS image_url TEXT');

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
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
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

    const [tripRes, categoryRes, regionRes, placeRes, dayRes, stopRes, travelRes, noteRes]
        = await Promise.all([
        pool.query('SELECT * FROM honeymoon_trip WHERE id = 1'),
        pool.query('SELECT * FROM honeymoon_categories ORDER BY sort_order, label'),
        pool.query('SELECT * FROM honeymoon_regions ORDER BY sort_order, name'),
        pool.query('SELECT * FROM honeymoon_places ORDER BY sort_order, name'),
        pool.query('SELECT * FROM honeymoon_days ORDER BY day_number'),
        pool.query('SELECT * FROM honeymoon_stops ORDER BY day_id, sort_order, id'),
        pool.query('SELECT * FROM honeymoon_travel ORDER BY day_id, id'),
        pool.query('SELECT * FROM honeymoon_notes ORDER BY sort_order, id'),
    ]);

    const tripRow = tripRes.rows[0] ?? { id: 1, title: 'Honeymoon', home_currency: 'USD' };
    const trip: Trip = {
        id: 1,
        title: tripRow.title ?? 'Honeymoon',
        start_date: isoDate(tripRow.start_date),
        home_currency: tripRow.home_currency ?? 'USD',
        notes: tripRow.notes ?? null,
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
        rating: r.rating === 'yes' || r.rating === 'no' ? r.rating : null,
        image_url: r.image_url ?? null,
        sort_order: r.sort_order ?? 0,
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
    }));

    return { trip, categories, regions, places, days, notes };
}
