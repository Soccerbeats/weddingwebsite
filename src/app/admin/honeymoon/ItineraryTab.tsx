'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    SPREAD_WARNING_KM, arrivalsOn, calendarMonths, dayHops, daysBeyondRange,
    dateForDay, isoOf,
    formatDate, formatDayDate, formatDistance, formatTime, hasCoords, legIsOvernight,
    travelModeMeta,
    type CalendarCell, type Day, type Place, type Stop, type TravelLeg,
} from '@/lib/honeymoon';
import { describeHours, stopIsOutsideHours } from '@/lib/honeymoonHours';
import { isAfterDark } from '@/lib/honeymoonSun';
import { buildTimeline, formatDuration } from '@/lib/honeymoonTimeline';
import { scheduledPlaceIds, suggestDay } from '@/lib/honeymoonPlaces';
import { conflictsOf, stayStretches } from '@/lib/honeymoonChecks';
import { DROP_TYPES, PLACE_DRAG, STOP_DRAG } from './dragTypes';
import type { TimelineRow } from '@/lib/honeymoonTimeline';
import BookingPanel from './BookingPanel';
import Markdown from './Markdown';
import { useTripIntel } from './useTripIntel';
import type { TripIntel } from './useTripIntel';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import PrintSheet, { DEFAULT_PRINT_OPTIONS, type PrintOptions } from './PrintSheet';
import TravelLegCard from './TravelLeg';
import {
    Button, Card, CategoryChip, EmptyState, InlineText, Modal, OverflowMenu, SelectField, TextField,
} from './ui';

type View = 'list' | 'calendar';

const VIEW_KEY = 'honeymoon.itinerary.view';

/**
 * @param panel Rendered as a narrow column beside the map rather than as the
 *   whole page. Everything that needs width or belongs to the page — the
 *   calendar view, print, export, the hint line — is dropped, and the days
 *   stack in one column whatever the window is doing.
 */
export default function ItineraryTab({ api, panel = false, onFocusDay }: {
    api: HoneymoonApi;
    panel?: boolean;
    /**
     * Given by the map's split view: frame the map on this day. Absent on the
     * Itinerary tab proper, where there is no map to move, and the button that
     * calls it is simply not rendered.
     */
    onFocusDay?: (day: Day) => void;
}) {
    const { data } = api;
    // Stable identity: a fresh `?? []` per render would make the memo below
    // recompute on every keystroke anywhere on the page.
    const days = useMemo(() => data?.days ?? [], [data]);
    /*
     * Road times and weather.
     *
     * Owned here rather than per day card so the whole trip's hops are one
     * request instead of one per card, and so a day that appears twice (the list
     * and the modal) does not ask twice.
     */
    const intel = useTripIntel(data);
    const [showAllConflicts, setShowAllConflicts] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [printOptions, setPrintOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
    const conflicts = useMemo(() => (data ? conflictsOf(data) : []), [data]);
    const stretches = useMemo(() => (data ? stayStretches(data) : []), [data]);

    // Remembered like the other view preferences, but locally: which way you
    // like to read the trip is about you and this browser, not about the trip.
    // Read after mount, not in the initial state: the server has no
    // localStorage, so seeding from it directly would render one view on the
    // server and the other on the client and blow up hydration.
    const [view, setView] = useState<View>('list');

    /**
     * The place a stop points at, opened for editing.
     *
     * Held here rather than in the stop row so there is one editor for the whole
     * tab — and so it works identically in the map's split view, where this same
     * component is the left-hand column.
     */
    const [editingPlace, setEditingPlace] = useState<Place | null>(null);
    useEffect(() => {
        const saved = localStorage.getItem(VIEW_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved === 'calendar' || saved === 'list') setView(saved);
    }, []);
    /**
     * Days that sit past the end of the trip's dates.
     *
     * Shortening the range in Settings no longer deletes them — it leaves them
     * here, holding everything you had planned, and they are flagged in red
     * until you either move their stops onto earlier days or put the dates back.
     */
    const beyond = useMemo(
        () => new Set(daysBeyondRange(
            days.map((d) => d.day_number),
            data?.trip.start_date ?? null,
            data?.trip.end_date ?? null,
        )),
        [days, data?.trip.start_date, data?.trip.end_date],
    );

    /** A column this narrow has no room for a month grid. */
    const shownView: View = panel ? 'list' : view;
    const chooseView = (next: View) => {
        setView(next);
        localStorage.setItem(VIEW_KEY, next);
    };

    // A slightly longer press than the stop handles use: days are the bigger,
    // rarer move, and a twitchy day drag while aiming at a stop is worse than a
    // fractionally slower one.
    const daySensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    );

    const onDayDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = days.map((d) => d.id);
        const from = ids.indexOf(Number(active.id));
        const to = ids.indexOf(Number(over.id));
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        api.reorder('days', ids);
    };

    if (!days.length) {
        return (
            <Card>
                <EmptyState
                    title="No days yet"
                    hint="Add your first day to start building the itinerary. Days are numbered, and turn into real dates once you set a start date in Settings."
                />
                <div className="flex justify-center pb-6">
                    <Button tone="primary" onClick={() => api.create('days', {})}>+ Add day 1</Button>
                </div>
            </Card>
        );
    }

    // Columns rather than one very wide card: a stop row stretched across 1600px
    // puts its time, name and actions a screen apart, and a trip is far easier to
    // read as a wall of days you can scan than as a single tall strip.
    return (
        <div className="space-y-3">
            {!panel && (
            <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-xs text-gray-400">
                    {view === 'list'
                        ? 'Drag a day by its ⠿ handle to reorder the trip — the days renumber and '
                            + 'their dates follow.'
                        : 'Click any day to open it.'}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        onClick={() => setPrinting(true)}
                        title="Choose what goes on the paper, then print"
                    >
                        🖨 Print
                    </Button>
                    {/* A real navigation to a download endpoint: next/link would
                        client-route it and nothing would download. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                        href="/api/admin/honeymoon/ics"
                        className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm
                            font-medium text-gray-700 hover:bg-gray-50 transition"
                        title="Every day, travel leg and timed stop, as a calendar file"
                    >
                        🗓 Export
                    </a>
                    <ViewToggle view={view} onChange={chooseView} />
                </div>
            </div>
            )}

            {beyond.size > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                    <p className="text-xs text-rose-800">
                        <strong className="font-semibold">
                            {beyond.size} day{beyond.size === 1 ? '' : 's'} past the end of the trip.
                        </strong>{' '}
                        The dates now stop at {formatDate(data?.trip.end_date)}, and the days below
                        marked in red fall after it. Nothing was deleted — move their stops onto
                        earlier days, delete the days you don&apos;t need, or set the dates back in
                        Settings.
                    </p>
                </div>
            )}

            {/* ---- What is wrong, and where you are sleeping ----
                Both are read-outs over the payload, and both were previously
                things you had to notice yourself by reading every card. */}
            {!panel && (conflicts.length > 0 || stretches.length > 0) && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {conflicts.length > 0 && (
                        <div className="rounded-2xl border border-gray-200 bg-white p-3">
                            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    Worth a look
                                </h3>
                                <span className="text-[11px] text-gray-400">
                                    {conflicts.filter((entry) => entry.severity === 'warn').length}
                                    {' '}to fix
                                </span>
                            </div>
                            <ul className="space-y-1">
                                {conflicts.slice(0, showAllConflicts ? 40 : 5).map((entry, index) => (
                                    <li
                                        key={`${entry.kind}-${entry.dayNumber}-${index}`}
                                        className={`rounded-xl px-2.5 py-1.5 text-[11px] ${
                                            entry.severity === 'warn'
                                                ? 'bg-amber-50 text-amber-900'
                                                : 'bg-gray-50 text-gray-600'}`}
                                    >
                                        {entry.message}
                                    </li>
                                ))}
                            </ul>
                            {conflicts.length > 5 && (
                                <button
                                    onClick={() => setShowAllConflicts((v) => !v)}
                                    className="mt-1.5 text-[11px] text-gray-500 underline
                                        decoration-dotted"
                                >
                                    {showAllConflicts
                                        ? 'Show fewer'
                                        : `Show all ${conflicts.length}`}
                                </button>
                            )}
                        </div>
                    )}

                    {stretches.length > 0 && (
                        <div className="rounded-2xl border border-gray-200 bg-white p-3">
                            <h3 className="mb-1.5 text-sm font-semibold text-gray-900">
                                Where you sleep
                            </h3>
                            <ul className="space-y-1">
                                {stretches.map((stretch) => (
                                    <li
                                        key={`${stretch.place?.id ?? 'none'}-${stretch.firstDay}`}
                                        className="flex flex-wrap items-baseline gap-x-2 text-[11px]"
                                    >
                                        <span className="tabular-nums text-gray-400">
                                            {stretch.firstDay === stretch.lastDay
                                                ? `Day ${stretch.firstDay}`
                                                : `Days ${stretch.firstDay}–${stretch.lastDay}`}
                                        </span>
                                        <span className="font-medium text-gray-800">
                                            {stretch.place?.name ?? 'nowhere set'}
                                        </span>
                                        <span className="text-gray-400">
                                            {stretch.nights} night{stretch.nights === 1 ? '' : 's'}
                                        </span>
                                        {stretch.booking?.confirmation && (
                                            <span className="text-emerald-700">
                                                {stretch.booking.confirmation}
                                            </span>
                                        )}
                                        {stretch.mismatch && (
                                            <span className="text-rose-700">
                                                booked dates do not match these nights
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-1.5 text-[11px] text-gray-400">
                                A base is set per day; a stay is a stretch. This is the sentence a
                                confirmation email gets checked against.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Invisible on screen; the only thing on the page in print. Never in
                a panel: two copies on one page would print the trip twice. */}
            {!panel && <PrintSheet api={api} options={printOptions} />}

            {/* Print used to be all-or-nothing: every day, every note, one
                column of A4. These are the four choices that actually change what
                you carry. */}
            {printing && (
                <Modal open onClose={() => setPrinting(false)} title="Print the trip">
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Days</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                                <button
                                    onClick={() => setPrintOptions({ ...printOptions, days: [] })}
                                    className={`rounded-full border px-2.5 py-1 text-xs ${
                                        printOptions.days.length === 0
                                            ? 'border-transparent bg-accent text-white'
                                            : 'border-gray-200 text-gray-600'}`}
                                >
                                    All
                                </button>
                                {days.map((day) => {
                                    const on = printOptions.days.includes(day.day_number);
                                    return (
                                        <button
                                            key={day.id}
                                            onClick={() => setPrintOptions({
                                                ...printOptions,
                                                days: on
                                                    ? printOptions.days.filter(
                                                        (n) => n !== day.day_number,
                                                    )
                                                    : [...printOptions.days, day.day_number],
                                            })}
                                            className={`rounded-full border px-2.5 py-1 text-xs
                                                tabular-nums ${on
                                                ? 'border-transparent bg-accent text-white'
                                                : 'border-gray-200 text-gray-600'}`}
                                        >
                                            {day.day_number}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {([
                            ['bookings', 'Confirmation numbers and contacts'],
                            ['info', 'Emergency and practical details'],
                            ['notes', 'The guide notes'],
                            ['a5', 'A5 booklet (smaller type, folds into a passport)'],
                        ] as const).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={printOptions[key] as boolean}
                                    onChange={(e) => setPrintOptions({
                                        ...printOptions, [key]: e.target.checked,
                                    })}
                                    className="size-4 rounded accent-accent"
                                />
                                {label}
                            </label>
                        ))}

                        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                            <Button onClick={() => setPrinting(false)}>Cancel</Button>
                            <Button
                                tone="primary"
                                onClick={() => {
                                    setPrinting(false);
                                    // A beat, so the dialog is gone before the
                                    // print dialog snapshots the page.
                                    setTimeout(() => window.print(), 50);
                                }}
                            >
                                Print
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {shownView === 'calendar' ? (
                <CalendarView
                    api={api}
                    days={days}
                    onEditPlace={setEditingPlace}
                    onFocusDay={onFocusDay}
                    beyond={beyond}
                    intel={intel}
                />
            ) : (
                <DndContext sensors={daySensors} collisionDetection={closestCenter} onDragEnd={onDayDragEnd}>
                    <SortableContext items={days.map((d) => d.id)} strategy={rectSortingStrategy}>
                        <div className={`grid gap-3 items-start ${panel
                            ? 'grid-cols-1'
                            : 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3'}`}>
                            {days.map((day) => (
                                <DayCard
                                    key={day.id}
                                    day={day}
                                    api={api}
                                    intel={intel}
                                    compact={panel}
                                    onEditPlace={setEditingPlace}
                                    onFocusDay={onFocusDay}
                                    beyondRange={beyond.has(day.day_number)}
                                    arrivals={arrivalsOn(days, day.day_number)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            <div className="flex justify-center pt-1">
                <Button tone="primary" onClick={() => api.create('days', {})}>
                    + Add day {Math.max(0, ...days.map((d) => d.day_number)) + 1}
                </Button>
            </div>

            {/* Never `place={null}`: a null place means "create new" to the
                editor, and the itinerary has no reason to offer that. */}
            <PlaceEditor
                api={api}
                place={editingPlace}
                open={editingPlace != null}
                onClose={() => setEditingPlace(null)}
            />
        </div>
    );
}

/** Two views of the same trip: the working list, and the shape of it. */
function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
    const options: { key: View; label: string }[] = [
        { key: 'list', label: '☰ Days' },
        { key: 'calendar', label: '🗓 Calendar' },
    ];
    return (
        <div className="shrink-0 inline-flex rounded-full border border-gray-200 bg-white p-0.5">
            {options.map((opt) => (
                <button
                    key={opt.key}
                    onClick={() => onChange(opt.key)}
                    aria-pressed={view === opt.key}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition
                        ${view === opt.key
                        ? 'bg-accent text-white'
                        : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The trip on a real calendar.
 *
 * A numbered list answers "what is day 6"; this answers "what are we doing on
 * the Saturday" and "how much of September does this eat" — questions the list
 * genuinely can't. It needs a start date to exist at all, so without one it says
 * so and points at Settings rather than rendering an empty grid.
 *
 * Cells are summaries, not editors: clicking one opens the very same day card
 * the list view uses, so there is one place a day is edited and no second
 * implementation to keep in step.
 */
function CalendarView({ api, days, onEditPlace, onFocusDay, beyond, intel }: {
    api: HoneymoonApi;
    days: Day[];
    onEditPlace: (place: Place) => void;
    onFocusDay?: (day: Day) => void;
    /** Day numbers past the end of the trip's dates. */
    beyond: Set<number>;
    intel: TripIntel;
}) {
    const startDate = api.data?.trip.start_date ?? null;
    const [openDayId, setOpenDayId] = useState<number | null>(null);

    // The highest day number, not the count: the two differ whenever numbering
    // has a gap, and a grid built from the count drops the last day.
    const lastDay = useMemo(() => Math.max(0, ...days.map((d) => d.day_number)), [days]);
    const months = useMemo(
        () => calendarMonths(startDate, lastDay),
        [startDate, lastDay],
    );
    const dayByNumber = useMemo(() => {
        const map = new Map<number, Day>();
        for (const day of days) map.set(day.day_number, day);
        return map;
    }, [days]);

    const openDay = openDayId == null ? null : days.find((d) => d.id === openDayId) ?? null;

    if (!months.length) {
        return (
            <Card>
                <EmptyState
                    title="No start date yet"
                    hint="A calendar needs to know when day 1 is. Set the trip's start date in Settings and every day lands on a real date."
                />
            </Card>
        );
    }

    return (
        <>
            <div className="space-y-3">
                {months.map((month) => (
                    <Card key={month.key} className="p-3">
                        <h2 className="text-sm font-semibold text-gray-900 mb-2 px-1">{month.label}</h2>
                        <div className="grid grid-cols-7 gap-1">
                            {WEEKDAYS.map((weekday) => (
                                <div
                                    key={weekday}
                                    className="text-[11px] uppercase tracking-wide text-gray-400
                                        font-semibold text-center pb-1"
                                >
                                    {weekday}
                                </div>
                            ))}
                            {month.cells.map((cell) => {
                                const day = cell.dayNumber == null
                                    ? null
                                    : dayByNumber.get(cell.dayNumber) ?? null;
                                return (
                                    <CalendarCellBox
                                        key={cell.key}
                                        cell={cell}
                                        day={day}
                                        api={api}
                                        beyondRange={day != null && beyond.has(day.day_number)}
                                        arrivals={day ? arrivalsOn(days, day.day_number) : []}
                                        onOpen={() => day && setOpenDayId(day.id)}
                                    />
                                );
                            })}
                        </div>
                    </Card>
                ))}
            </div>

            {/* The day card drags its stops, so it needs a DnD context of its own
                out here — the calendar grid deliberately has none. */}
            <Modal
                open={openDay != null}
                onClose={() => setOpenDayId(null)}
                title={openDay
                    ? `Day ${openDay.day_number}${openDay.title ? ` — ${openDay.title}` : ''}`
                    : ''}
                wide
            >
                {openDay && (
                    <DndContext collisionDetection={closestCenter} onDragEnd={() => {}}>
                        <SortableContext items={[openDay.id]} strategy={rectSortingStrategy}>
                            <DayCard
                                day={openDay}
                                api={api}
                                intel={intel}
                                onEditPlace={onEditPlace}
                                onFocusDay={onFocusDay}
                                beyondRange={beyond.has(openDay.day_number)}
                                arrivals={arrivalsOn(days, openDay.day_number)}
                            />
                        </SortableContext>
                    </DndContext>
                )}
            </Modal>
        </>
    );
}

function CalendarCellBox({ cell, day, api, beyondRange, arrivals, onOpen }: {
    cell: CalendarCell;
    day: Day | null;
    api: HoneymoonApi;
    beyondRange: boolean;
    /** Legs landing on this day, having left on an earlier one. */
    arrivals: { leg: TravelLeg; fromDay: Day }[];
    onOpen: () => void;
}) {
    // Outside the trip: a real date, greyed, so the shape of the trip against
    // the month is visible.
    if (!day) {
        return (
            <div className={`min-h-[5.5rem] rounded-xl border border-gray-100 p-1.5
                ${cell.inMonth ? 'bg-gray-50/60' : 'bg-transparent'}`}>
                <span className={`text-[11px] tabular-nums
                    ${cell.inMonth ? 'text-gray-400' : 'text-gray-300'}`}>
                    {cell.dayOfMonth}
                </span>
            </div>
        );
    }

    const base = day.base_place_id == null ? null : api.placeById.get(day.base_place_id);

    return (
        <button
            onClick={onOpen}
            title={beyondRange ? 'This day falls past the end of the trip' : undefined}
            className={`min-h-[5.5rem] rounded-xl border p-1.5 text-left transition
                focus:outline-none focus:ring-2 overflow-hidden ${beyondRange
                ? 'border-rose-300 bg-rose-50 hover:bg-rose-100 hover:border-rose-400 focus:ring-rose-300'
                : 'border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent/50 focus:ring-accent/30'}`}
        >
            <div className="flex items-baseline justify-between gap-1">
                <span className="text-[11px] tabular-nums text-gray-500">{cell.dayOfMonth}</span>
                <span className={`text-[10px] font-semibold shrink-0
                    ${beyondRange ? 'text-rose-700' : 'text-accent'}`}>
                    Day {day.day_number}
                </span>
            </div>
            {day.title && (
                <p className="text-[11px] font-medium text-gray-800 truncate">{day.title}</p>
            )}
            {/* Landing here from an earlier day, before this day's own departures:
                you arrive before you leave again. */}
            {arrivals.map(({ leg }) => (
                <p key={`in-${leg.id}`} className="text-[10px] text-slate-500 truncate">
                    ↓ {travelModeMeta(leg.mode).icon}{' '}
                    {leg.arrive_time ? formatTime(leg.arrive_time) : ''} {leg.to_text ?? ''}
                </p>
            ))}
            {day.travel.map((leg) => (
                <p key={leg.id} className="text-[10px] text-slate-500 truncate">
                    {travelModeMeta(leg.mode).icon}{' '}
                    {leg.depart_time ? formatTime(leg.depart_time) : ''} {leg.to_text ?? ''}
                    {legIsOvernight(leg) && (
                        <span className="font-semibold"> +{leg.arrive_day_offset}d</span>
                    )}
                </p>
            ))}
            {/* Three, then a count: any more and the cell sets the row height for
                the whole week. */}
            {day.stops.slice(0, 3).map((stop) => (
                <p key={stop.id} className="text-[10px] text-gray-600 truncate">
                    {stop.start_time ? `${formatTime(stop.start_time)} ` : '• '}
                    {stop.custom_label
                        || (stop.place_id != null ? api.placeById.get(stop.place_id)?.name : '')
                        || 'Untitled stop'}
                </p>
            ))}
            {day.stops.length > 3 && (
                <p className="text-[10px] text-gray-400">+{day.stops.length - 3} more</p>
            )}
            {!day.stops.length && !day.title && base && (
                <p className="text-[10px] text-gray-500 truncate">🛏 {base.name}</p>
            )}
        </button>
    );
}

function DayCard({
    day, api, intel, onEditPlace, onFocusDay, beyondRange = false, arrivals = [],
    compact = false,
}: {
    day: Day;
    api: HoneymoonApi;
    intel: TripIntel;
    onEditPlace: (place: Place) => void;
    /** Rendered in the map's split view, in a column rather than a page. */
    compact?: boolean;
    onFocusDay?: (day: Day) => void;
    /** This day is numbered past the end of the trip's dates. */
    beyondRange?: boolean;
    /** Legs that left on an earlier day and land on this one. */
    arrivals?: { leg: TravelLeg; fromDay: Day }[];
}) {
    const {
        attributes: dayAttributes, listeners: dayListeners, setNodeRef: setDayRef,
        transform: dayTransform, transition: dayTransition, isDragging: dayDragging,
    } = useSortable({ id: day.id });
    const [adding, setAdding] = useState(false);
    const [pickPlace, setPickPlace] = useState('');
    const [customLabel, setCustomLabel] = useState('');
    const [showNotes, setShowNotes] = useState(false);
    const [suggestion, setSuggestion] = useState<{ names: string[]; why: string } | null>(null);
    /** True while something droppable is over this card. */
    const [dropping, setDropping] = useState(false);
    /** Index the "+ here" row is open at, or null. */
    const [insertAt, setInsertAt] = useState<number | null>(null);

    const startDate = api.data?.trip.start_date ?? null;
    const realDate = formatDayDate(startDate, day.day_number);
    /** The stay this day is based at, if one is set — editable like any stop. */
    const base = day.base_place_id == null ? null : api.placeById.get(day.base_place_id) ?? null;
    /**
     * Whether there is anything on this day the map could actually fly to.
     *
     * A day of unpinned stops has no bounds, so the button is disabled and says
     * why rather than looking broken when nothing moves.
     */
    const pinnedStops = day.stops.some((stop) => {
        const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
        return place != null && hasCoords(place);
    });
    const hops = dayHops(day.stops, api.placeById);
    const longest = hops.reduce((max, hop) => Math.max(max, hop.km), 0);

    /*
     * The day as a sequence.
     *
     * Straight-line kilometres said how far apart the stops are; this says
     * whether the day works — when you actually arrive everywhere, given the
     * durations and the driving, and which stops you cannot make. Road times
     * when they have been looked up, a labelled estimate when they have not.
     */
    const timeline = buildTimeline(day.stops, api.placeById, base, intel.hopFor);
    const rowFor = (stopId: number) => timeline.rows.find((row) => row.stop.id === stopId) ?? null;
    const dayIntel = intel.intelFor(day.day_number);
    /** How many days the trip has, for "Day 3 of 14". */
    const totalDays = api.data?.days.length ?? 0;
    /**
     * The base's cover photo, if it has one.
     *
     * `photos[0]` is the one uploaded here; `image_url` is the one scraped from a
     * listing. Either is better than nothing, and the uploaded one wins because
     * you chose it.
     */
    const baseImage = base?.photos?.[0]
        ? `/api/photos/${base.photos[0]}`
        : base?.image_url ?? null;

    /**
     * The guide, filtered to where you are.
     *
     * The region's own description plus any note filed against that region. Only
     * shown when the day has a base with a region — otherwise there is no "where
     * you are" to be about.
     */
    const baseRegion = base?.region_id != null
        ? (api.data?.regions ?? []).find((region) => region.id === base.region_id) ?? null
        : null;
    const regionName = baseRegion?.name ?? null;
    const regionNotes = [
        ...(baseRegion?.description?.trim()
            ? [{ key: `region-${baseRegion.id}`, title: baseRegion.name, body: baseRegion.description }]
            : []),
        ...(api.data?.notes ?? [])
            .filter((note) => baseRegion != null && note.region_id === baseRegion.id)
            .map((note) => ({ key: `note-${note.id}`, title: note.title, body: note.body })),
    ];
    const dayDate = startDate
        ? (() => {
            const date = dateForDay(startDate, day.day_number);
            return date ? isoOf(date) : null;
        })()
        : null;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        // Touch needs a hold delay or the page can't be scrolled past a day.
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    );

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = day.stops.map((s) => s.id);
        const from = ids.indexOf(Number(active.id));
        const to = ids.indexOf(Number(over.id));
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        // Optimistic: the stop stays where it was dropped instead of snapping
        // back for the length of a whole-payload refetch.
        api.reorderStops(day.id, ids);
    };

    /**
     * Fill an empty day from what is nearby and already liked.
     *
     * Not clever, and not meant to be: places within 15 km of the base that you
     * have not already scheduled and have not said no to, one per category so
     * the day is not four temples, ordered by a nearest-neighbour walk so the
     * driving is not absurd. A draft for a free day beats an empty one, and every
     * stop it adds is an ordinary stop you can delete.
     */
    const suggest = async () => {
        if (!base) {
            setSuggestion({ names: [], why: 'Set a stay for this day first — the suggestions are places near it.' });
            return;
        }
        const proposal = suggestDay(
            base,
            api.data?.places ?? [],
            scheduledPlaceIds(api.data?.days ?? []),
        );
        if (!proposal) {
            setSuggestion({ names: [], why: 'Nothing nearby that is unscheduled and not already ruled out.' });
            return;
        }
        const ok = await api.createMany('stops', proposal.places.map((place, index) => ({
            day_id: day.id,
            place_id: place.id,
            sort_order: day.stops.length + index,
        })));
        await api.refresh();
        if (ok) {
            setSuggestion({
                names: proposal.places.map((place) => place.name),
                why: `${proposal.why} · about ${formatDistance(proposal.km)} of driving in total`,
            });
        }
    };

    const addStop = async () => {
        // `insertAt` is a position, not a flag: the new stop takes that index and
        // everything from there down shifts by one, in the same transaction that
        // creates it.
        const at = insertAt;
        const base = { day_id: day.id, ...(at != null ? { sort_order: at } : {}) };
        let created = false;
        if (pickPlace) {
            created = await api.create('stops', { ...base, place_id: Number(pickPlace) });
        } else if (customLabel.trim()) {
            created = await api.create('stops', { ...base, custom_label: customLabel.trim() });
        } else return;

        if (created && at != null) {
            // Renumber the day around the insertion, in one request.
            const ids = (api.data?.days.find((d) => d.id === day.id)?.stops ?? [])
                .map((stop) => stop.id);
            if (ids.length) await api.reorder('stops', ids);
        }
        setPickPlace('');
        setCustomLabel('');
        setAdding(false);
        setInsertAt(null);
    };

    /**
     * Put a fresh day immediately before or after this one.
     *
     * The API only ever appends — `POST {}` gets you "the next day" — so this
     * creates it at the end and then reorders the whole trip with the new id
     * spliced into place. That is the same call the drag handle makes, which
     * renumbers every day and carries their dates with them, so inserting a day
     * in the middle of a trip shifts the rest along rather than leaving a hole.
     *
     * The whole list is sent, not just the moved part: day_number is UNIQUE, and
     * a day left out of the reorder keeps its old number and collides.
     */
    const insertDay = async (side: 'before' | 'after') => {
        const created = await api.createRow('days', {});
        if (created?.id == null) return;
        // `createRow` deliberately doesn't refetch, so this list is the trip as
        // it was — which is exactly what we want to splice into.
        const ids = (api.data?.days ?? []).map((d) => d.id).filter((id) => id !== created.id);
        const at = ids.indexOf(day.id) + (side === 'after' ? 1 : 0);
        ids.splice(Math.max(0, at), 0, created.id);
        await api.reorder('days', ids);
    };

    /**
     * Copy a day, structure and all, onto the end of the trip.
     *
     * The second beach day is mostly the first beach day. Copying it beats
     * rebuilding it stop by stop, and it lands at the end where a new day
     * belongs — moving it is a drag away.
     */
    const duplicate = async (where: 'end' | 'after' = 'end') => {
        const next = Math.max(0, ...(api.data?.days ?? []).map((d) => d.day_number)) + 1;
        const created = await api.createRow('days', {
            day_number: next,
            title: day.title ? `${day.title} (copy)` : '',
            base_place_id: day.base_place_id,
            notes: day.notes ?? '',
        });
        if (created?.id == null) return;
        if (day.stops.length) {
            await api.createMany('stops', day.stops.map((stop) => ({
                day_id: created.id,
                place_id: stop.place_id,
                custom_label: stop.custom_label,
                start_time: stop.start_time,
                duration_minutes: stop.duration_minutes,
                notes: stop.notes,
                sort_order: stop.sort_order,
            })));
        }
        // The travel legs come too: "the same again" includes how you got there.
        if (day.travel.length) {
            await api.createMany('travel', day.travel.map(({ id, day_id, ...rest }) => {
                void id; void day_id;
                return { ...rest, day_id: created.id };
            }));
        }
        if (where === 'after') {
            /*
             * Splice it in rather than leaving it at the end.
             *
             * Day numbers are unique and the reorder endpoint renumbers the whole
             * trip in one transaction — the same call the drag handle makes — so
             * the dates of every later day follow along.
             */
            const ids = (api.data?.days ?? []).map((d) => d.id).filter((id) => id !== created.id);
            const at = ids.indexOf(day.id) + 1;
            ids.splice(Math.max(0, at), 0, created.id);
            await api.reorder('days', ids);
        }
        await api.refresh();
    };

    return (
        <div
            ref={setDayRef}
            style={{ transform: CSS.Transform.toString(dayTransform), transition: dayTransition }}
            // The ring goes on the wrapper rather than the Card: Card sets its own
            // border colour, and two same-specificity border classes leave which
            // one wins up to the order Tailwind happened to emit them in.
            className={`${dayDragging ? 'opacity-60' : ''}
                ${beyondRange ? 'rounded-2xl ring-2 ring-rose-300' : ''}`}
            /*
             * Native drag-and-drop, deliberately not dnd-kit.
             *
             * The in-day stop list is a dnd-kit sortable and stays one — that is
             * what it is good at. Dropping *onto* a day is a different problem:
             * the thing being dragged may live in another component tree
             * entirely (the Places panel beside the map on the split view), and
             * sharing a dnd-kit context across two panels means hoisting it into
             * the map's layout and threading it through both tabs. The browser's
             * own drag API crosses trees for free, which is exactly the property
             * needed here.
             */
            onDragOver={(event) => {
                if (!event.dataTransfer.types.some((type) => DROP_TYPES.includes(type))) return;
                event.preventDefault();
                setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event) => {
                setDropping(false);
                const placeId = Number(event.dataTransfer.getData(PLACE_DRAG));
                const stopPayload = event.dataTransfer.getData(STOP_DRAG);
                if (Number.isFinite(placeId) && placeId > 0) {
                    event.preventDefault();
                    void api.create('stops', { day_id: day.id, place_id: placeId });
                    return;
                }
                if (!stopPayload) return;
                event.preventDefault();
                const [stopId, fromDayId] = stopPayload.split(':').map(Number);
                if (!Number.isFinite(stopId) || fromDayId === day.id) return;
                void api.update('stops', {
                    id: stopId, day_id: day.id, sort_order: day.stops.length,
                });
            }}
        >
        <Card className={`overflow-hidden p-4 transition ${dropping
            ? 'ring-2 ring-accent bg-accent/5' : ''}`}>
            {/* The stay's own photo, as a band across the top. A trip of fourteen
                identical white cards is hard to navigate; the picture of where you
                are sleeping is the fastest way to know which day you are looking
                at. Only when there is one — no placeholder. */}
            {baseImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={baseImage}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="-mx-4 -mt-4 mb-3 h-20 w-[calc(100%+2rem)] object-cover bg-gray-100"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
            )}
            {beyondRange && (
                <p className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1.5
                    text-[11px] text-rose-700">
                    Past the end of the trip{formatDate(api.data?.trip.end_date)
                        ? ` (${formatDate(api.data?.trip.end_date)})` : ''}. Move these stops onto an
                    earlier day, or extend the dates in Settings.
                </p>
            )}
            {/* ---- Day header ---- */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        {/* Its own handle: dragging anywhere on the card would fight
                            the stop handles and the inline text fields inside it. */}
                        <button
                            {...dayAttributes}
                            {...dayListeners}
                            className="cursor-grab active:cursor-grabbing text-gray-300
                                hover:text-gray-500 touch-none -ml-1 px-1 shrink-0"
                            aria-label={`Drag day ${day.day_number} to reorder`}
                        >
                            ⠿
                        </button>
                        <span className="text-sm font-semibold text-gray-900 shrink-0">
                            Day {day.day_number}
                            {totalDays > 1 && (
                                <span className="font-normal text-gray-400"> of {totalDays}</span>
                            )}
                        </span>
                        {realDate && <span className="text-xs text-gray-400">{realDate}</span>}
                    </div>
                    <InlineText
                        value={day.title ?? ''}
                        placeholder="What's this day about?"
                        className="font-medium text-gray-800 -ml-2 mt-0.5"
                        onCommit={(title) => api.update('days', { id: day.id, title })}
                    />
                </div>
                {onFocusDay && (
                    <button
                        onClick={() => onFocusDay(day)}
                        disabled={!pinnedStops}
                        title={pinnedStops
                            ? `Move the map to day ${day.day_number}'s stops, and show the route`
                            : 'Nothing on this day is pinned yet'}
                        className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1
                            text-[11px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900
                            disabled:opacity-40 disabled:hover:bg-gray-50 transition"
                    >
                        ◎ Map
                    </button>
                )}
                <OverflowMenu
                    items={[
                        {
                            label: `Add a day before day ${day.day_number}`,
                            onClick: () => insertDay('before'),
                        },
                        {
                            label: `Add a day after day ${day.day_number}`,
                            onClick: () => insertDay('after'),
                        },
                        {
                            label: 'Add travel leg',
                            onClick: () => api.create('travel', { day_id: day.id, mode: 'flight' }),
                        },
                        { label: 'Duplicate day (at the end)', onClick: () => duplicate('end') },
                        // The common case: "the same again tomorrow". Appending
                        // and then dragging it back seven positions was the only
                        // way to say that.
                        { label: 'Duplicate right after this one', onClick: () => duplicate('after') },
                        {
                            label: showNotes ? 'Hide notes' : 'Add a note',
                            onClick: () => setShowNotes((v) => !v),
                        },
                        {
                            // No confirm: this is undoable, stops and travel legs
                            // included, and one speed bump is enough for one hazard.
                            label: 'Delete day',
                            danger: true,
                            onClick: () => api.removeDay(day),
                        },
                    ]}
                />
            </div>

            {/* ---- Day notes ---- */}
            {/* The column has been in the schema since day one with nothing to
                write to it. Shown when there's something in it, or when asked
                for — a permanent empty box on every card earns its space only
                on the days that need one. */}
            {(showNotes || day.notes) && (
                <div className="mt-2 rounded-2xl bg-amber-50/60 border border-amber-100 px-2 py-1">
                    <InlineText
                        multiline
                        value={day.notes ?? ''}
                        placeholder="Anything about this day — pack the good camera, book ahead…"
                        className="text-sm text-gray-700"
                        onCommit={(notes) => api.update('days', { id: day.id, notes })}
                    />
                </div>
            )}

            {/* ---- What lands here ---- */}
            {/* A red-eye belongs to the day it departs, but the day it lands is
                not a free morning — without this, day 4 looks empty when you
                actually touch down on it at six. */}
            {arrivals.map(({ leg, fromDay }) => (
                <p
                    key={`in-${leg.id}`}
                    className="mt-2 rounded-2xl bg-slate-100 border border-slate-200 px-2.5 py-1.5
                        text-[11px] text-slate-700"
                >
                    {travelModeMeta(leg.mode).icon} Arrives
                    {leg.arrive_time ? ` ${formatTime(leg.arrive_time)}` : ''}
                    {leg.to_text ? ` at ${leg.to_text}` : ''} — the{' '}
                    {travelModeMeta(leg.mode).label.toLowerCase()} that left on day{' '}
                    {fromDay.day_number}
                    {leg.depart_time ? ` at ${formatTime(leg.depart_time)}` : ''}.
                </p>
            ))}

            {/* ---- Base ---- */}
            <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold shrink-0">
                    Base
                </span>
                <SelectField
                    className="max-w-xs"
                    value={day.base_place_id != null ? String(day.base_place_id) : ''}
                    onChange={(e) => api.update('days', {
                        id: day.id,
                        base_place_id: e.target.value === '' ? null : Number(e.target.value),
                    })}
                >
                    <option value="">— not set —</option>
                    {(api.data?.places ?? [])
                        // A removed stay is no longer a candidate to sleep in —
                        // unless it is already this day's base, which must stay
                        // listed or the day would silently lose it.
                        .filter((p) => (p.category === 'stay' && !p.archived)
                            || p.id === day.base_place_id)
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SelectField>
                {/* The base is a place too — the same one you booked and will want
                    to add a confirmation number to. */}
                {base && (
                    <button
                        onClick={() => onEditPlace(base)}
                        title={`Edit ${base.name}`}
                        aria-label={`Edit ${base.name}`}
                        className="shrink-0 text-gray-300 hover:text-accent px-1 leading-none"
                    >
                        ✎
                    </button>
                )}
            </div>

            {/* ---- Travel legs ---- */}
            {/* The same editor the Travel tab uses — a leg can be worked on from
                either end, and one form means they cannot drift apart. */}
            {day.travel.map((leg) => (
                <div key={leg.id} className="mt-2">
                    <TravelLegCard leg={leg} day={day} api={api} />
                </div>
            ))}

            {/* ---- Stops ---- */}
            <div className="mt-3">
                {day.stops.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">Nothing planned yet.</p>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext
                            items={day.stops.map((s) => s.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <ul className="space-y-1.5">
                                {day.stops.map((stop, index) => (
                                    <StopRow
                                        key={stop.id}
                                        stop={stop}
                                        index={index}
                                        api={api}
                                        compact={compact}
                                        dayNumber={day.day_number}
                                        hopKm={hops.find((h) => h.fromIndex === index)?.km ?? null}
                                        row={rowFor(stop.id)}
                                        dayDate={dayDate}
                                        sunset={dayIntel.sunset}
                                        phase={api.data?.trip.phase ?? 'planning'}
                                        previousEnd={index > 0
                                            ? timeline.rows[index - 1]?.leave
                                                ?? timeline.rows[index - 1]?.arrive ?? null
                                            : null}
                                        onEditPlace={onEditPlace}
                                        // Insert *above* this row: the gesture is
                                        // "something goes here", and the row you
                                        // point at is the one it goes before.
                                        onInsertBefore={() => {
                                            setInsertAt(index);
                                            setAdding(true);
                                        }}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* The region you are in, and what the guide says about it.
                A note tied to a region, or the region's own write-up, surfaces on
                the day you are actually sleeping there — which is the only moment
                either of them is worth reading. */}
            {regionNotes.length > 0 && (
                <details className="mt-2 rounded-xl bg-amber-50/60 px-2.5 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-amber-900">
                        {regionName ? `About ${regionName}` : 'Guide notes'}
                        {' '}({regionNotes.length})
                    </summary>
                    <div className="mt-1.5 space-y-2">
                        {regionNotes.map((note) => (
                            <div key={note.key}>
                                <p className="text-[11px] font-semibold text-amber-900">
                                    {note.title}
                                </p>
                                <Markdown
                                    source={note.body}
                                    className="text-[11px] text-amber-900/90"
                                />
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Weather, daylight and the day's driving: three lines that answer
                "is this a good day for this" without leaving the card. */}
            {(dayIntel.weather || dayIntel.sunrise || timeline.driveMinutes > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]
                    text-gray-500">
                    {dayIntel.weather && (
                        <span title={dayIntel.weather.kind === 'forecast'
                            ? 'Forecast from Open-Meteo'
                            : 'The month’s average over the last decade — too far out to forecast'}>
                            {dayIntel.weather.kind === 'climate' && '≈ '}
                            {dayIntel.weather.high != null && `${Math.round(dayIntel.weather.high)}°`}
                            {dayIntel.weather.low != null && ` / ${Math.round(dayIntel.weather.low)}°`}
                            {dayIntel.weather.label && ` · ${dayIntel.weather.label}`}
                            {dayIntel.weather.rain_chance != null
                                && ` · ${Math.round(dayIntel.weather.rain_chance)}%${
                                    dayIntel.weather.kind === 'climate' ? ' of days wet' : ' rain'}`}
                        </span>
                    )}
                    {dayIntel.sunrise && dayIntel.sunset && (
                        <span className="tabular-nums" title="Sunrise and sunset at the day’s base">
                            ☀ {dayIntel.sunrise} – {dayIntel.sunset}
                        </span>
                    )}
                    {timeline.driveMinutes > 0 && (
                        <span
                            className={timeline.longDrive ? 'text-amber-700 font-medium' : ''}
                            title={timeline.estimated
                                ? 'Partly estimated from straight-line distance'
                                : 'Driving time from OSRM'}
                        >
                            🚗 {formatDuration(timeline.driveMinutes * 60)}
                            {timeline.estimated && ' (est.)'}
                        </span>
                    )}
                </div>
            )}

            {timeline.lateCount > 0 && (
                <p className="text-[11px] text-rose-700 bg-rose-50 rounded-xl px-2.5 py-1.5 mt-2">
                    ⚠ {timeline.lateCount === 1 ? 'One stop' : `${timeline.lateCount} stops`} cannot be
                    reached at the time set — the drive from the stop before puts you there later.
                    The arrival times below are the honest ones.
                </p>
            )}
            {timeline.overlapCount > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-2.5 py-1.5 mt-2">
                    ⚠ Two stops overlap: one is still going when the next is due to start.
                </p>
            )}
            {timeline.longDrive && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-2.5 py-1.5 mt-2">
                    ⚠ {formatDuration(timeline.driveMinutes * 60)} of driving on this day. That is
                    most of it spent in a car.
                </p>
            )}

            {longest >= SPREAD_WARNING_KM && !timeline.longDrive && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-2.5 py-1.5 mt-2">
                    ⚠ This day covers {formatDistance(longest)} in one hop. On Bali&apos;s roads that is a
                    long way — consider splitting it or moving the far stop to another day.
                </p>
            )}

            {/* ---- Add stop ---- */}
            {adding ? (
                <div className="mt-3 rounded-2xl border border-gray-200 p-3 space-y-2">
                    {insertAt != null && (
                        <p className="text-[11px] text-accent">
                            Inserting at position {insertAt + 1} of {day.stops.length + 1}.
                        </p>
                    )}
                    <SelectField value={pickPlace} onChange={(e) => setPickPlace(e.target.value)}>
                        <option value="">— pick a place from your library —</option>
                        {(api.data?.places ?? []).map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </SelectField>
                    <div className="text-[11px] text-gray-400 text-center">or</div>
                    <TextField
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder="Something not in the library — lunch near the rice terraces"
                    />
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => { setAdding(false); setInsertAt(null); }}>
                            Cancel
                        </Button>
                        <Button
                            tone="primary"
                            onClick={addStop}
                            disabled={!pickPlace && !customLabel.trim()}
                        >
                            Add stop
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => setAdding(true)}
                        className="text-sm text-gray-400 hover:text-gray-700"
                    >
                        + Add stop
                    </button>
                    <button
                        onClick={suggest}
                        title="Three places near the stay that you have not scheduled or ruled out"
                        className="text-sm text-gray-400 hover:text-accent"
                    >
                        ✨ Suggest a day
                    </button>
                </div>
            )}

            {suggestion && (
                <p className="mt-2 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-900">
                    {suggestion.names.length > 0
                        ? `Added ${suggestion.names.join(', ')} — ${suggestion.why}`
                        : suggestion.why}
                    <button
                        onClick={() => setSuggestion(null)}
                        className="ml-2 underline decoration-dotted"
                    >
                        dismiss
                    </button>
                </p>
            )}
        </Card>
        </div>
    );
}

function StopRow({
    stop, index, api, dayNumber, hopKm, row, dayDate, sunset, phase, previousEnd, onEditPlace,
    onInsertBefore, compact = false,
}: {
    stop: Stop;
    index: number;
    api: HoneymoonApi;
    /** Rendered in the map's split view — see the row itself for what changes. */
    compact?: boolean;
    dayNumber: number;
    hopKm: number | null;
    onEditPlace: (place: Place) => void;
    /** This stop's line in the day's timeline: real arrival, lateness, walkability. */
    row: TimelineRow | null;
    /** The day's date, for the opening-hours check. */
    dayDate: string | null;
    /** Sunset at the day's base, to flag a stop planned after dark. */
    sunset: string | null;
    /** planning | travelling | after — see the post-trip block. */
    phase: 'planning' | 'travelling' | 'after';
    /**
     * When the stop before this one is done, for the "+ start here" chip.
     * Null when the day has not established a clock yet.
     */
    previousEnd: string | null;
    /** Open the add row above this stop. */
    onInsertBefore: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: stop.id });
    const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
    /*
     * Two checks the day card could not make before.
     *
     * `stopIsOutsideHours` is deliberately quiet about specs it cannot parse —
     * a wrong "closed" badge sends you somewhere else on a day the place was
     * open, which is worse than no badge at all.
     */
    const outsideHours = stopIsOutsideHours(place?.opening_hours, dayDate, stop.start_time);
    const hoursLabel = describeHours(place?.opening_hours);
    const afterDark = isAfterDark(stop.start_time, sunset);
    const [showNotes, setShowNotes] = useState(false);
    const [showBooking, setShowBooking] = useState(false);
    /**
     * Whether the time box has focus.
     *
     * In the narrow column the preset chips are only offered while it does —
     * see the row below. Wide, they behave as they always have.
     */
    const [timeFocused, setTimeFocused] = useState(false);
    const reservation = (api.data?.bookings ?? []).find((booking) => booking.stop_id === stop.id);
    const label = stop.custom_label || place?.name || 'this stop';

    /**
     * Move a stop to another day.
     *
     * Still a menu as well as a drag: on a phone there is no drag, and "move to
     * day 7" through a list is two taps against a scroll-and-hold. The drag is
     * the native one — see dragTypes.ts for why it is not dnd-kit.
     */
    const moveTo = (dayId: number) => api.update('stops', {
        id: stop.id,
        day_id: dayId,
        // Bottom of the destination: the API only auto-appends on insert, and
        // keeping the old position would drop it into the middle of a day it
        // has never been part of.
        sort_order: 9999,
    });


    /*
     * The row's parts, built once and arranged two ways below.
     */
    const handle = (
        <button
            {...attributes}
            {...listeners}
            className={`cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500
                touch-none ${compact ? 'px-0.5 text-sm leading-5' : 'px-1'}`}
            aria-label="Drag to reorder"
        >
            ⠿
        </button>
    );

    const number = (
        <span className={`text-xs font-semibold text-gray-400 tabular-nums w-4 shrink-0
            ${compact ? 'leading-5' : ''}`}>
            {index + 1}
        </span>
    );

    /*
     * The clock, and the three times a day is actually made of.
     *
     * Typing 09:00 into a time input on a phone is four taps and a scroll wheel;
     * a chip is one. Wide, the chips show whenever no time is set. In the narrow
     * column they show only while the box has focus — otherwise they eat the
     * width the place name needs, which is the thing the row is about. The
     * chips block mousedown so pressing one never blurs the box out from under
     * the press, and the wrapper only closes when focus leaves it entirely.
     */
    const showPresets = compact ? timeFocused : !stop.start_time;
    const timeField = (
        <div
            className="flex flex-wrap items-center gap-0.5 min-w-0"
            onFocus={() => setTimeFocused(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setTimeFocused(false);
                }
            }}
        >
            <input
                type="time"
                // Keyed on the stored value so a change made elsewhere shows
                // here; saved only when it actually changed, so tabbing through
                // a day is not one PATCH and refetch per field.
                key={stop.start_time ?? ''}
                defaultValue={stop.start_time ?? ''}
                onBlur={(e) => {
                    if (e.target.value !== (stop.start_time ?? '')) {
                        api.patchStop(stop.id, { start_time: e.target.value });
                    }
                }}
                // 6.75rem, not 5.5: "09:30 AM" plus the picker icon does not
                // fit in 5.5 and Chromium silently clipped the M, so every
                // afternoon stop read "03:30 PI".
                className={`text-gray-500 bg-transparent w-[6.75rem] shrink-0 rounded-lg px-1
                    hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
                    focus:ring-accent/30 ${compact ? 'text-[11px] py-0' : 'text-xs py-1'}`}
                aria-label="Start time"
            />
            {showPresets && (
                <span className="flex shrink-0 gap-0.5">
                    {['09:00', '12:30', '19:00'].map((time) => (
                        <button
                            key={time}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                api.patchStop(stop.id, { start_time: time });
                                // The box is keyed on the value, so setting one
                                // remounts it and no focusout ever reaches the
                                // wrapper — without this the chips stay up.
                                setTimeFocused(false);
                            }}
                            className="rounded-md px-1 py-0.5 text-[10px] text-gray-400
                                hover:bg-gray-100 hover:text-gray-700 tabular-nums"
                            title={`Start at ${time}`}
                        >
                            {time}
                        </button>
                    ))}
                    {previousEnd && (
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                api.patchStop(stop.id, { start_time: previousEnd });
                                setTimeFocused(false);
                            }}
                            className="rounded-md px-1 py-0.5 text-[10px] text-accent
                                hover:bg-accent/10 tabular-nums"
                            title={`Straight after the stop before (${previousEnd})`}
                        >
                            +{previousEnd}
                        </button>
                    )}
                </span>
            )}
        </div>
    );

    /* How long you mean to be here. Optional, and the timeline says so: without
       it a stop is a point in the day; with it the day becomes a sequence that
       can be checked against the clock. */
    const durationField = (
        <input
            type="number"
            min="0"
            step="15"
            key={`d-${stop.duration_minutes ?? ''}`}
            defaultValue={stop.duration_minutes ?? ''}
            placeholder="min"
            onBlur={(e) => {
                const next = e.target.value.trim();
                if (next !== String(stop.duration_minutes ?? '')) {
                    api.patchStop(stop.id, { duration_minutes: next });
                }
            }}
            className={`text-gray-400 bg-transparent w-12 shrink-0 rounded-lg px-1
                hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
                focus:ring-accent/30 tabular-nums
                ${compact ? 'text-[11px] py-0' : 'text-xs py-1'}`}
            aria-label="Minutes here"
        />
    );

    const nameField = place ? (
        // The name is the way in: a stop is the place, so clicking it opens the
        // same editor the Places tab opens. Before this, a wrong address or a
        // missing pin noticed while reading the day meant leaving the day to go
        // and fix it.
        <button
            onClick={() => onEditPlace(place)}
            title={`Edit ${place.name}`}
            className={`flex items-center gap-2 text-left group/place w-full min-w-0
                ${compact ? '' : 'flex-wrap'}`}
        >
            <span className={`text-sm text-gray-900 truncate group-hover/place:text-accent
                group-hover/place:underline decoration-dotted underline-offset-2
                ${compact ? 'leading-5' : ''}`}>
                {stop.custom_label || place.name}
            </span>
            <span className="shrink-0"><CategoryChip category={place.category} /></span>
        </button>
    ) : (
        <InlineText
            value={stop.custom_label ?? ''}
            placeholder="Untitled stop"
            className="text-sm -ml-2"
            onCommit={(custom_label) => api.update('stops', { id: stop.id, custom_label })}
        />
    );

    const menu = (
        <OverflowMenu items={[
            ...(place ? [{
                label: `Edit ${place.name}`,
                onClick: () => onEditPlace(place),
            }] : []),
            {
                label: showNotes || stop.notes ? 'Hide note' : 'Add a note',
                onClick: () => setShowNotes((v) => !v),
            },
            ...(api.data?.days ?? [])
                .filter((d) => d.day_number !== dayNumber)
                .map((d) => ({
                    label: `Move to day ${d.day_number}${d.title ? ` — ${d.title}` : ''}`,
                    onClick: () => moveTo(d.id),
                })),
            // Copy rather than move: the same beach twice in a week is a
            // plan, not a mistake, and rebuilding the stop by hand to
            // say so is busywork.
            ...(api.data?.days ?? [])
                .filter((d) => d.day_number !== dayNumber)
                .map((d) => ({
                    label: `Copy to day ${d.day_number}${d.title ? ` — ${d.title}` : ''}`,
                    onClick: () => api.create('stops', {
                        day_id: d.id,
                        place_id: stop.place_id,
                        custom_label: stop.custom_label,
                        start_time: stop.start_time,
                        duration_minutes: stop.duration_minutes,
                        notes: stop.notes,
                    }),
                })),
            {
                // A dinner reservation is a booking on a stop: time,
                // party size, confirmation, dress code, and the date
                // after which cancelling costs you.
                label: reservation ? 'Edit the reservation' : 'Add a reservation',
                onClick: () => setShowBooking((v) => !v),
            },
            {
                label: 'Remove stop',
                danger: true,
                onClick: () => api.removeRow('stops', stop, `Removed ${label}`),
            },
        ]} />
    );

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={isDragging ? 'opacity-50' : ''}
            draggable
            onDragStart={(event) => {
                // The day id travels with it so a drop onto its own day is a
                // no-op rather than a pointless write.
                event.dataTransfer.setData(STOP_DRAG, `${stop.id}:${stop.day_id}`);
                event.dataTransfer.effectAllowed = 'move';
            }}
        >
            {/* A hairline that becomes a button on hover: adding a stop in the
                middle of a day used to mean adding it at the bottom and dragging
                it up past four others. */}
            {index > 0 && (
                <div className="group/insert relative -my-0.5 h-2">
                    <button
                        type="button"
                        onClick={onInsertBefore}
                        aria-label="Add a stop here"
                        className="absolute inset-x-8 top-1/2 flex h-4 -translate-y-1/2
                            items-center justify-center opacity-0 transition
                            group-hover/insert:opacity-100"
                    >
                        <span className="h-px flex-1 bg-accent/40" />
                        <span className="mx-1 rounded-full bg-accent px-1.5 text-[10px]
                            font-semibold leading-4 text-white">
                            + here
                        </span>
                        <span className="h-px flex-1 bg-accent/40" />
                    </button>
                </div>
            )}
            {/* ---- The row itself, two shapes ----
                Wide, everything sits on one line, which reads best when there is
                a page's width to put it on. In the map's split view there is a
                400px column instead, and six controls on one line squeezed the
                place name — the thing the row is *about* — down to nothing. So
                there: the name and its type on the top line, the clock and the
                length underneath, and the preset times only while the time box
                has focus. Both lines are set tight enough that the pair is no
                taller than the one line was. */}
            <div className={`rounded-2xl border border-gray-100 bg-white ${compact
                ? 'flex items-start gap-1.5 px-2 py-1'
                : 'flex items-center gap-2 px-2.5 py-2'}`}>
                {handle}
                {number}
                {compact ? (
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center min-w-0">{nameField}</div>
                        <div className="flex flex-wrap items-center gap-1 -mt-0.5">
                            {timeField}
                            {durationField}
                        </div>
                    </div>
                ) : (
                    <>
                        {timeField}
                        {durationField}
                        <div className="min-w-0 flex-1">{nameField}</div>
                    </>
                )}
                {menu}
            </div>
            {(showBooking || reservation) && (
                <div className={`pr-2 pb-1 ${compact ? 'pl-7' : 'pl-10'}`}>
                    <BookingPanel api={api} kind="table" stopId={stop.id} compact />
                </div>
            )}
            {(showNotes || stop.notes) && (
                <div className={`pr-2 ${compact ? 'pl-7' : 'pl-10'}`}>
                    <InlineText
                        multiline
                        value={stop.notes ?? ''}
                        placeholder="Booking ref, what to bring, who to ask for…"
                        className="text-[11px] text-gray-600"
                        onCommit={(notes) => api.update('stops', { id: stop.id, notes })}
                    />
                </div>
            )}
            {/* ---- After the trip ----
                The same rows, asked a different question. Only in the `after`
                phase: a "did you go?" tick on a day three months away is noise,
                and the switch is on the Settings tab because a trip is not over
                because a date passed. */}
            {phase === 'after' && (
                <div className={`flex flex-wrap items-center gap-1.5 pr-2 pb-1
                    ${compact ? 'pl-7' : 'pl-10'}`}>
                    {([['did', '✓ Did it'], ['skipped', '– Skipped']] as const).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => api.patchStop(stop.id, {
                                outcome: stop.outcome === key ? '' : key,
                            })}
                            className={`rounded-full border px-2 py-0.5 text-[11px] transition
                                ${stop.outcome === key
                                ? 'border-transparent bg-gray-900 text-white'
                                : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                            {label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => api.patchStop(stop.id, { favourite: !stop.favourite })}
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition
                            ${stop.favourite
                            ? 'border-transparent bg-amber-400 text-white'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        title="One of the good ones"
                    >
                        ★
                    </button>
                    <InlineText
                        multiline
                        value={stop.journal ?? ''}
                        placeholder="What was it actually like?"
                        className="text-[11px] text-gray-600 flex-1 min-w-[8rem]"
                        onCommit={(journal) => api.update('stops', { id: stop.id, journal })}
                    />
                </div>
            )}

            {/* What the timeline works out about this stop: when you really
                arrive, whether you can, whether it is even open. */}
            {row && (row.late || row.arrive !== row.planned || row.leave || row.walkable
                || outsideHours || afterDark) && (
                <div className={`pr-2 pb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1
                    text-[11px] ${compact ? 'pl-7' : 'pl-10'}`}>
                    {row.late ? (
                        <span className="text-rose-700 font-medium tabular-nums">
                            arrive {row.arrive} · {row.lateBy} min late
                        </span>
                    ) : row.arrive && row.leave ? (
                        <span className="text-gray-400 tabular-nums">
                            {row.arrive}–{row.leave}
                        </span>
                    ) : row.arrive && !row.planned ? (
                        <span className="text-gray-400 tabular-nums">≈ {row.arrive}</span>
                    ) : null}
                    {row.overlaps && (
                        <span className="text-amber-700">overlaps the stop before</span>
                    )}
                    {row.walkable && (
                        <span className="text-emerald-700" title="Within 800 m of the day’s base">
                            🚶 walkable
                        </span>
                    )}
                    {outsideHours && (
                        <span className="text-rose-700" title={hoursLabel ?? undefined}>
                            ⚠ closed at this time
                        </span>
                    )}
                    {afterDark && (
                        <span className="text-indigo-700" title={`Sunset is ${sunset}`}>
                            🌙 after dark
                        </span>
                    )}
                </div>
            )}
            {hopKm != null && (
                <div className={`py-0.5 text-[11px] text-gray-400 ${compact ? 'pl-7' : 'pl-10'}`}>
                    {row?.hopIn && row.hopIn.source === 'road' ? (
                        <span title="Driving time from OSRM">
                            ↓ {formatDuration(row.hopIn.seconds)} drive
                            {' · '}{formatDistance(row.hopIn.meters / 1000)} by road
                        </span>
                    ) : (
                        <span title="No road time yet — this is a straight line at 32 km/h">
                            ↓ {formatDistance(hopKm)} straight line
                            {row?.hopIn && ` · ~${formatDuration(row.hopIn.seconds)} (est.)`}
                        </span>
                    )}
                </div>
            )}
        </li>
    );
}
