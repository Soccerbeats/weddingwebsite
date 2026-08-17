'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
    currencySymbol, dateForDay, formatDayDate, hasCoords, priceValue,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Card, CategoryChip } from './ui';

const BASE = '/admin/honeymoon';

/**
 * The whole trip on one screen.
 *
 * Deliberately a read-out, not another editor: it answers "where are we up to
 * and what needs doing", then sends you to the tab that does the work. Every
 * number is a link, because a count you can't act on is trivia.
 */
export default function DashboardTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;

    const places = useMemo(() => data?.places ?? [], [data]);
    const days = useMemo(() => data?.days ?? [], [data]);
    const trip = data?.trip;
    const symbol = currencySymbol(trip?.home_currency);

    const stays = useMemo(() => places.filter((p) => p.category === 'stay'), [places]);
    const excursions = useMemo(() => places.filter((p) => p.is_excursion), [places]);

    const stats = useMemo(() => {
        const pinned = places.filter(hasCoords);
        return {
            places: places.length,
            pinned: pinned.length,
            unpinned: places.length - pinned.length,
            unconfirmed: pinned.filter((p) => p.needs_review).length,
            shortlisted: places.filter((p) => p.status === 'shortlisted').length,
            booked: places.filter((p) => p.status === 'booked').length,
        };
    }, [places]);

    /** Nightly range across the stays you're interested in. */
    const stayCost = useMemo(() => {
        const priced = stays
            .filter((s) => s.rating === 'yes')
            .map((s) => priceValue(s.price_note))
            .filter((v): v is number => v != null);
        if (!priced.length) return null;
        return { min: Math.min(...priced), max: Math.max(...priced), count: priced.length };
    }, [stays]);

    /** What the excursions you want would add up to. */
    const excursionCost = useMemo(() => {
        const wanted = excursions.filter((e) => e.rating === 'yes');
        const priced = wanted
            .map((e) => priceValue(e.price_note))
            .filter((v): v is number => v != null);
        return {
            total: priced.reduce((sum, v) => sum + v, 0),
            priced: priced.length,
            wanted: wanted.length,
        };
    }, [excursions]);

    const todos = useMemo(() => data?.todos ?? [], [data]);
    const todosLeft = todos.filter((t) => !t.done).length;

    const stopCount = days.reduce((n, d) => n + d.stops.length, 0);
    const emptyDays = days.filter((d) => d.stops.length === 0);

    /** Everything worth chasing, each with somewhere to go and do it. */
    const todo = useMemo(() => {
        const items: { label: string; href: string; tone: 'warn' | 'info' }[] = [];
        if (stats.unconfirmed) {
            items.push({
                label: `${stats.unconfirmed} pin${stats.unconfirmed === 1 ? '' : 's'} still unconfirmed`,
                href: `${BASE}/map`, tone: 'warn',
            });
        }
        if (stats.unpinned) {
            items.push({
                label: `${stats.unpinned} place${stats.unpinned === 1 ? '' : 's'} with no location`,
                href: `${BASE}/places`, tone: 'info',
            });
        }
        if (emptyDays.length) {
            items.push({
                label: `${emptyDays.length} day${emptyDays.length === 1 ? '' : 's'} with nothing planned`,
                href: `${BASE}/itinerary`, tone: 'info',
            });
        }
        const unratedStays = stays.filter((s) => s.rating == null && s.links.length > 0).length;
        if (unratedStays) {
            items.push({
                label: `${unratedStays} stay${unratedStays === 1 ? '' : 's'} not yet rated`,
                href: `${BASE}/stays`, tone: 'info',
            });
        }
        const unratedExcursions = excursions.filter((e) => e.rating == null).length;
        if (unratedExcursions) {
            items.push({
                label: `${unratedExcursions} excursion${unratedExcursions === 1 ? '' : 's'} not yet rated`,
                href: `${BASE}/excursions`, tone: 'info',
            });
        }
        if (todosLeft) {
            items.push({
                label: `${todosLeft} thing${todosLeft === 1 ? '' : 's'} left on the checklist`,
                href: `${BASE}/checklist`, tone: 'info',
            });
        }
        if (!days.length) {
            items.push({ label: 'No days yet — start the itinerary', href: `${BASE}/itinerary`, tone: 'info' });
        }
        if (!trip?.start_date) {
            items.push({ label: 'No start date set', href: `${BASE}/settings`, tone: 'info' });
        }
        return items;
    }, [stats, emptyDays.length, stays, excursions, days.length, trip?.start_date, todosLeft]);

    const lastDay = days.length ? Math.max(...days.map((d) => d.day_number)) : 0;
    const startsIn = useMemo(() => {
        if (!trip?.start_date) return null;
        const start = dateForDay(trip.start_date, 1);
        if (!start) return null;
        const today = new Date();
        const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        return Math.round((start.getTime() - utcToday) / 86_400_000);
    }, [trip?.start_date]);

    const shortlist = useMemo(
        () => [...stays, ...excursions].filter((p) => p.rating === 'yes').slice(0, 6),
        [stays, excursions],
    );

    return (
        <div className="space-y-4">
            {/* ---- Headline numbers ---- */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                <Stat
                    label="Trip"
                    value={days.length ? `${days.length} day${days.length === 1 ? '' : 's'}` : 'Not planned'}
                    hint={trip?.start_date
                        ? `${formatDayDate(trip.start_date, 1)}${lastDay > 1 ? ` → ${formatDayDate(trip.start_date, lastDay)}` : ''}`
                        : 'No dates set'}
                    href={`${BASE}/itinerary`}
                />
                <Stat
                    label="Countdown"
                    value={startsIn == null ? '—' : startsIn > 0 ? `${startsIn} days` : startsIn === 0 ? 'Today' : 'Under way'}
                    hint={startsIn == null ? 'Set a start date' : 'until you fly'}
                    href={`${BASE}/settings`}
                />
                <Stat
                    label="Places"
                    value={String(stats.places)}
                    hint={`${stats.pinned} pinned`}
                    href={`${BASE}/places`}
                />
                <Stat
                    label="To review"
                    value={String(stats.unconfirmed)}
                    hint={stats.unconfirmed ? 'unconfirmed pins' : 'all confirmed'}
                    tone={stats.unconfirmed ? 'warn' : 'good'}
                    href={`${BASE}/map`}
                />
                <Stat
                    label="Stays"
                    value={String(stays.length)}
                    hint={`${stays.filter((s) => s.rating === 'yes').length} interested`}
                    href={`${BASE}/stays`}
                />
                <Stat
                    label="To do"
                    value={todos.length ? `${todos.length - todosLeft}/${todos.length}` : '—'}
                    hint={todos.length ? (todosLeft ? `${todosLeft} left` : 'all done') : 'nothing listed'}
                    tone={todos.length && !todosLeft ? 'good' : 'default'}
                    href={`${BASE}/checklist`}
                />
                <Stat
                    label="Excursions"
                    value={String(excursions.length)}
                    hint={`${excursions.filter((e) => e.rating === 'yes').length} interested`}
                    href={`${BASE}/excursions`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                {/* ---- Itinerary ---- */}
                <Card className="p-4 lg:col-span-2">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                        <h2 className="text-sm font-semibold text-gray-900">Itinerary</h2>
                        <Link href={`${BASE}/itinerary`} className="text-xs text-accent hover:underline">
                            Open →
                        </Link>
                    </div>
                    {days.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No days yet. <Link href={`${BASE}/itinerary`} className="text-accent hover:underline">
                                Add the first one
                            </Link>.
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-gray-400 mb-2">
                                {stopCount} stop{stopCount === 1 ? '' : 's'} across {days.length} day
                                {days.length === 1 ? '' : 's'}
                                {emptyDays.length > 0 && (
                                    <span className="text-amber-600">
                                        {' '}· {emptyDays.length} still empty
                                    </span>
                                )}
                            </p>
                            <ul className="divide-y divide-gray-100">
                                {days.map((day) => (
                                    <li key={day.id} className="py-2 flex items-baseline gap-3">
                                        <span className="text-xs font-semibold text-gray-700 shrink-0 w-16">
                                            Day {day.day_number}
                                        </span>
                                        <span className="text-xs text-gray-400 shrink-0 w-24 hidden sm:block">
                                            {formatDayDate(trip?.start_date ?? null, day.day_number) ?? ''}
                                        </span>
                                        <span className="text-sm text-gray-700 truncate flex-1">
                                            {day.title || <span className="text-gray-400">Untitled</span>}
                                            {day.stops.length > 0 && (
                                                <span className="text-gray-400">
                                                    {' — '}
                                                    {day.stops
                                                        .map((s) => (s.place_id != null
                                                            ? api.placeById.get(s.place_id)?.name
                                                            : s.custom_label) || 'stop')
                                                        .slice(0, 3)
                                                        .join(', ')}
                                                    {day.stops.length > 3 && ` +${day.stops.length - 3}`}
                                                </span>
                                            )}
                                        </span>
                                        <span className={`text-xs shrink-0 ${day.stops.length ? 'text-gray-400' : 'text-amber-600'}`}>
                                            {day.stops.length || 'empty'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </Card>

                {/* ---- What needs doing ---- */}
                <Card className="p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">Needs attention</h2>
                    {todo.length === 0 ? (
                        <p className="text-sm text-emerald-700">Nothing outstanding. </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {todo.map((item) => (
                                <li key={item.label}>
                                    <Link
                                        href={item.href}
                                        className={`block text-sm rounded-xl px-3 py-2 transition
                                            ${item.tone === 'warn'
                                            ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                    >
                                        {item.label} →
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                {/* ---- Money ---- */}
                <Card className="p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">Rough cost</h2>
                    <dl className="space-y-2">
                        <div>
                            <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                                Stays you like
                            </dt>
                            <dd className="text-sm text-gray-800">
                                {stayCost
                                    ? (stayCost.min === stayCost.max
                                        ? `${symbol}${stayCost.min.toLocaleString('en-US')} per night`
                                        : `${symbol}${stayCost.min.toLocaleString('en-US')}–${symbol}${stayCost.max.toLocaleString('en-US')} per night`)
                                    : <span className="text-gray-400">no prices entered yet</span>}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                                Excursions you like
                            </dt>
                            <dd className="text-sm text-gray-800">
                                {excursionCost.priced
                                    ? `${symbol}${excursionCost.total.toLocaleString('en-US')}`
                                    : <span className="text-gray-400">no prices entered yet</span>}
                                {excursionCost.wanted > excursionCost.priced && (
                                    <span className="text-[11px] text-gray-400">
                                        {' '}({excursionCost.wanted - excursionCost.priced} without a price)
                                    </span>
                                )}
                            </dd>
                        </div>
                    </dl>
                    {/* Said plainly: an entry with no number is not counted as zero. */}
                    <p className="text-[11px] text-gray-400 mt-3">
                        Only counts entries with a number in them, and ignores how many
                        nights or people — it&apos;s a sense of scale, not a budget.
                    </p>
                </Card>

                {/* ---- Shortlist ---- */}
                <Card className="p-4 lg:col-span-2">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                        <h2 className="text-sm font-semibold text-gray-900">Shortlist</h2>
                        <span className="text-xs text-gray-400">everything you marked interested</span>
                    </div>
                    {shortlist.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            Nothing shortlisted yet — rate a{' '}
                            <Link href={`${BASE}/stays`} className="text-accent hover:underline">stay</Link>
                            {' '}or an{' '}
                            <Link href={`${BASE}/excursions`} className="text-accent hover:underline">
                                excursion
                            </Link>.
                        </p>
                    ) : (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {shortlist.map((item) => (
                                <li key={item.id}
                                    className="flex items-center gap-2 rounded-xl border border-gray-100 p-2">
                                    {item.image_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={item.image_url}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-sm text-gray-900 truncate">{item.name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <CategoryChip category={item.category} />
                                            {item.price_note && (
                                                <span className="text-[11px] text-gray-500 truncate">
                                                    {item.price_note}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            {/* ---- Progress ---- */}
            <Card className="p-4">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h2 className="text-sm font-semibold text-gray-900">Planning progress</h2>
                    <span className="text-xs text-gray-400">
                        {stats.booked} booked · {stats.shortlisted} shortlisted · {stats.places} total
                    </span>
                </div>
                <Bar
                    segments={[
                        { value: stats.booked, color: '#059669', label: 'Booked' },
                        { value: stats.shortlisted, color: '#f59e0b', label: 'Shortlisted' },
                        {
                            value: Math.max(0, stats.places - stats.booked - stats.shortlisted),
                            color: '#e5e7eb',
                            label: 'Ideas',
                        },
                    ]}
                />
                <div className="flex flex-wrap gap-3 mt-2">
                    {[
                        { label: 'Booked', color: '#059669' },
                        { label: 'Shortlisted', color: '#f59e0b' },
                        { label: 'Ideas', color: '#e5e7eb' },
                    ].map((s) => (
                        <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                            <span className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: s.color }} />
                            {s.label}
                        </span>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function Stat({ label, value, hint, href, tone = 'default' }: {
    label: string;
    value: string;
    hint?: string;
    href: string;
    tone?: 'default' | 'good' | 'warn';
}) {
    const toneClass = { default: 'text-gray-900', good: 'text-emerald-600', warn: 'text-amber-600' }[tone];
    return (
        <Link href={href} className="block">
            <Card className="p-3 hover:border-gray-200 transition h-full">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                    {label}
                </div>
                <div className={`mt-0.5 text-base md:text-xl font-semibold tabular-nums ${toneClass}`}>
                    {value}
                </div>
                {hint && <div className="mt-0.5 text-[11px] text-gray-400 truncate">{hint}</div>}
            </Card>
        </Link>
    );
}

/** Proportional bar. Renders nothing rather than a misleading empty bar at zero. */
function Bar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return <p className="text-sm text-gray-400">Nothing to chart yet.</p>;
    return (
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            {segments.filter((s) => s.value > 0).map((s) => (
                <div
                    key={s.label}
                    title={`${s.label}: ${s.value}`}
                    style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                />
            ))}
        </div>
    );
}
