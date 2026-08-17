'use client';

import { useState } from 'react';
import {
    DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    SPREAD_WARNING_KM, TRAVEL_MODES, dayHops, formatDayDate, formatDistance, formatTime,
    type Day, type Stop, type TravelMode,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import {
    Button, Card, CategoryChip, EmptyState, InlineText, OverflowMenu, SelectField, TextField,
} from './ui';

export default function ItineraryTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const days = data?.days ?? [];

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
            <p className="text-xs text-gray-400 px-1">
                Drag a day by its ⠿ handle to reorder the trip — the days renumber and
                their dates follow.
            </p>
            <DndContext sensors={daySensors} collisionDetection={closestCenter} onDragEnd={onDayDragEnd}>
                <SortableContext items={days.map((d) => d.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                        {days.map((day) => <DayCard key={day.id} day={day} api={api} />)}
                    </div>
                </SortableContext>
            </DndContext>
            <div className="flex justify-center pt-1">
                <Button tone="primary" onClick={() => api.create('days', {})}>
                    + Add day {days.length + 1}
                </Button>
            </div>
        </div>
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
                        {
                            label: 'Delete day',
                            danger: true,
                            onClick: () => {
                                if (confirm(`Delete day ${day.day_number} and its ${day.stops.length} stop(s)?`)) {
                                    api.remove('days', day.id);
                                }
                            },
                        },
                    ]}
                />
            </div>

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
                            onClick: () => api.remove('travel', leg.id),
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

function StopRow({ stop, index, api, hopKm }: {
    stop: Stop;
    index: number;
    api: HoneymoonApi;
    hopKm: number | null;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: stop.id });
    const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);

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
                    className="text-xs text-gray-500 bg-transparent w-[5.5rem] shrink-0
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
                <OverflowMenu items={[{
                    label: 'Remove stop',
                    danger: true,
                    onClick: () => api.remove('stops', stop.id),
                }]} />
            </div>
            {hopKm != null && (
                <div className="pl-10 py-0.5 text-[11px] text-gray-400">
                    ↓ {formatDistance(hopKm)} straight line
                </div>
            )}
        </li>
    );
}
