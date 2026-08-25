/**
 * Sunrise and sunset, from a coordinate and a date.
 *
 * Pure arithmetic — no API, no key, no network — because it is pure arithmetic:
 * the NOAA solar position algorithm, which is accurate to about a minute
 * anywhere that is not inside the Arctic circle. Worth having because half a
 * honeymoon's plans are lit by it: a sunrise hike, a sunset dinner, the ferry
 * that only runs in daylight.
 */

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Days since 2000-01-01 12:00 UTC, the epoch every solar term is measured from. */
function julianDay(date: Date): number {
    return date.getTime() / 86_400_000 + 2_440_587.5;
}

function fromJulian(julian: number): Date {
    return new Date((julian - 2_440_587.5) * 86_400_000);
}

/**
 * Sunrise, sunset and solar noon in UTC for a place and a date.
 *
 * Returns nulls for the polar cases — a day with no sunrise is a real answer,
 * and inventing one would be worse than saying so.
 */
export function sunTimes(lat: number, lng: number, dateIso: string): {
    sunrise: Date | null; sunset: Date | null; noon: Date; polar: 'day' | 'night' | null;
} {
    const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
    const noonUtc = Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0);
    const julian = julianDay(new Date(noonUtc));

    // Days since J2000, and the mean solar anomaly.
    const n = Math.round(julian - 2_451_545.0 + 0.0008 - lng / 360);
    const meanSolarNoon = 2_451_545.0 + 0.0008 + n + lng / -360;
    const anomaly = (357.5291 + 0.98560028 * (meanSolarNoon - 2_451_545)) % 360;
    const centre = 1.9148 * Math.sin(toRad(anomaly))
        + 0.02 * Math.sin(toRad(2 * anomaly))
        + 0.0003 * Math.sin(toRad(3 * anomaly));
    const eclipticLongitude = (anomaly + centre + 180 + 102.9372) % 360;
    const transit = meanSolarNoon
        + 0.0053 * Math.sin(toRad(anomaly))
        - 0.0069 * Math.sin(toRad(2 * eclipticLongitude));
    const declination = Math.asin(
        Math.sin(toRad(eclipticLongitude)) * Math.sin(toRad(23.4397)),
    );

    // -0.833° accounts for the sun's own radius and for refraction at the
    // horizon, which is what "sunrise" means in practice.
    const cosHourAngle = (Math.sin(toRad(-0.833)) - Math.sin(toRad(lat)) * Math.sin(declination))
        / (Math.cos(toRad(lat)) * Math.cos(declination));
    const noon = fromJulian(transit);

    if (cosHourAngle > 1) return { sunrise: null, sunset: null, noon, polar: 'night' };
    if (cosHourAngle < -1) return { sunrise: null, sunset: null, noon, polar: 'day' };

    const hourAngle = toDeg(Math.acos(cosHourAngle));
    const sunset = fromJulian(transit + hourAngle / 360);
    const sunrise = fromJulian(transit - hourAngle / 360);
    return { sunrise, sunset, noon, polar: null };
}

/**
 * Local `HH:MM` for an instant, in a named zone.
 *
 * `Intl` rather than an offset table: the zone database is in the runtime, it
 * knows about daylight saving, and a hand-rolled table would be wrong twice a
 * year.
 */
export function localTimeIn(instant: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(instant);
    } catch {
        // An unknown zone is the caller's data being wrong, not a reason to
        // throw inside a render.
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(instant);
    }
}

/** Sunrise and sunset as local `HH:MM` in a zone, or nulls on a polar day. */
export function sunTimesLocal(lat: number, lng: number, dateIso: string, timeZone: string): {
    sunrise: string | null; sunset: string | null; polar: 'day' | 'night' | null;
} {
    const times = sunTimes(lat, lng, dateIso);
    return {
        sunrise: times.sunrise ? localTimeIn(times.sunrise, timeZone) : null,
        sunset: times.sunset ? localTimeIn(times.sunset, timeZone) : null,
        polar: times.polar,
    };
}

/**
 * A guess at the zone for a coordinate, good enough to render a sunset in.
 *
 * Not a time zone database — those are megabytes and shaped like polygons. This
 * is the longitude's nominal offset, which is right for the tropics (where a
 * honeymoon usually is) and can be an hour out where a country has stretched its
 * zone. Anything that matters — a flight's real duration — uses the IANA zone
 * stored on the leg instead.
 */
export function nominalOffsetHours(lng: number): number {
    return Math.round(lng / 15);
}

/** `Etc/GMT-8` style zone for a longitude. Note the sign is inverted in POSIX. */
export function nominalZone(lng: number): string {
    const offset = nominalOffsetHours(lng);
    if (offset === 0) return 'UTC';
    return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

/** Minutes past local midnight for a `HH:MM`, for comparing against a sunset. */
export function minutesOfClock(time: string | null | undefined): number | null {
    if (!time) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
}

/** True when a stop's time falls after sunset — the "dinner in the dark" flag. */
export function isAfterDark(time: string | null, sunset: string | null): boolean {
    const at = minutesOfClock(time);
    const dusk = minutesOfClock(sunset);
    if (at == null || dusk == null) return false;
    return at > dusk;
}
