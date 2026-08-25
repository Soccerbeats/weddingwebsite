'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import {
    currencySymbol, dateForDay, dayColor, daysBetween, effectiveCountry, formatDayDate, hasCoords, priceValue,
} from '@/lib/honeymoon';
import { todayIso } from '@/lib/honeymoon';
import {
    buildBudget, completenessOf, deadlinesOf, formatMoney, perPerson, phaseHint, unbookedDays,
} from '@/lib/honeymoonBudget';
import { dueSoon } from '@/lib/honeymoonChecks';
import type { HoneymoonApi } from './useHoneymoon';
import { Card, CategoryChip } from './ui';

// Leaflet touches `window` on import, so it never joins the server bundle.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

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

    // Removed (archived) places are kept for the record but are not part of
    // the trip; every headline number here leaves them out.
    const places = useMemo(() => (data?.places ?? []).filter((p) => !p.archived), [data]);
    const days = useMemo(() => data?.days ?? [], [data]);
    const trip = data?.trip;
    const symbol = currencySymbol(trip?.home_currency);

    /*
     * The four questions the old dashboard could not answer.
     *
     * All arithmetic over the payload — no fetch, no effect — so they cost a
     * render and are always in step with what the tabs show.
     */
    const today = todayIso();
    const budget = useMemo(() => (data ? buildBudget(data) : null), [data]);
    const deadlines = useMemo(() => (data
        ? deadlinesOf(data.bookings, today, (id) => (id != null
            ? data.places.find((place) => place.id === id)?.name ?? '' : ''))
        : []), [data, today]);
    const unbooked = useMemo(() => (data ? unbookedDays(data, today) : []), [data, today]);
    const completeness = useMemo(() => (data ? completenessOf(data) : null), [data]);
    const nudge = useMemo(() => (trip ? phaseHint(trip, today) : null), [trip, today]);
    /** Checklist items due in the next week — `due_on` finally doing something. */
    const soon = useMemo(() => dueSoon(data?.todos ?? [], today), [data?.todos, today]);

    // Removed stays are not in the running, so they are not in the count either —
    // a headline number that includes the ones you rejected is a wrong number.
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

    /**
     * Pins for the overview map.
     *
     * Confirmed pins only, and honouring the trip's country filter with the same
     * rule as the map page — exclude only what is known to be somewhere else.
     * An unconfirmed pin is a guess; an overview built from guesses is worse
     * than a smaller honest one.
     */
    const mapPlaces = useMemo(() => {
        const countryOf = new Map((data?.regions ?? []).map((r) => [r.id, r.country ?? '']));
        const focus = trip?.focus_country ?? '';
        return places.filter((p) => {
            if (!hasCoords(p) || p.needs_review) return false;
            if (!focus) return true;
            const its = effectiveCountry(p, countryOf);
            return !its || its === focus;
        });
    }, [places, data?.regions, trip?.focus_country]);

    /** Each day's stops, drawn over the overview map in its own colour. */
    const mapRoutes = useMemo(() => days.map((day) => ({
        points: day.stops
            .map((stop) => {
                const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
                if (!place || !hasCoords(place)) return null;
                return { lat: place.lat, lng: place.lng, label: stop.custom_label || place.name };
            })
            .filter((pt): pt is { lat: number; lng: number; label: string } => pt != null),
        color: dayColor(day.day_number),
        label: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
    })).filter((r) => r.points.length > 0),
    [days, api.placeById]);

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
            items.push({ label: 'No dates set — drag a range', href: `${BASE}/settings`, tone: 'info' });
        }
        return items;
    }, [stats, emptyDays.length, stays, excursions, days.length, trip?.start_date, todosLeft]);

    const lastDay = days.length ? Math.max(...days.map((d) => d.day_number)) : 0;
    const nights = daysBetween(trip?.start_date ?? null, trip?.end_date ?? null);
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

    // Fills the viewport rather than scrolling: two flexible bands plus a thin
    // footer. Each card owns its own overflow, so a long list scrolls inside its
    // card instead of pushing the page taller. min-h is the floor — below that
    // nothing can fit and the shell's scrollbar takes over.
    return (
        <div className="h-full min-h-[34rem] flex flex-col gap-3">
            {/* ---- Stats and the map ---- */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-[3] min-h-0">
            <div className="xl:col-span-2 flex flex-col gap-3 min-h-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
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
                    hint={startsIn == null
                        ? 'Set the dates'
                        : nights != null
                            ? `until you fly · ${nights} night${nights === 1 ? '' : 's'} away`
                            : 'until you fly'}
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

            {/* ---- Itinerary, filling what's left on the left ---- */}
            <Card className="p-4 flex flex-col min-h-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
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
                        <p className="text-xs text-gray-400 mb-1 shrink-0">
                            {stopCount} stop{stopCount === 1 ? '' : 's'} across {days.length} day
                            {days.length === 1 ? '' : 's'}
                            {emptyDays.length > 0 && (
                                <span className="text-amber-600"> · {emptyDays.length} still empty</span>
                            )}
                        </p>
                        <ul className="divide-y divide-gray-100 overflow-auto min-h-0 flex-1">
                            {days.map((day) => (
                                <li key={day.id} className="py-1.5 flex items-baseline gap-3">
                                    <span className="text-xs font-semibold text-gray-700 shrink-0 w-14">
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
            </div>

                {/* ---- Where it all is ---- */}
                <Card className="p-3 flex flex-col min-h-0">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                        <h2 className="text-sm font-semibold text-gray-900">Where it all is</h2>
                        <Link href={`${BASE}/map`} className="text-xs text-accent hover:underline">
                            Open map →
                        </Link>
                    </div>
                    {mapPlaces.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center rounded-2xl bg-gray-50">
                            <p className="text-xs text-gray-400 text-center px-4">
                                Nothing pinned yet.{' '}
                                <Link href={`${BASE}/places`} className="text-accent hover:underline">
                                    Pin a place
                                </Link>.
                            </p>
                        </div>
                    ) : (
                        <TripMap
                            places={mapPlaces}
                            routes={mapRoutes}
                            className="flex-1 min-h-0 w-full"
                        />
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        {mapPlaces.length} confirmed
                        {stats.unconfirmed > 0 && (
                            <span className="text-amber-600"> · {stats.unconfirmed} unconfirmed hidden</span>
                        )}
                        {mapRoutes.length > 0 && <span> · {mapRoutes.length} day{mapRoutes.length === 1 ? '' : 's'} drawn</span>}
                        {trip?.focus_country && <span> · {trip.focus_country}</span>}
                    </p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-[2] min-h-0">
                {/* ---- What needs doing ---- */}
                <Card className="p-4 flex flex-col min-h-0">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2 shrink-0">Needs attention</h2>
                    {todo.length === 0 ? (
                        <p className="text-sm text-emerald-700">Nothing outstanding. </p>
                    ) : (
                        <ul className="space-y-1.5 overflow-auto min-h-0 flex-1">
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

                {/* ---- Money ---- */}
                <Card className="p-4 flex flex-col min-h-0 overflow-auto">
                    <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
                        <h2 className="text-sm font-semibold text-gray-900">Cost of the trip</h2>
                        {budget && budget.total > 0 && (
                            <span className="text-[11px] text-gray-400">
                                {formatMoney(perPerson(budget.total), trip?.home_currency || 'USD')}
                                {' '}each
                            </span>
                        )}
                    </div>

                    {!budget || budget.total === 0 ? (
                        <>
                            <p className="text-sm text-gray-500">
                                Nothing priced with a number yet.
                            </p>
                            <p className="text-[11px] text-gray-400 mt-2">
                                A place&apos;s <strong>Cost</strong> field (per night, per person or
                                total) is what this adds up — the free-text price note stays for the
                                detail. Travel legs and bookings count too.
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-semibold text-gray-900 tabular-nums">
                                {formatMoney(budget.total, trip?.home_currency || 'USD')}
                            </p>
                            {budget.budget != null && (
                                <div className="mt-1.5">
                                    <div className="h-1.5 w-full rounded-full bg-gray-100
                                        overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${
                                                budget.total > budget.budget
                                                    ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                            style={{
                                                width: `${Math.min(100, Math.round(
                                                    (budget.total / Math.max(budget.budget, 1)) * 100,
                                                ))}%`,
                                            }}
                                        />
                                    </div>
                                    <p className={`text-[11px] mt-1 ${budget.remaining != null
                                        && budget.remaining < 0 ? 'text-rose-700' : 'text-gray-500'}`}>
                                        {budget.remaining != null && budget.remaining >= 0
                                            ? `${formatMoney(budget.remaining, trip?.home_currency || 'USD')} left of ${formatMoney(budget.budget, trip?.home_currency || 'USD')}`
                                            : `${formatMoney(Math.abs(budget.remaining ?? 0), trip?.home_currency || 'USD')} over the ${formatMoney(budget.budget, trip?.home_currency || 'USD')} budget`}
                                    </p>
                                </div>
                            )}

                            <dl className="mt-3 space-y-1 text-sm">
                                {([
                                    ['Stays', budget.stays],
                                    ['Travel', budget.travel],
                                    ['Excursions', budget.excursions],
                                    ['Everything else', budget.other],
                                ] as [string, number][]).filter(([, amount]) => amount > 0)
                                    .map(([label, amount]) => (
                                        <div key={label} className="flex justify-between gap-2">
                                            <dt className="text-gray-500">{label}</dt>
                                            <dd className="text-gray-800 tabular-nums">
                                                {formatMoney(amount, trip?.home_currency || 'USD')}
                                            </dd>
                                        </div>
                                    ))}
                                {budget.paid > 0 && (
                                    <div className="flex justify-between gap-2 border-t
                                        border-gray-100 pt-1">
                                        <dt className="text-gray-500">Paid so far</dt>
                                        <dd className="text-emerald-700 tabular-nums">
                                            {formatMoney(budget.paid, trip?.home_currency || 'USD')}
                                        </dd>
                                    </div>
                                )}
                                {budget.outstanding > 0 && budget.paid > 0 && (
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-gray-500">Still to pay</dt>
                                        <dd className="text-gray-800 tabular-nums">
                                            {formatMoney(budget.outstanding, trip?.home_currency || 'USD')}
                                        </dd>
                                    </div>
                                )}
                            </dl>

                            {(budget.unpriced > 0 || budget.unconverted > 0) && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    {budget.unpriced > 0 && (
                                        <>{budget.unpriced} place{budget.unpriced === 1 ? '' : 's'} priced
                                        only in words, so not counted. </>
                                    )}
                                    {budget.unconverted > 0 && (
                                        <>{budget.unconverted} amount{budget.unconverted === 1 ? '' : 's'} in
                                        a currency with no rate, counted at face value.</>
                                    )}
                                </p>
                            )}

                            {/* The old sense-of-scale reading, kept for exactly the
                                places the total cannot include: a note that says
                                "about 1.2m a night" is real information, it just
                                is not arithmetic. */}
                            {budget.unpriced > 0 && (stayCost || excursionCost.priced > 0) && (
                                <p className="text-[11px] text-gray-500 mt-1">
                                    From the notes:{' '}
                                    {stayCost && (
                                        <>stays {stayCost.min === stayCost.max
                                            ? `${symbol}${stayCost.min.toLocaleString('en-US')}`
                                            : `${symbol}${stayCost.min.toLocaleString('en-US')}–${symbol}${stayCost.max.toLocaleString('en-US')}`}
                                        {' '}a night</>
                                    )}
                                    {stayCost && excursionCost.priced > 0 && ', '}
                                    {excursionCost.priced > 0 && (
                                        <>excursions about {symbol}
                                        {excursionCost.total.toLocaleString('en-US')}</>
                                    )}.
                                </p>
                            )}
                        </>
                    )}
                </Card>

                {/* ---- Shortlist ---- */}
                <Card className="p-4 flex flex-col min-h-0">
                    <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
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
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-auto min-h-0 flex-1">
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

            {/* ---- Deadlines, unbooked nights, completeness ----
                Three answers that were unanswerable before bookings existed. Each
                one only appears when it has something to say: an empty card on a
                dashboard is a card you learn to ignore. */}
            {(deadlines.length > 0 || unbooked.length > 0 || soon.length > 0 || nudge
                || (completeness && completeness.score < 100 && completeness.days > 0)) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
                    {soon.length > 0 && (
                        <Card className="p-3">
                            <h2 className="mb-2 text-sm font-semibold text-gray-900">
                                Due this week
                            </h2>
                            <ul className="space-y-1.5">
                                {soon.slice(0, 4).map((entry) => (
                                    <li key={entry.todo.id}>
                                        <Link
                                            href={`${BASE}/checklist`}
                                            className={`flex items-baseline justify-between gap-2
                                                rounded-xl px-2.5 py-1.5 text-sm ${
                                                entry.bucket === 'overdue'
                                                    ? 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                        >
                                            <span className="min-w-0 truncate">
                                                {entry.todo.text}
                                            </span>
                                            <span className="shrink-0 text-[11px] tabular-nums">
                                                {entry.bucket === 'overdue'
                                                    ? `${Math.abs(entry.daysAway ?? 0)}d late`
                                                    : entry.bucket === 'today'
                                                        ? 'today' : `${entry.daysAway}d`}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}

                    {deadlines.length > 0 && (
                        <Card className="p-3">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">
                                Before these dates
                            </h2>
                            <ul className="space-y-1.5">
                                {deadlines.slice(0, 4).map((deadline) => (
                                    <li
                                        key={`${deadline.kind}-${deadline.booking.id}`}
                                        className={`flex items-baseline justify-between gap-2
                                            rounded-xl px-2.5 py-1.5 text-sm ${deadline.daysAway <= 7
                                            ? 'bg-rose-50 text-rose-800'
                                            : 'bg-gray-50 text-gray-700'}`}
                                    >
                                        <span className="min-w-0 truncate">{deadline.label}</span>
                                        <span className="shrink-0 tabular-nums text-[11px]">
                                            {deadline.daysAway === 0
                                                ? 'today'
                                                : `${deadline.daysAway}d`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-gray-400 mt-2">
                                From the cancellation and deposit dates on your bookings.
                            </p>
                        </Card>
                    )}

                    {unbooked.length > 0 && (
                        <Card className="p-3">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">
                                Nights not booked
                            </h2>
                            <ul className="space-y-1.5">
                                {unbooked.slice(0, 5).map((entry) => (
                                    <li key={entry.dayNumber}>
                                        <Link
                                            href={`${BASE}/itinerary`}
                                            className="flex items-baseline justify-between gap-2
                                                rounded-xl bg-amber-50 px-2.5 py-1.5 text-sm
                                                text-amber-900 hover:bg-amber-100"
                                        >
                                            <span className="min-w-0 truncate">
                                                Day {entry.dayNumber}
                                                {entry.base
                                                    ? ` — ${entry.base.name} is only ${entry.base.status}`
                                                    : ' — nowhere to sleep'}
                                            </span>
                                            <span className="shrink-0 tabular-nums text-[11px]">
                                                {entry.daysUntil != null ? `${entry.daysUntil}d` : ''}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-gray-400 mt-2">
                                Only shown inside two months of departure — the most expensive
                                mistake to notice late.
                            </p>
                        </Card>
                    )}

                    {completeness && completeness.days > 0 && (
                        <Card className="p-3">
                            <div className="flex items-baseline justify-between gap-2 mb-2">
                                <h2 className="text-sm font-semibold text-gray-900">
                                    Itinerary completeness
                                </h2>
                                <span className="text-sm font-semibold tabular-nums text-gray-900">
                                    {completeness.score}%
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-accent"
                                    style={{ width: `${completeness.score}%` }}
                                />
                            </div>
                            <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                                <li>
                                    {completeness.withBase}/{completeness.days} days have somewhere
                                    to sleep
                                </li>
                                <li>
                                    {completeness.booked}/{Math.max(completeness.withBase, 1)} of
                                    those are booked
                                </li>
                                <li>
                                    {completeness.withStops}/{completeness.days} have at least two
                                    things planned
                                </li>
                                {completeness.missingTravel.length > 0 && (
                                    <li className="text-amber-700">
                                        Day{completeness.missingTravel.length === 1 ? '' : 's'}{' '}
                                        {completeness.missingTravel.join(', ')}: the base changes with
                                        no travel leg
                                    </li>
                                )}
                            </ul>
                            {nudge && (
                                <p className="mt-2 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px]
                                    text-sky-900">
                                    {nudge}
                                </p>
                            )}
                        </Card>
                    )}
                </div>
            )}

            {/* ---- Progress ---- */}
            <Card className="p-3 shrink-0">
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
