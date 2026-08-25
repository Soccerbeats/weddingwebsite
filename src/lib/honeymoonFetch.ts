/**
 * The outside world: driving times, weather, exchange rates, flights.
 *
 * Four services, all optional, all cached in Postgres, all behind the same two
 * rules:
 *
 *   1. A fetch that fails is never an error the page has to handle. Every
 *      function here returns what it has — cached, stale, or nothing — because
 *      "we could not reach OSRM" must never be the reason an itinerary will not
 *      render.
 *   2. Nothing is fetched twice. A day's hops do not change between page loads,
 *      September's climate averages do not change at all, and the public OSRM
 *      and Open-Meteo endpoints are free precisely because people are polite
 *      with them.
 *
 * Three of the four need no key (OSRM, Open-Meteo, exchangerate.host). Flight
 * lookup does, and says so rather than pretending.
 */
import pool from './db';
import { ensureHoneymoonTables } from './honeymoonDb';
import { safeFetch } from './safeFetch';
import type { Hop } from './honeymoonTimeline';
import type { LatLng } from './honeymoon';

/** Round coordinates before they become a cache key: 5dp is about a metre. */
function key(...parts: (string | number)[]): string {
    return parts.map((part) => (typeof part === 'number' ? part.toFixed(5) : part)).join('|');
}

/* ------------------------------------------------------------------ */
/* Driving times and road geometry (OSRM)                              */
/* ------------------------------------------------------------------ */

export interface RoadRoute {
    seconds: number;
    meters: number;
    /** The road itself, as [lat, lng] points, for the map to draw. */
    geometry: [number, number][] | null;
    from_cache: boolean;
}

/** How long a cached road time is trusted. Roads change slowly. */
const ROUTE_TTL_DAYS = 30;

const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';

/**
 * Driving time between two points, from cache or from OSRM.
 *
 * The straight-line number the itinerary used to show is honest about distance
 * and wrong about time: 47 km across Bali is two hours, and 47 km across
 * Singapore is twenty minutes. This asks a router.
 */
export async function roadRoute(
    from: LatLng, to: LatLng, mode: 'car' | 'bike' | 'foot' = 'car',
): Promise<RoadRoute | null> {
    await ensureHoneymoonTables();
    const cacheKey = key(from.lat, from.lng, to.lat, to.lng, mode);

    const cached = await pool.query(
        `SELECT seconds, meters, geometry FROM honeymoon_routes
         WHERE cache_key = $1 AND fetched_at > NOW() - INTERVAL '${ROUTE_TTL_DAYS} days'`,
        [cacheKey],
    );
    if (cached.rows[0]) {
        const row = cached.rows[0];
        return {
            seconds: Number(row.seconds) || 0,
            meters: Number(row.meters) || 0,
            geometry: Array.isArray(row.geometry) ? row.geometry : null,
            from_cache: true,
        };
    }

    // OSRM's demo server takes lon,lat — the opposite order to everything else
    // in this codebase, which is exactly the kind of thing to write down.
    const profile = mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';
    const url = `${OSRM_BASE}/route/v1/${profile}/`
        + `${from.lng},${from.lat};${to.lng},${to.lat}`
        + '?overview=full&geometries=geojson&alternatives=false&steps=false';

    try {
        const res = await safeFetch(url, { timeoutMs: 8000 });
        if (!res.ok) return await staleRoute(cacheKey);
        const body = await res.json() as {
            code?: string;
            routes?: { duration?: number; distance?: number;
                geometry?: { coordinates?: [number, number][] } }[];
        };
        const route = body.routes?.[0];
        if (body.code !== 'Ok' || !route) return await staleRoute(cacheKey);

        const geometry = (route.geometry?.coordinates ?? [])
            // Back to [lat, lng], which is what Leaflet and the rest of this
            // codebase speak.
            .map(([lng, lat]) => [lat, lng] as [number, number]);
        const result: RoadRoute = {
            seconds: Math.round(route.duration ?? 0),
            meters: Math.round(route.distance ?? 0),
            geometry: geometry.length ? geometry : null,
            from_cache: false,
        };

        await pool.query(
            `INSERT INTO honeymoon_routes (cache_key, mode, seconds, meters, geometry, fetched_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (cache_key) DO UPDATE
                SET seconds = $3, meters = $4, geometry = $5, fetched_at = NOW()`,
            [cacheKey, mode, result.seconds, result.meters, JSON.stringify(result.geometry)],
        );
        return result;
    } catch {
        return staleRoute(cacheKey);
    }
}

/**
 * An expired cache entry is better than nothing.
 *
 * A road time from six weeks ago is still roughly the road time; a blank is a
 * day card that says nothing. Only used when the live fetch failed.
 */
async function staleRoute(cacheKey: string): Promise<RoadRoute | null> {
    const stale = await pool.query(
        'SELECT seconds, meters, geometry FROM honeymoon_routes WHERE cache_key = $1',
        [cacheKey],
    );
    const row = stale.rows[0];
    if (!row) return null;
    return {
        seconds: Number(row.seconds) || 0,
        meters: Number(row.meters) || 0,
        geometry: Array.isArray(row.geometry) ? row.geometry : null,
        from_cache: true,
    };
}

/** A road route as the timeline's `Hop`. */
export function hopOf(route: RoadRoute | null): Hop | null {
    if (!route) return null;
    return { seconds: route.seconds, meters: route.meters, source: 'road' };
}

/* ------------------------------------------------------------------ */
/* Weather (Open-Meteo)                                                */
/* ------------------------------------------------------------------ */

export interface DayWeather {
    date: string;
    /** Forecast when the date is close enough; otherwise the month's normals. */
    kind: 'forecast' | 'climate';
    high: number | null;
    low: number | null;
    /** Millimetres of rain expected that day, or the month's daily average. */
    rain: number | null;
    /** Chance of rain, as a percentage, when the forecast gives one. */
    rain_chance: number | null;
    code: number | null;
}

/** Open-Meteo's forecast reaches 16 days; past that, climate is the honest answer. */
const FORECAST_HORIZON_DAYS = 16;
const WEATHER_TTL_HOURS = 6;
const CLIMATE_TTL_DAYS = 365;

function daysAhead(dateIso: string, today: string): number {
    const a = Date.parse(`${today}T00:00:00Z`);
    const b = Date.parse(`${dateIso}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
    return Math.round((b - a) / 86_400_000);
}

async function cachedWeather(cacheKey: string, maxAge: string): Promise<DayWeather | null> {
    const res = await pool.query(
        `SELECT payload FROM honeymoon_weather
         WHERE cache_key = $1 AND fetched_at > NOW() - INTERVAL '${maxAge}'`,
        [cacheKey],
    );
    const payload = res.rows[0]?.payload;
    return payload && typeof payload === 'object' ? payload as DayWeather : null;
}

async function storeWeather(cacheKey: string, value: DayWeather): Promise<void> {
    await pool.query(
        `INSERT INTO honeymoon_weather (cache_key, payload, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET payload = $2, fetched_at = NOW()`,
        [cacheKey, JSON.stringify(value)],
    );
}

/**
 * What the weather will be, or what it usually is.
 *
 * Two questions with one answer shape. Inside sixteen days it is a forecast;
 * beyond that — which is most of planning — it is the thirty-year normals for
 * that month, which is what you actually want when choosing between a beach day
 * and a temple day in a September you have not reached yet.
 */
export async function dayWeather(
    point: LatLng, dateIso: string, today: string,
): Promise<DayWeather | null> {
    await ensureHoneymoonTables();
    const ahead = daysAhead(dateIso, today);
    const forecastable = ahead >= -1 && ahead <= FORECAST_HORIZON_DAYS;
    const cacheKey = forecastable
        ? key('fc', point.lat, point.lng, dateIso)
        : key('cl', point.lat, point.lng, dateIso.slice(0, 7));

    const cached = await cachedWeather(
        cacheKey, forecastable ? `${WEATHER_TTL_HOURS} hours` : `${CLIMATE_TTL_DAYS} days`,
    );
    if (cached) return cached;

    try {
        const value = forecastable
            ? await fetchForecast(point, dateIso)
            : await fetchClimate(point, dateIso);
        if (!value) return null;
        await storeWeather(cacheKey, value);
        return value;
    } catch {
        // Whatever is in the cache, however old, beats an empty card.
        return cachedWeather(cacheKey, '3650 days');
    }
}

async function fetchForecast(point: LatLng, dateIso: string): Promise<DayWeather | null> {
    const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${point.lat}&longitude=${point.lng}`
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,'
        + 'precipitation_probability_max,weather_code'
        + `&start_date=${dateIso}&end_date=${dateIso}&timezone=auto`;
    const res = await safeFetch(url, { timeoutMs: 8000 });
    if (!res.ok) return null;
    const body = await res.json() as {
        daily?: {
            time?: string[]; temperature_2m_max?: (number | null)[];
            temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[];
            precipitation_probability_max?: (number | null)[]; weather_code?: (number | null)[];
        };
    };
    const daily = body.daily;
    if (!daily?.time?.length) return null;
    return {
        date: dateIso,
        kind: 'forecast',
        high: daily.temperature_2m_max?.[0] ?? null,
        low: daily.temperature_2m_min?.[0] ?? null,
        rain: daily.precipitation_sum?.[0] ?? null,
        rain_chance: daily.precipitation_probability_max?.[0] ?? null,
        code: daily.weather_code?.[0] ?? null,
    };
}

/**
 * The month's normals, from a decade of daily archive.
 *
 * Open-Meteo's archive is free and needs no key; ten years of one month is a
 * small enough request to make once and cache for a year. Averaged here rather
 * than asked for as a "climate" endpoint because the archive is the endpoint
 * that exists without a subscription.
 */
async function fetchClimate(point: LatLng, dateIso: string): Promise<DayWeather | null> {
    const month = dateIso.slice(5, 7);
    const thisYear = Number(dateIso.slice(0, 4));
    const highs: number[] = [];
    const lows: number[] = [];
    const rains: number[] = [];

    for (let year = thisYear - 10; year < thisYear; year += 1) {
        const start = `${year}-${month}-01`;
        // The 28th is in every month, and eleven days is plenty for a normal.
        const end = `${year}-${month}-28`;
        const url = 'https://archive-api.open-meteo.com/v1/archive'
            + `?latitude=${point.lat}&longitude=${point.lng}`
            + `&start_date=${start}&end_date=${end}`
            + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto';
        const res = await safeFetch(url, { timeoutMs: 8000 });
        if (!res.ok) continue;
        const body = await res.json() as {
            daily?: { temperature_2m_max?: (number | null)[];
                temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[] };
        };
        for (const value of body.daily?.temperature_2m_max ?? []) {
            if (typeof value === 'number') highs.push(value);
        }
        for (const value of body.daily?.temperature_2m_min ?? []) {
            if (typeof value === 'number') lows.push(value);
        }
        for (const value of body.daily?.precipitation_sum ?? []) {
            if (typeof value === 'number') rains.push(value);
        }
        // One year is enough to answer with; more is better but not worth a
        // slow page. The cache is annual, so the next request fills in.
        if (highs.length >= 28 * 3) break;
    }

    if (!highs.length) return null;
    const mean = (values: number[]) => (values.length
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
        : null);
    return {
        date: dateIso,
        kind: 'climate',
        high: mean(highs),
        low: mean(lows),
        rain: mean(rains),
        // A normal has no "chance today"; the share of wet days is the honest
        // equivalent and is what the label says.
        rain_chance: rains.length
            ? Math.round((rains.filter((mm) => mm >= 1).length / rains.length) * 100)
            : null,
        code: null,
    };
}

/** Open-Meteo's WMO codes, in the words a person would use. */
export function weatherLabel(code: number | null): string | null {
    if (code == null) return null;
    if (code === 0) return 'Clear';
    if (code <= 2) return 'Mostly sunny';
    if (code === 3) return 'Overcast';
    if (code <= 48) return 'Fog';
    if (code <= 57) return 'Drizzle';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    if (code <= 86) return 'Snow showers';
    return 'Thunderstorms';
}

/* ------------------------------------------------------------------ */
/* Exchange rates                                                      */
/* ------------------------------------------------------------------ */

const RATE_TTL_HOURS = 24;

/**
 * One rate, for one pair.
 *
 * A rate you typed (`manual`) is never overwritten: if you agreed 15,800 rupiah
 * to the dollar with the hotel, that is the number the budget should use, not
 * today's mid-market print.
 */
export async function exchangeRate(base: string, quote: string): Promise<number | null> {
    await ensureHoneymoonTables();
    const from = base.toUpperCase();
    const to = quote.toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
    if (from === to) return 1;
    const pair = `${from}${to}`;

    const stored = await pool.query('SELECT rate, manual, fetched_at FROM honeymoon_rates WHERE pair = $1', [pair]);
    const row = stored.rows[0];
    if (row?.manual) return Number(row.rate);
    if (row && Date.now() - new Date(row.fetched_at).getTime() < RATE_TTL_HOURS * 3600_000) {
        return Number(row.rate);
    }

    try {
        /*
         * open.er-api.com, not exchangerate.host.
         *
         * The obvious choice went behind an access key; this one is the same
         * data, still keyless, and returns every quote for a base in one call —
         * so a trip priced in three currencies is one request.
         */
        const res = await safeFetch(`https://open.er-api.com/v6/latest/${from}`, {
            timeoutMs: 8000,
        });
        if (!res.ok) return row ? Number(row.rate) : null;
        const body = await res.json() as { result?: string; rates?: Record<string, number> };
        if (body.result && body.result !== 'success') return row ? Number(row.rate) : null;
        const rate = body.rates?.[to];
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            return row ? Number(row.rate) : null;
        }
        await pool.query(
            `INSERT INTO honeymoon_rates (pair, rate, manual, fetched_at)
             VALUES ($1, $2, FALSE, NOW())
             ON CONFLICT (pair) DO UPDATE SET rate = $2, fetched_at = NOW()
             WHERE honeymoon_rates.manual = FALSE`,
            [pair, rate],
        );
        return rate;
    } catch {
        return row ? Number(row.rate) : null;
    }
}

/* ------------------------------------------------------------------ */
/* Flights                                                             */
/* ------------------------------------------------------------------ */

export interface FlightInfo {
    flight_no: string;
    airline: string | null;
    from_iata: string | null;
    to_iata: string | null;
    from_text: string | null;
    to_text: string | null;
    depart_time: string | null;
    arrive_time: string | null;
    depart_tz: string | null;
    arrive_tz: string | null;
    from_terminal: string | null;
    to_terminal: string | null;
    aircraft: string | null;
    /** Days between departure and arrival, for a red-eye. */
    arrive_day_offset: number;
}

/**
 * Look up a flight number.
 *
 * The one thing here that needs a key: AeroDataBox via RapidAPI, whose free
 * tier is generous enough for a honeymoon's worth of legs. Without
 * `FLIGHT_API_KEY` this returns `configured: false` and the UI says so, rather
 * than failing in a way that looks like a bug.
 */
export async function flightLookup(flightNumber: string, dateIso: string): Promise<{
    configured: boolean; flight: FlightInfo | null; error?: string;
}> {
    const apiKey = process.env.FLIGHT_API_KEY;
    if (!apiKey) return { configured: false, flight: null };

    const clean = flightNumber.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{2,3}\d{1,4}$/.test(clean)) {
        return { configured: true, flight: null, error: 'That does not look like a flight number' };
    }

    const host = process.env.FLIGHT_API_HOST || 'aerodatabox.p.rapidapi.com';
    const url = `https://${host}/flights/number/${clean}/${dateIso}`
        + '?withAircraftImage=false&withLocation=false';
    try {
        const res = await safeFetch(url, {
            timeoutMs: 9000,
            headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': host },
        });
        if (!res.ok) {
            return { configured: true, flight: null, error: `The lookup service said ${res.status}` };
        }
        const body = await res.json();
        const flight = parseFlight(body, clean, dateIso);
        return { configured: true, flight, error: flight ? undefined : 'No flight found that day' };
    } catch {
        return { configured: true, flight: null, error: 'Could not reach the lookup service' };
    }
}

interface RawAirport { iata?: string; icao?: string; name?: string; municipalityName?: string;
    timeZone?: string }
interface RawMovement { airport?: RawAirport; scheduledTime?: { local?: string; utc?: string };
    terminal?: string; quality?: string[] }
interface RawFlight { number?: string; airline?: { name?: string };
    departure?: RawMovement; arrival?: RawMovement;
    aircraft?: { model?: string } }

/**
 * AeroDataBox's shape, narrowed to what a leg needs.
 *
 * Exported for the check script: this is data-shape parsing, which is exactly
 * the kind of code that breaks silently when an API changes a field name.
 */
export function parseFlight(body: unknown, flightNumber: string, dateIso: string): FlightInfo | null {
    const list: RawFlight[] = Array.isArray(body)
        ? body as RawFlight[]
        : (body as { flights?: RawFlight[] })?.flights ?? [];
    const flight = list[0];
    if (!flight?.departure && !flight?.arrival) return null;

    // "2026-09-15 14:05+08:00" — a local time with its offset.
    const clockOf = (raw: string | undefined): string | null => {
        const match = /(\d{2}):(\d{2})/.exec(raw ?? '');
        return match ? `${match[1]}:${match[2]}` : null;
    };
    const dateOf = (raw: string | undefined): string | null => {
        const match = /(\d{4}-\d{2}-\d{2})/.exec(raw ?? '');
        return match ? match[1] : null;
    };

    const departLocal = flight.departure?.scheduledTime?.local;
    const arriveLocal = flight.arrival?.scheduledTime?.local;
    const departDate = dateOf(departLocal) ?? dateIso;
    const arriveDate = dateOf(arriveLocal) ?? departDate;
    const offset = Math.max(0, Math.round(
        (Date.parse(`${arriveDate}T00:00:00Z`) - Date.parse(`${departDate}T00:00:00Z`)) / 86_400_000,
    ));

    const place = (airport: RawAirport | undefined) => {
        if (!airport) return null;
        const name = airport.municipalityName || airport.name || airport.iata || null;
        return airport.iata && name && !name.includes(airport.iata)
            ? `${name} (${airport.iata})`
            : name;
    };

    return {
        flight_no: flight.number?.replace(/\s+/g, '') ?? flightNumber,
        airline: flight.airline?.name ?? null,
        from_iata: flight.departure?.airport?.iata ?? null,
        to_iata: flight.arrival?.airport?.iata ?? null,
        from_text: place(flight.departure?.airport),
        to_text: place(flight.arrival?.airport),
        depart_time: clockOf(departLocal),
        arrive_time: clockOf(arriveLocal),
        depart_tz: flight.departure?.airport?.timeZone ?? null,
        arrive_tz: flight.arrival?.airport?.timeZone ?? null,
        from_terminal: flight.departure?.terminal ?? null,
        to_terminal: flight.arrival?.terminal ?? null,
        aircraft: flight.aircraft?.model ?? null,
        arrive_day_offset: Number.isFinite(offset) ? offset : 0,
    };
}
