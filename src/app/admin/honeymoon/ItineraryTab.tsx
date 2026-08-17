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
    SPREAD_WARNING_KM, TRAVEL_MODES, calendarMonths, dayHops, formatDayDate, formatDistance,
    formatTime,
    type CalendarCell, type Day, type Stop, type TravelMode,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PrintSheet from './PrintSheet';
import {
    Button, Card, CategoryChip, EmptyState, InlineText, Modal, OverflowMenu, SelectField, TextField,
} from './ui';

type View = 'list' | 'calendar';

const VIEW_KEY = 'honeymoon.itinerary.view';

export default function ItineraryTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const days = data?.days ?? [];

    // Remembered like the other view preferences, but locally: which way you
    // like to read the trip is about you and this browser, not about the trip.
    // Read after mount, not in the initial state: the server has no
    // localStorage, so seeding from it directly would render one view on the
    // server and the other on the client and blow up hydration.
    const [view, setView] = useState<View>('list');
    useEffect(() => {
        const saved = localStorage.getItem(VIEW_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved === 'calendar' || saved === 'list') setView(saved);
    }, []);
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

            {/* Invisible on screen; the only thing on the page in print. */}
            <PrintSheet api={api} />

            {view === 'calendar' ? (
                <CalendarView api={api} days={days} />
            ) : (
                <DndContext sensors={daySensors} collisionDetection={closestCenter} onDragEnd={onDayDragEnd}>
                    <SortableContext items={days.map((d) => d.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                            {days.map((day) => <DayCard key={day.id} day={day} api={api} />)}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            <div className="flex justify-center pt-1">
                <Button tone="primary" onClick={() => api.create('days', {})}>
                    + Add day {days.length + 1}
                </Button>
            </div>
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
function CalendarView({ api, days }: { api: HoneymoonApi; days: Day[] }) {
    const startDate = api.data?.trip.start_date ?? null;
    const [openDayId, setOpenDayId] = useState<number | null>(null);

    const months = useMemo(
        () => calendarMonths(startDate, days.length),
        [startDate, days.length],
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
                            <DayCard day={openDay} api={api} />
                        </SortableContext>
                    </DndContext>
                )}
            </Modal>
        </>
    );
}

function CalendarCellBox({ cell, day, api, onOpen }: {
    cell: CalendarCell;
    day: Day | null;
    api: HoneymoonApi;
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
            className="min-h-[5.5rem] rounded-xl border border-accent/30 bg-accent/5 p-1.5
                text-left hover:bg-accent/10 hover:border-accent/50 transition
                focus:outline-none focus:ring-2 focus:ring-accent/30 overflow-hidden"
        >
            <div className="flex items-baseline justify-between gap-1">
                <span className="text-[11px] tabular-nums text-gray-500">{cell.dayOfMonth}</span>
                <span className="text-[10px] font-semibold text-accent shrink-0">
                    Day {day.day_number}
                </span>
            </div>
            {day.title && (
                <p className="text-[11px] font-medium text-gray-800 truncate">{day.title}</p>
            )}
            {day.travel.map((leg) => (
                <p key={leg.id} className="text-[10px] text-slate-500 truncate">
                    {TRAVEL_MODES.find((m) => m.key === leg.mode)?.icon ?? '→'}{' '}
                    {leg.depart_time ? formatTime(leg.depart_time) : ''} {leg.to_text ?? ''}
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

function DayCard({ day, api }: { day: Day; api: HoneymoonApi }) {
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
            className={dayDragging ? 'opacity-60' : ''}
        >
        <Card className="p-4">
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
                <OverflowMenu
                    items={[
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
                        .filter((p) => p.category === 'stay' || p.id === day.base_place_id)
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SelectField>
            </div>

            {/* ---- Travel legs ---- */}
            {day.travel.map((leg) => (
                <div key={leg.id} className="mt-2 rounded-2xl bg-slate-50 border border-slate-200 p-2.5">
                    <div className="flex items-center gap-2">
                        <SelectField
                            className="max-w-[7.5rem]"
                            value={leg.mode}
                            onChange={(e) => api.update('travel', {
                                id: leg.id, mode: e.target.value as TravelMode,
                            })}
                        >
                            {TRAVEL_MODES.map((m) => (
                                <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                            ))}
                        </SelectField>
                        <div className="flex-1" />
                        <OverflowMenu items={[{
                            label: 'Remove leg',
                            danger: true,
                            onClick: () => api.removeRow('travel', leg, 'Removed a travel leg'),
                        }]} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <TextField
                            defaultValue={leg.from_text ?? ''}
                            placeholder="From — SIN Changi T3"
                            onBlur={(e) => api.update('travel', { id: leg.id, from_text: e.target.value })}
                        />
                        <TextField
                            defaultValue={leg.to_text ?? ''}
                            placeholder="To — DPS Denpasar"
                            onBlur={(e) => api.update('travel', { id: leg.id, to_text: e.target.value })}
                        />
                        <TextField
                            type="time"
                            defaultValue={leg.depart_time ?? ''}
                            onBlur={(e) => api.update('travel', { id: leg.id, depart_time: e.target.value })}
                        />
                        <TextField
                            type="time"
                            defaultValue={leg.arrive_time ?? ''}
                            onBlur={(e) => api.update('travel', { id: leg.id, arrive_time: e.target.value })}
                        />
                        <TextField
                            className="col-span-2"
                            defaultValue={leg.confirmation_ref ?? ''}
                            placeholder="Confirmation ref"
                            onBlur={(e) => api.update('travel', {
                                id: leg.id, confirmation_ref: e.target.value,
                            })}
                        />
                    </div>
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

function StopRow({ stop, index, api, dayNumber, hopKm }: {
    stop: Stop;
    index: number;
    api: HoneymoonApi;
    dayNumber: number;
    hopKm: number | null;
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
                    defaultValue={stop.start_time ?? ''}
                    onBlur={(e) => api.update('stops', { id: stop.id, start_time: e.target.value })}
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
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-900 truncate">
                                {stop.custom_label || place.name}
                            </span>
                            <CategoryChip category={place.category} />
                        </div>
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
