/**
 * The honeymoon tables' writable columns, and how a value for each is coerced.
 *
 * Shared by the CRUD route, which builds its SQL from these whitelists, and by
 * the offline overlay (`honeymoonOffline.ts`), which applies an edit made
 * without a connection to the saved payload the same way the server will apply
 * it later — so what you see offline is what lands.
 */
export type FieldKind = 'text' | 'number' | 'int' | 'nint' | 'bool' | 'date' | 'ref' | 'enum'
    | 'json' | 'jsonobj' | 'coord' | 'time' | 'money';

export interface Field {
    kind: FieldKind;
    values?: string[];
    /**
     * Value an unrecognised enum falls back to. Without this an unknown
     * category would land on whatever happens to be first in the list —
     * "Stay" — and a mis-typed place would then be offered as a day's
     * accommodation. Falling back to the neutral option is safer.
     */
    fallback?: string;
    /**
     * Keep an empty string as '' instead of turning it into NULL.
     *
     * Text normally nulls out when cleared, which is right for an optional note.
     * It is wrong for a NOT NULL column whose empty value is meaningful — the
     * country filter's "all countries" is exactly that, and nulling it made
     * clearing the filter fail against the constraint.
     */
    blankAsEmpty?: boolean;
}

export interface ResourceDef {
    table: string;
    fields: Record<string, Field>;
    required: string[];
}

export const RESOURCES: Record<string, ResourceDef> = {
    categories: {
        table: 'honeymoon_categories',
        fields: {
            key: { kind: 'text' },
            label: { kind: 'text' },
            color: { kind: 'text' },
            icon: { kind: 'text' },
            sort_order: { kind: 'int' },
        },
        required: ['key', 'label'],
    },
    regions: {
        table: 'honeymoon_regions',
        fields: {
            name: { kind: 'text' },
            // NOT NULL DEFAULT '' in the schema, so a blank has to arrive as an
            // empty string: without this the column takes a null and the insert
            // fails its constraint. A region whose country you do not know yet is
            // an ordinary thing to create — it is what "＋ Custom…" does whenever
            // the trip has no focus country — and it was returning a 500.
            country: { kind: 'text', blankAsEmpty: true },
            description: { kind: 'text' },
            center_lat: { kind: 'coord' },
            center_lng: { kind: 'coord' },
            sort_order: { kind: 'int' },
            boundary: { kind: 'json' },
        },
        required: ['name'],
    },
    places: {
        table: 'honeymoon_places',
        fields: {
            region_id: { kind: 'ref' },
            name: { kind: 'text' },
            // Free text, like source: a category you type in the editor has to
            // survive. An enum would silently coerce it to 'misc'. Blank is
            // normalised to 'misc' below rather than becoming NULL.
            category: { kind: 'text' },
            lat: { kind: 'coord' },
            lng: { kind: 'coord' },
            address: { kind: 'text' },
            description: { kind: 'text' },
            status: { kind: 'enum', values: ['idea', 'shortlisted', 'booked'] },
            price_note: { kind: 'text' },
            links: { kind: 'json' },
            photos: { kind: 'json' },
            // Free text, not an enum: a new batch of suggestions from a new
            // person should be labellable without a code change.
            source: { kind: 'text' },
            // Text rather than enum: an enum coerces an unknown value to a
            // fallback, and clearing a rating back to "unrated" has to survive
            // as NULL rather than snapping to 'yes'.
            rating: { kind: 'text' },
            rank: { kind: 'nint' },
            image_url: { kind: 'text' },
            is_excursion: { kind: 'bool' },
            archived: { kind: 'bool' },
            // Empty means "inherit from the region", so it must not become NULL.
            country: { kind: 'text', blankAsEmpty: true },
            needs_review: { kind: 'bool' },
            sort_order: { kind: 'int' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            cost_per: { kind: 'enum', values: ['night', 'person', 'total'], fallback: 'total' },
            opening_hours: { kind: 'text' },
            best_time: { kind: 'text' },
            ratings: { kind: 'jsonobj' },
            star_rating: { kind: 'money' },
            price_range: { kind: 'text' },
            amenities: { kind: 'json' },
        },
        required: ['name'],
    },
    days: {
        table: 'honeymoon_days',
        fields: {
            day_number: { kind: 'int' },
            title: { kind: 'text' },
            base_place_id: { kind: 'ref' },
            notes: { kind: 'text' },
        },
        required: ['day_number'],
    },
    stops: {
        table: 'honeymoon_stops',
        fields: {
            day_id: { kind: 'ref' },
            place_id: { kind: 'ref' },
            custom_label: { kind: 'text' },
            start_time: { kind: 'time' },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
            duration_minutes: { kind: 'nint' },
            outcome: { kind: 'text' },
            favourite: { kind: 'bool' },
            journal: { kind: 'text' },
            photos: { kind: 'json' },
        },
        required: ['day_id'],
    },
    travel: {
        table: 'honeymoon_travel',
        fields: {
            day_id: { kind: 'ref' },
            mode: { kind: 'enum', values: ['flight', 'boat', 'car', 'train', 'walk'] },
            from_text: { kind: 'text' },
            to_text: { kind: 'text' },
            depart_time: { kind: 'time' },
            arrive_time: { kind: 'time' },
            arrive_day_offset: { kind: 'int' },
            confirmation_ref: { kind: 'text' },
            notes: { kind: 'text' },
            from_lat: { kind: 'coord' },
            from_lng: { kind: 'coord' },
            to_lat: { kind: 'coord' },
            to_lng: { kind: 'coord' },
            sort_order: { kind: 'int' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            booked_by: { kind: 'text' },
            depart_tz: { kind: 'text' },
            arrive_tz: { kind: 'text' },
            flight_no: { kind: 'text' },
            from_terminal: { kind: 'text' },
            to_terminal: { kind: 'text' },
            aircraft: { kind: 'text' },
            journey_id: { kind: 'ref' },
            depart_date: { kind: 'date' },
            arrive_date: { kind: 'date' },
        },
        required: ['day_id'],
    },
    /** The ticket a set of legs belongs to. */
    journeys: {
        table: 'honeymoon_journeys',
        fields: {
            // NOT NULL DEFAULT '': an untitled journey is an ordinary thing, and
            // the UI shows its route instead.
            title: { kind: 'text', blankAsEmpty: true },
            kind: {
                kind: 'enum',
                values: ['flight', 'boat', 'car', 'train', 'walk'],
                fallback: 'flight',
            },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
        },
        required: [],
    },
    todos: {
        table: 'honeymoon_todos',
        fields: {
            text: { kind: 'text' },
            done: { kind: 'bool' },
            result: { kind: 'text' },
            category: { kind: 'text' },
            due_on: { kind: 'date' },
            sort_order: { kind: 'int' },
            kind: { kind: 'enum', values: ['task', 'packing'], fallback: 'task' },
            person: { kind: 'text' },
            place_id: { kind: 'ref' },
            day_id: { kind: 'ref' },
        },
        required: ['text'],
    },
    notes: {
        table: 'honeymoon_notes',
        fields: {
            title: { kind: 'text' },
            // Also NOT NULL DEFAULT '': emptying a guide note's text is a normal
            // edit on the Guide tab, and it was failing the same way.
            body: { kind: 'text', blankAsEmpty: true },
            category: { kind: 'text' },
            source: { kind: 'text' },
            sort_order: { kind: 'int' },
            region_id: { kind: 'ref' },
            place_id: { kind: 'ref' },
        },
        required: ['title'],
    },
    /*
     * The paperwork behind a booking.
     *
     * `kind` is an enum falling back to 'other' rather than to 'stay': a
     * mis-typed kind must not put a flight in the accommodation total.
     */
    bookings: {
        table: 'honeymoon_bookings',
        fields: {
            place_id: { kind: 'ref' },
            travel_id: { kind: 'ref' },
            stop_id: { kind: 'ref' },
            journey_id: { kind: 'ref' },
            kind: {
                kind: 'enum',
                values: ['stay', 'excursion', 'travel', 'table', 'other'],
                fallback: 'other',
            },
            provider: { kind: 'text' },
            confirmation: { kind: 'text' },
            url: { kind: 'text' },
            contact: { kind: 'text' },
            check_in: { kind: 'date' },
            check_out: { kind: 'date' },
            check_in_time: { kind: 'time' },
            check_out_time: { kind: 'time' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            cost_paid: { kind: 'money' },
            deposit_due_on: { kind: 'date' },
            cancel_by: { kind: 'date' },
            party_size: { kind: 'nint' },
            dress_code: { kind: 'text' },
            paid: { kind: 'bool' },
            documents: { kind: 'json' },
            notes: { kind: 'text' },
        },
        required: [],
    },
    documents: {
        table: 'honeymoon_documents',
        fields: {
            name: { kind: 'text' },
            kind: {
                kind: 'enum',
                values: ['passport', 'visa', 'insurance', 'ticket', 'vaccination',
                    'reservation', 'other'],
                fallback: 'other',
            },
            path: { kind: 'text' },
            place_id: { kind: 'ref' },
            travel_id: { kind: 'ref' },
            person: { kind: 'text' },
            expires_on: { kind: 'date' },
            notes: { kind: 'text' },
        },
        required: ['name', 'path'],
    },
    comments: {
        table: 'honeymoon_comments',
        fields: {
            place_id: { kind: 'ref' },
            // NOT NULL DEFAULT '' both: an unsigned comment and an empty one are
            // ordinary, and nulling either fails the constraint.
            author: { kind: 'text', blankAsEmpty: true },
            body: { kind: 'text', blankAsEmpty: true },
        },
        required: ['place_id'],
    },
    views: {
        table: 'honeymoon_views',
        fields: {
            name: { kind: 'text' },
            tab: { kind: 'text' },
            filters: { kind: 'jsonobj' },
            sort_order: { kind: 'int' },
        },
        required: ['name'],
    },
    rates: {
        table: 'honeymoon_rates',
        fields: {
            pair: { kind: 'text' },
            rate: { kind: 'number' },
            manual: { kind: 'bool' },
        },
        required: ['pair'],
    },
};

export const TRIP_FIELDS: Record<string, Field> = {
    title: { kind: 'text' },
    focus_country: { kind: 'text', blankAsEmpty: true },
    start_date: { kind: 'date' },
    end_date: { kind: 'date' },
    home_currency: { kind: 'text' },
    notes: { kind: 'text' },
    budget: { kind: 'money' },
    partner_names: { kind: 'text', blankAsEmpty: true },
    info: { kind: 'jsonobj' },
    time_format: { kind: 'enum', values: ['24h', '12h'], fallback: '24h' },
    distance_unit: { kind: 'enum', values: ['km', 'mi'], fallback: 'km' },
    phase: { kind: 'enum', values: ['planning', 'travelling', 'after'], fallback: 'planning' },
};

export function parseNumber(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw == null) return null;
    const cleaned = String(raw).trim();
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

export function coerce(field: Field, raw: unknown): unknown {
    switch (field.kind) {
        case 'text':
            if (raw == null || raw === '') return field.blankAsEmpty ? '' : null;
            return String(raw);
        case 'number':
            return parseNumber(raw) ?? 0;
        case 'int': {
            const n = parseNumber(raw);
            return n == null ? 0 : Math.trunc(n);
        }
        // Nullable int: 'int' falls back to 0, which is a real position and not
        // the same thing as "no position". A cleared rank has to be NULL.
        case 'nint': {
            const n = parseNumber(raw);
            return n == null ? null : Math.trunc(n);
        }
        case 'bool':
            return raw === true || raw === 'true' || raw === 1 || raw === '1';
        case 'date':
            return raw === '' || raw == null ? null : String(raw);
        // A cleared coordinate must persist as NULL, not 0 — 0,0 is a real point
        // in the Atlantic and would drag the map's fitBounds across the world.
        case 'coord':
            return parseNumber(raw);
        case 'ref': {
            const n = parseNumber(raw);
            return n != null && n > 0 ? Math.trunc(n) : null;
        }
        // Stored as TEXT "HH:MM"; anything that isn't that shape becomes null so
        // a malformed time can never masquerade as a real one.
        case 'time': {
            if (raw == null || raw === '') return null;
            const value = String(raw).trim();
            return /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : null;
        }
        case 'json':
            return JSON.stringify(Array.isArray(raw) ? raw : []);
        // An object rather than an array: per-person ratings, a view's filters,
        // the trip's info sections. Anything that isn't a plain object becomes
        // {} rather than reaching a JSONB column as a string or a list.
        case 'jsonobj':
            return JSON.stringify(
                raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {},
            );
        // NUMERIC, nullable: a cleared cost is "I don't know yet", which is not
        // zero. Sent as a string so pg hands it to NUMERIC without a float
        // rounding it on the way.
        case 'money': {
            const n = parseNumber(raw);
            return n == null ? null : n.toFixed(2);
        }
        case 'enum':
            if (field.values?.includes(String(raw))) return String(raw);
            return field.fallback ?? field.values?.[0] ?? null;
    }
}
