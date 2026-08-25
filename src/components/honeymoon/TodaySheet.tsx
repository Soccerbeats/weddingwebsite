'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
    categoryMeta, formatDate, formatTime, legIsOvernight, travelModeMeta,
} from '@/lib/honeymoon';
import type { Trip } from '@/lib/honeymoon';
import {
    emergencyFor, INFO_SECTIONS, minutesOf, navUrl, nextStop, stopWindow,
} from '@/lib/honeymoonToday';
import type { DayStop, TodayPlan } from '@/lib/honeymoonToday';

/**
 * The trip, as it looks on the morning of.
 *
 * One screen, read-only, thumb-sized targets: where you are sleeping, what is
 * next, how to get there, and who to call if it goes wrong. Shared by the
 * admin's Today tab and the read-only link a partner opens, so the two can
 * never drift.
 *
 * Every target here is at least 44px and nothing needs two hands: this screen is
 * used standing up, holding a coffee, in the sun.
 */
export default function TodaySheet({
    plan, trip, now, onSelectDay, night, onNightChange, footer, weather, sun,
}: {
    plan: TodayPlan;
    trip: Pick<Trip, 'title' | 'start_date' | 'time_format' | 'info' | 'partner_names'>;
    /** Minutes past midnight, for "next up". Omitted on the server. */
    now?: number | null;
    onSelectDay?: (dayNumber: number) => void;
    night: boolean;
    onNightChange?: (night: boolean) => void;
    footer?: React.ReactNode;
    /**
     * Weather for the day, when whoever rendered this could fetch it.
     *
     * A prop rather than a fetch, because this component has two homes and only
     * one of them is signed in: the shared link has no admin API and gets the
     * sun times (which are arithmetic) but no forecast.
     */
    weather?: {
        kind: 'forecast' | 'climate'; high: number | null; low: number | null;
        rain_chance: number | null; label: string | null;
    } | null;
    sun?: { sunrise: string | null; sunset: string | null } | null;
}) {
    const format = trip.time_format === '12h' ? '12h' : '24h';
    const [showEmergency, setShowEmergency] = useState(false);

    const next = useMemo(
        () => (now == null ? null : nextStop(plan.stops, now)),
        [plan.stops, now],
    );

    const country = plan.base?.country || '';
    const emergency = emergencyFor(country);
    const infoFilled = INFO_SECTIONS.filter((section) => (trip.info?.[section.key] ?? '').trim());

    return (
        <div className={night ? 'night' : ''}>
            <div className="min-h-full bg-white night:bg-gray-950 text-gray-900 night:text-gray-100">
                <div className="mx-auto max-w-xl px-4 pb-24 pt-4 md:pb-10">
                    <Header
                        plan={plan}
                        trip={trip}
                        night={night}
                        onNightChange={onNightChange}
                        onSelectDay={onSelectDay}
                    />

                    {(weather || sun?.sunrise) && (
                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1
                            text-sm text-gray-600 night:text-gray-300">
                            {weather && (
                                <span>
                                    {weather.kind === 'climate' && '≈ '}
                                    {weather.high != null && `${Math.round(weather.high)}°`}
                                    {weather.low != null && ` / ${Math.round(weather.low)}°`}
                                    {weather.label && ` · ${weather.label}`}
                                    {weather.rain_chance != null
                                        && ` · ${Math.round(weather.rain_chance)}% rain`}
                                </span>
                            )}
                            {sun?.sunrise && sun.sunset && (
                                <span className="tabular-nums">
                                    ☀ {sun.sunrise} – {sun.sunset}
                                </span>
                            )}
                        </div>
                    )}

                    {plan.standing === 'before' && plan.daysUntil != null && (
                        <Banner>
                            {plan.daysUntil === 0
                                ? 'You leave today.'
                                : `${plan.daysUntil} ${plan.daysUntil === 1 ? 'day' : 'days'} until you leave — this is day one.`}
                        </Banner>
                    )}
                    {plan.standing === 'after' && (
                        <Banner>Welcome home. This is the last day of the trip.</Banner>
                    )}
                    {plan.standing === 'undated' && (
                        <Banner>
                            The trip has no start date yet, so there is no &ldquo;today&rdquo; —
                            showing day one.
                        </Banner>
                    )}

                    {!plan.day ? (
                        <Card>
                            <p className="text-gray-600 night:text-gray-300">
                                No days have been planned yet.
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {plan.arrivals.length > 0 && (
                                <Card>
                                    <SectionLabel>Landing today</SectionLabel>
                                    <div className="mt-2 space-y-3">
                                        {plan.arrivals.map(({ leg, fromDayNumber }) => (
                                            <LegRow
                                                key={leg.id}
                                                leg={leg}
                                                format={format}
                                                note={`left on day ${fromDayNumber}`}
                                            />
                                        ))}
                                    </div>
                                </Card>
                            )}

                            <BaseCard plan={plan} format={format} />

                            {plan.departures.length > 0 && (
                                <Card>
                                    <SectionLabel>Travel today</SectionLabel>
                                    <div className="mt-2 space-y-3">
                                        {plan.departures.map((leg) => (
                                            <LegRow key={leg.id} leg={leg} format={format} />
                                        ))}
                                    </div>
                                </Card>
                            )}

                            <Card>
                                <SectionLabel>
                                    {plan.stops.length ? 'The day' : 'Nothing planned'}
                                </SectionLabel>
                                {plan.stops.length === 0 ? (
                                    <p className="mt-2 text-gray-600 night:text-gray-300">
                                        A free day. {plan.base
                                            ? `You are at ${plan.base.name}.`
                                            : ''}
                                    </p>
                                ) : (
                                    <ol className="mt-3 space-y-3">
                                        {plan.stops.map((stop) => (
                                            <StopRow
                                                key={stop.stop.id}
                                                stop={stop}
                                                format={format}
                                                isNext={next?.stop.id === stop.stop.id}
                                            />
                                        ))}
                                    </ol>
                                )}
                            </Card>

                            {plan.day.notes && (
                                <Card>
                                    <SectionLabel>Notes for the day</SectionLabel>
                                    <p className="mt-2 whitespace-pre-wrap text-gray-700 night:text-gray-200">
                                        {plan.day.notes}
                                    </p>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* The one screen you hope not to need. Collapsed by
                        default, because it is not what you open this for — and
                        one tap away, because when it is, it is the only thing. */}
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={() => setShowEmergency((v) => !v)}
                            className="flex min-h-12 w-full items-center justify-between rounded-2xl
                                border border-rose-200 night:border-rose-900 bg-rose-50
                                night:bg-rose-950/40 px-4 text-left"
                        >
                            <span className="font-medium text-rose-900 night:text-rose-200">
                                Emergency &amp; documents
                            </span>
                            <span className="text-rose-400 night:text-rose-500">
                                {showEmergency ? '▲' : '▼'}
                            </span>
                        </button>
                        {showEmergency && (
                            <Card className="mt-2">
                                <SectionLabel>
                                    {emergency.country}
                                    {emergency.guessed && ' — no country set for today’s base'}
                                </SectionLabel>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {emergency.numbers.map((entry) => (
                                        <a
                                            key={`${entry.label}-${entry.number}`}
                                            href={`tel:${entry.number}`}
                                            className="flex min-h-14 flex-col justify-center rounded-2xl
                                                bg-rose-600 px-4 text-white active:bg-rose-700"
                                        >
                                            <span className="text-xs uppercase tracking-wide opacity-80">
                                                {entry.label}
                                            </span>
                                            <span className="text-lg font-semibold tabular-nums">
                                                {entry.number}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                                {infoFilled.length > 0 && (
                                    <dl className="mt-4 space-y-3">
                                        {infoFilled.map((section) => (
                                            <div key={section.key}>
                                                <dt className="text-xs font-semibold uppercase
                                                    tracking-wide text-gray-500 night:text-gray-400">
                                                    {section.label}
                                                </dt>
                                                <dd className="mt-0.5 whitespace-pre-wrap text-gray-800
                                                    night:text-gray-100">
                                                    {trip.info?.[section.key]}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                                {!infoFilled.length && (
                                    <p className="mt-3 text-sm text-gray-500 night:text-gray-400">
                                        Insurance, embassy and contact details can be filled in on
                                        the portal&apos;s Settings tab — they show up here.
                                    </p>
                                )}
                            </Card>
                        )}
                    </div>

                    {footer}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl border border-gray-200 night:border-gray-800 bg-white
            night:bg-gray-900 p-4 ${className}`}>
            {children}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500
            night:text-gray-400">
            {children}
        </h2>
    );
}

function Banner({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-3 rounded-2xl bg-accent-light night:bg-amber-950/40 px-4 py-3 text-sm
            text-gray-800 night:text-amber-100">
            {children}
        </div>
    );
}

function Header({ plan, trip, night, onNightChange, onSelectDay }: {
    plan: TodayPlan;
    trip: Pick<Trip, 'title' | 'partner_names'>;
    night: boolean;
    onNightChange?: (night: boolean) => void;
    onSelectDay?: (dayNumber: number) => void;
}) {
    const isToday = plan.standing === 'during';
    return (
        <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500
                        night:text-gray-400">
                        {trip.title}
                    </p>
                    <h1 className="mt-0.5 text-2xl font-semibold">
                        {plan.dayNumber == null
                            ? 'No days yet'
                            : `Day ${plan.dayNumber}${plan.totalDays ? ` of ${plan.totalDays}` : ''}`}
                    </h1>
                    <p className="text-gray-600 night:text-gray-300">
                        {plan.date ? formatDate(plan.date) : 'No dates set'}
                        {plan.day?.title ? ` · ${plan.day.title}` : ''}
                        {isToday && plan.dayNumber != null && (
                            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs
                                font-semibold text-white">
                                Today
                            </span>
                        )}
                    </p>
                </div>
                {onNightChange && (
                    <button
                        type="button"
                        onClick={() => onNightChange(!night)}
                        aria-label={night ? 'Switch to daylight' : 'Switch to night'}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full
                            border border-gray-200 night:border-gray-700 text-lg"
                    >
                        {night ? '☀️' : '🌙'}
                    </button>
                )}
            </div>

            {onSelectDay && plan.dayNumber != null && (
                <div className="mt-3 flex items-center gap-2">
                    <DayArrow
                        label="Previous day"
                        glyph="‹"
                        to={plan.dayNumber - 1}
                        disabled={plan.dayNumber <= 1}
                        onSelectDay={onSelectDay}
                    />
                    <DayArrow
                        label="Next day"
                        glyph="›"
                        to={plan.dayNumber + 1}
                        disabled={plan.totalDays != null && plan.dayNumber >= plan.totalDays}
                        onSelectDay={onSelectDay}
                    />
                </div>
            )}
        </div>
    );
}

function DayArrow({ label, glyph, to, disabled, onSelectDay }: {
    label: string; glyph: string; to: number; disabled: boolean;
    onSelectDay: (dayNumber: number) => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={() => onSelectDay(to)}
            className="flex min-h-11 flex-1 items-center justify-center rounded-full border
                border-gray-200 night:border-gray-700 text-xl disabled:opacity-30"
        >
            {glyph}
        </button>
    );
}

function BaseCard({ plan, format }: { plan: TodayPlan; format: '12h' | '24h' }) {
    const { base } = plan;
    if (!base) {
        return (
            <Card>
                <SectionLabel>Tonight</SectionLabel>
                <p className="mt-2 text-gray-600 night:text-gray-300">
                    No stay set for this day.
                </p>
            </Card>
        );
    }
    const nights = plan.baseNights && plan.baseNight
        ? `Night ${plan.baseNight} of ${plan.baseNights}`
        : null;
    return (
        <Card>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <SectionLabel>Tonight</SectionLabel>
                    <p className="mt-1 truncate text-lg font-semibold">{base.name}</p>
                    {nights && (
                        <p className="text-sm text-gray-500 night:text-gray-400">{nights}</p>
                    )}
                    {base.address && (
                        <p className="mt-1 text-sm text-gray-600 night:text-gray-300">
                            {base.address}
                        </p>
                    )}
                </div>
                <NavButton target={base} />
            </div>
            <BookingLine plan={plan} format={format} />
        </Card>
    );
}

function BookingLine({ plan, format }: { plan: TodayPlan; format: '12h' | '24h' }) {
    const booking = plan.stops.find((stop) => stop.booking)?.booking
        ?? null;
    const forBase = booking && plan.base && booking.place_id === plan.base.id ? booking : null;
    const use = forBase ?? null;
    if (!use) return null;
    const at = (time: string | null) => (time ? (format === '12h' ? formatTime(time) : time) : null);
    const parts = [
        use.confirmation ? `Ref ${use.confirmation}` : null,
        at(use.check_in_time) ? `check in ${at(use.check_in_time)}` : null,
        at(use.check_out_time) ? `out by ${at(use.check_out_time)}` : null,
    ].filter(Boolean);
    if (!parts.length && !use.contact) return null;
    return (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100
            night:border-gray-800 pt-3 text-sm text-gray-600 night:text-gray-300">
            <span>{parts.join(' · ')}</span>
            {use.contact && (
                <a
                    href={`tel:${use.contact.replace(/[^+\d]/g, '')}`}
                    className="ml-auto flex min-h-11 items-center rounded-full bg-gray-900
                        night:bg-gray-100 px-4 text-sm font-medium text-white night:text-gray-900"
                >
                    Call the hotel
                </a>
            )}
        </div>
    );
}

function LegRow({ leg, format, note }: {
    leg: {
        id: number; mode: string; from_text: string | null; to_text: string | null;
        depart_time: string | null; arrive_time: string | null; arrive_day_offset: number;
        flight_no: string | null; from_terminal: string | null; to_terminal: string | null;
        confirmation_ref: string | null;
    };
    format: '12h' | '24h';
    note?: string;
}) {
    const meta = travelModeMeta(leg.mode);
    const at = (time: string | null) => (time ? (format === '12h' ? formatTime(time) : time) : null);
    const terminals = [
        leg.from_terminal ? `T${leg.from_terminal}` : null,
        leg.to_terminal ? `T${leg.to_terminal}` : null,
    ].filter(Boolean).join(' → ');
    return (
        <div className="flex items-start gap-3">
            <span className="text-xl leading-none" aria-hidden>{meta.icon}</span>
            <div className="min-w-0 flex-1">
                <p className="font-medium">
                    {leg.from_text || '—'} → {leg.to_text || '—'}
                    {leg.flight_no && (
                        <span className="ml-2 rounded-full bg-gray-100 night:bg-gray-800 px-2
                            py-0.5 text-xs font-semibold">
                            {leg.flight_no}
                        </span>
                    )}
                </p>
                <p className="text-sm text-gray-600 night:text-gray-300 tabular-nums">
                    {[at(leg.depart_time), at(leg.arrive_time)].filter(Boolean).join(' → ')}
                    {legIsOvernight(leg) && ' (+1 day)'}
                    {terminals && ` · ${terminals}`}
                    {leg.confirmation_ref && ` · ${leg.confirmation_ref}`}
                    {note && ` · ${note}`}
                </p>
            </div>
        </div>
    );
}

function StopRow({ stop, format, isNext }: {
    stop: DayStop; format: '12h' | '24h'; isNext: boolean;
}) {
    const window = stopWindow(stop, format);
    const category = stop.place ? categoryMeta(stop.place.category) : null;
    return (
        <li className={`rounded-2xl border p-3 ${isNext
            ? 'border-accent bg-accent-light/40 night:border-amber-600 night:bg-amber-950/30'
            : 'border-gray-100 night:border-gray-800'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {window && (
                            <span className="text-sm font-semibold tabular-nums text-gray-500
                                night:text-gray-400">
                                {window}
                            </span>
                        )}
                        {isNext && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-xs
                                font-semibold text-white">
                                Next
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 font-medium">
                        {category && <span className="mr-1" aria-hidden>{category.icon}</span>}
                        {stop.label}
                    </p>
                    {stop.address && (
                        <p className="mt-0.5 text-sm text-gray-600 night:text-gray-300">
                            {stop.address}
                        </p>
                    )}
                    {stop.place?.best_time && (
                        <p className="mt-0.5 text-sm text-gray-500 night:text-gray-400">
                            Best: {stop.place.best_time}
                        </p>
                    )}
                    {stop.stop.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700
                            night:text-gray-200">
                            {stop.stop.notes}
                        </p>
                    )}
                    {stop.booking?.confirmation && (
                        <p className="mt-1 text-sm text-gray-600 night:text-gray-300">
                            Ref {stop.booking.confirmation}
                            {stop.booking.party_size ? ` · table for ${stop.booking.party_size}` : ''}
                            {stop.booking.dress_code ? ` · ${stop.booking.dress_code}` : ''}
                        </p>
                    )}
                </div>
                <NavButton target={{
                    lat: stop.lat, lng: stop.lng, name: stop.label, address: stop.address,
                }} />
            </div>
        </li>
    );
}

/**
 * One tap to a route.
 *
 * `dir/?api=1` is the documented cross-platform form: it opens the native app on
 * either phone and the web map on a desktop. A route beats a dropped pin,
 * because the next thing you do is always "how do I get there".
 */
function NavButton({ target }: {
    target: { lat?: number | null; lng?: number | null; name?: string | null; address?: string | null };
}) {
    const pinned = target.lat != null && target.lng != null;
    const named = (target.name ?? '').trim() || (target.address ?? '').trim();
    if (!pinned && !named) return null;
    return (
        <a
            href={navUrl(target)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-gray-900
                night:bg-gray-100 px-4 text-sm font-medium text-white night:text-gray-900
                active:opacity-80"
        >
            Navigate
        </a>
    );
}

/*
 * Night mode, remembered per browser.
 *
 * A store rather than state-in-an-effect: the server has no localStorage, so the
 * first paint must be the daylight one and the stored choice can only be read
 * afterwards. `useSyncExternalStore` is the version of that React does properly
 * — it hydrates against the server snapshot and re-renders once with the real
 * one — and it keeps two tabs in step for free.
 */
const nightListeners = new Set<() => void>();

function subscribeNight(callback: () => void) {
    nightListeners.add(callback);
    window.addEventListener('storage', callback);
    return () => {
        nightListeners.delete(callback);
        window.removeEventListener('storage', callback);
    };
}

export function useNightMode(key: string): [boolean, (night: boolean) => void] {
    const night = useSyncExternalStore(
        subscribeNight,
        () => {
            try { return localStorage.getItem(key) === '1'; } catch { return false; }
        },
        () => false,
    );
    const set = useCallback((value: boolean) => {
        try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* private window */ }
        nightListeners.forEach((listener) => listener());
    }, [key]);
    return [night, set];
}

/** The clock, as minutes past midnight, ticking once a minute. */
export function useNowMinutes(): number | null {
    const [minutes, setMinutes] = useState<number | null>(null);
    useEffect(() => {
        const read = () => {
            const now = new Date();
            setMinutes(now.getHours() * 60 + now.getMinutes());
        };
        read();
        const timer = setInterval(read, 60_000);
        return () => clearInterval(timer);
    }, []);
    return minutes;
}

/** Minutes past midnight for a stored `HH:MM`, re-exported for callers. */
export { minutesOf };
