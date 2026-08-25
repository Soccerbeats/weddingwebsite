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
    formatDate, formatDayDate, formatDistance, formatTime, hasCoords, legIsOvernight,
    travelModeMeta,
    type CalendarCell, type Day, type Place, type Stop, type TravelLeg,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import PrintSheet from './PrintSheet';
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
                    <Button onClick={() => window.print()} title="Print the whole trip as a sheet">
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

            {/* Invisible on screen; the only thing on the page in print. Never in
                a panel: two copies on one page would print the trip twice. */}
            {!panel && <PrintSheet api={api} />}

            {shownView === 'calendar' ? (
                <CalendarView
                    api={api}
                    days={days}
                    onEditPlace={setEditingPlace}
                    onFocusDay={onFocusDay}
                    beyond={beyond}
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
function CalendarView({ api, days, onEditPlace, onFocusDay, beyond }: {
    api: HoneymoonApi;
    days: Day[];
    onEditPlace: (place: Place) => void;
    onFocusDay?: (day: Day) => void;
    /** Day numbers past the end of the trip's dates. */
    beyond: Set<number>;
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

function DayCard({ day, api, onEditPlace, onFocusDay, beyondRange = false, arrivals = [] }: {
    day: Day;
    api: HoneymoonApi;
    onEditPlace: (place: Place) => void;
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
        api.reorder('stops', ids);
    };

    const addStop = async () => {
        if (pickPlace) {
            await api.create('stops', { day_id: day.id, place_id: Number(pickPlace) });
        } else if (customLabel.trim()) {
            await api.create('stops', { day_id: day.id, custom_label: customLabel.trim() });
        } else return;
        setPickPlace('');
        setCustomLabel('');
        setAdding(false);
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
    const duplicate = async () => {
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
                notes: stop.notes,
                sort_order: stop.sort_order,
            })));
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
        >
        <Card className="p-4">
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
                        { label: 'Duplicate day', onClick: duplicate },
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
                                        dayNumber={day.day_number}
                                        hopKm={hops.find((h) => h.fromIndex === index)?.km ?? null}
                                        onEditPlace={onEditPlace}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {longest >= SPREAD_WARNING_KM && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-2.5 py-1.5 mt-2">
                    ⚠ This day covers {formatDistance(longest)} in one hop. On Bali&apos;s roads that is a
                    long way — consider splitting it or moving the far stop to another day.
                </p>
            )}

            {/* ---- Add stop ---- */}
            {adding ? (
                <div className="mt-3 rounded-2xl border border-gray-200 p-3 space-y-2">
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
                        <Button onClick={() => setAdding(false)}>Cancel</Button>
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
                <button
                    onClick={() => setAdding(true)}
                    className="mt-3 text-sm text-gray-400 hover:text-gray-700"
                >
                    + Add stop
                </button>
            )}
        </Card>
        </div>
    );
}

function StopRow({ stop, index, api, dayNumber, hopKm, onEditPlace }: {
    stop: Stop;
    index: number;
    api: HoneymoonApi;
    dayNumber: number;
    hopKm: number | null;
    onEditPlace: (place: Place) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: stop.id });
    const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
    const [showNotes, setShowNotes] = useState(false);
    const label = stop.custom_label || place?.name || 'this stop';

    /**
     * Move a stop to another day.
     *
     * Dragging between days would mean one DnD context spanning every card
     * instead of one per card, and reordering within a day is the common case
     * that arrangement serves well. A menu gets a stop to Thursday in two
     * clicks without giving that up.
     */
    const moveTo = (dayId: number) => api.update('stops', {
        id: stop.id,
        day_id: dayId,
        // Bottom of the destination: the API only auto-appends on insert, and
        // keeping the old position would drop it into the middle of a day it
        // has never been part of.
        sort_order: 9999,
    });

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={isDragging ? 'opacity-50' : ''}
        >
            <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2.5 py-2">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none px-1"
                    aria-label="Drag to reorder"
                >
                    ⠿
                </button>
                <span className="text-xs font-semibold text-gray-400 tabular-nums w-4 shrink-0">
                    {index + 1}
                </span>
                <input
                    type="time"
                    // Keyed on the stored value so a change made elsewhere shows
                    // here; saved only when it actually changed, so tabbing through
                    // a day is not one PATCH and refetch per field.
                    key={stop.start_time ?? ''}
                    defaultValue={stop.start_time ?? ''}
                    onBlur={(e) => {
                        if (e.target.value !== (stop.start_time ?? '')) {
                            api.update('stops', { id: stop.id, start_time: e.target.value });
                        }
                    }}
                    // 6.75rem, not 5.5: "09:30 AM" plus the picker icon does not
                    // fit in 5.5 and Chromium silently clipped the M, so every
                    // afternoon stop read "03:30 PI".
                    className="text-xs text-gray-500 bg-transparent w-[6.75rem] shrink-0
                        rounded-lg px-1 py-1 hover:bg-gray-50 focus:bg-white focus:outline-none
                        focus:ring-2 focus:ring-accent/30"
                    aria-label="Start time"
                />
                <div className="min-w-0 flex-1">
                    {place ? (
                        // The name is the way in: a stop is the place, so clicking
                        // it opens the same editor the Places tab opens. Before
                        // this, a wrong address or a missing pin noticed while
                        // reading the day meant leaving the day to go and fix it.
                        <button
                            onClick={() => onEditPlace(place)}
                            title={`Edit ${place.name}`}
                            className="flex items-center gap-2 flex-wrap text-left group/place w-full min-w-0"
                        >
                            <span className="text-sm text-gray-900 truncate
                                group-hover/place:text-accent group-hover/place:underline
                                decoration-dotted underline-offset-2">
                                {stop.custom_label || place.name}
                            </span>
                            <CategoryChip category={place.category} />
                        </button>
                    ) : (
                        <InlineText
                            value={stop.custom_label ?? ''}
                            placeholder="Untitled stop"
                            className="text-sm -ml-2"
                            onCommit={(custom_label) => api.update('stops', { id: stop.id, custom_label })}
                        />
                    )}
                    {stop.start_time && (
                        <span className="sr-only">{formatTime(stop.start_time)}</span>
                    )}
                </div>
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
                    {
                        label: 'Remove stop',
                        danger: true,
                        onClick: () => api.removeRow('stops', stop, `Removed ${label}`),
                    },
                ]} />
            </div>
            {(showNotes || stop.notes) && (
                <div className="pl-10 pr-2">
                    <InlineText
                        multiline
                        value={stop.notes ?? ''}
                        placeholder="Booking ref, what to bring, who to ask for…"
                        className="text-[11px] text-gray-600"
                        onCommit={(notes) => api.update('stops', { id: stop.id, notes })}
                    />
                </div>
            )}
            {hopKm != null && (
                <div className="pl-10 py-0.5 text-[11px] text-gray-400">
                    ↓ {formatDistance(hopKm)} straight line
                </div>
            )}
        </li>
    );
}
