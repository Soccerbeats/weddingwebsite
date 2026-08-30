'use client';

import { useRef, useState } from 'react';
import { categoryMeta, type Place, type Stop } from '@/lib/honeymoon';
import {
    clockLayout, daySegments, formatDuration, resizeSegments, type DaySegment,
} from '@/lib/honeymoonTimeline';

/** `formatDuration` speaks seconds; everything here is in minutes. */
const asLength = (minutes: number) => formatDuration(minutes * 60);
import type { HoneymoonApi } from './useHoneymoon';

/**
 * A day drawn as a shape rather than a list.
 *
 * Two of them, sharing everything but the geometry:
 *
 * - **The bar** is the day divided up — one slice per stop, as wide as the stop
 *   is long, in the stop's own category colour. It answers "how is the day
 *   split" the way a screen-time chart does, and the boundaries drag.
 * - **The clock** is the day laid along a time axis: where each thing sits, how
 *   long it takes and how much of the day is empty. Labels alternate above and
 *   below so two neighbours never sit on top of each other.
 *
 * All the arithmetic lives in `honeymoonTimeline` and is covered by
 * `check:honeymoon`; these two components own only pixels and pointers.
 */

/** The colour a stop is drawn in — its category's, or a neutral for a bare label. */
function colourOf(stop: Stop, placeById: Map<number, Place>): string {
    const place = stop.place_id == null ? null : placeById.get(stop.place_id);
    return place ? categoryMeta(place.category).color : '#9ca3af';
}

function labelFor(stop: Stop, placeById: Map<number, Place>): string {
    const place = stop.place_id == null ? null : placeById.get(stop.place_id);
    return stop.custom_label || place?.name || 'Untitled stop';
}

/**
 * The day as one stacked bar.
 *
 * Lengths are shown live while dragging and written once on release: a PATCH per
 * pointer-move would be a hundred writes for one adjustment, and the bar has to
 * keep up with the finger regardless.
 */
export function DayBar({ api, stops, onOpenStop }: {
    api: HoneymoonApi;
    stops: Stop[];
    /** Clicking a slice opens the place behind it. */
    onOpenStop: (stop: Stop) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    /** Lengths being dragged right now, by stop id — null when idle. */
    const [live, setLive] = useState<Map<number, number> | null>(null);
    /** What the drag started from: the pointer, and the lengths as they were. */
    const from = useRef<{ index: number; x: number; base: DaySegment[]; total: number } | null>(null);

    const segments = daySegments(
        stops.map((stop) => (live?.has(stop.id)
            ? { ...stop, duration_minutes: live.get(stop.id) as number }
            : stop)),
        (stop) => labelFor(stop, api.placeById),
    );
    const total = segments.reduce((sum, seg) => sum + seg.minutes, 0);

    /* Written once, on release. A PATCH per pointer-move would be a hundred
       writes for one adjustment, and the bar has to keep up with the finger
       either way — so the drag is local and the save is the full stop. */
    const commit = (held: Map<number, number> | null) => {
        from.current = null;
        setLive(null);
        for (const [stopId, minutes] of held ?? []) {
            api.patchStop(stopId, { duration_minutes: String(minutes) });
        }
    };

    if (!segments.length) {
        return <p className="text-xs text-gray-400 py-2">Nothing planned yet.</p>;
    }

    return (
        <div className="mt-1">
            <div
                ref={trackRef}
                className="flex h-11 w-full overflow-hidden rounded-2xl bg-gray-100 select-none"
            >
                {segments.map((segment, index) => {
                    const stop = stops[index];
                    const colour = colourOf(stop, api.placeById);
                    return (
                        <div
                            key={segment.stopId}
                            className="relative flex min-w-0 items-center"
                            style={{ width: `${segment.share * 100}%` }}
                        >
                            <button
                                onClick={() => onOpenStop(stop)}
                                title={`${segment.label} · ${asLength(segment.minutes)}${
                                    segment.assumed ? ' (assumed)' : ''}`}
                                className="h-full w-full min-w-0 px-2 text-left text-[11px]
                                    font-medium text-white/95 hover:brightness-110 transition"
                                style={{
                                    backgroundColor: colour,
                                    // An assumed length is drawn faintly: the bar
                                    // should not look like a plan where there isn't one.
                                    opacity: segment.assumed ? 0.55 : 1,
                                }}
                            >
                                <span className="block truncate">{segment.label}</span>
                                <span className="block truncate text-[10px] font-normal opacity-80">
                                    {asLength(segment.minutes)}
                                </span>
                            </button>
                            {index < segments.length - 1 && (
                                /*
                                 * Pointer capture on the handle itself, not window
                                 * listeners: the drag then survives the cursor
                                 * leaving this 8px strip, which it does immediately,
                                 * and there is nothing to unsubscribe if the card
                                 * unmounts mid-drag. Same trick as `ColumnDivider`.
                                 */
                                <div
                                    role="separator"
                                    aria-label={`Time at ${segment.label}`}
                                    aria-orientation="vertical"
                                    tabIndex={0}
                                    title="Drag to give this stop more or less of the day"
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        from.current = {
                                            index, x: event.clientX, base: segments, total,
                                        };
                                    }}
                                    onPointerMove={(event) => {
                                        const start = from.current;
                                        const width = trackRef.current?.getBoundingClientRect().width;
                                        if (!start || !width) return;
                                        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                                        // The only place pixels become minutes.
                                        const moved = resizeSegments(
                                            start.base, start.index,
                                            (event.clientX - start.x) * (start.total / width),
                                        );
                                        const next = new Map<number, number>();
                                        for (const row of moved) next.set(row.stopId, row.minutes);
                                        // Hold both sides even when the drag has
                                        // snapped back to nothing, so a release
                                        // always writes a definite pair.
                                        if (!moved.length) {
                                            next.set(start.base[start.index].stopId,
                                                start.base[start.index].minutes);
                                            next.set(start.base[start.index + 1].stopId,
                                                start.base[start.index + 1].minutes);
                                        }
                                        setLive(next);
                                    }}
                                    onPointerUp={(event) => {
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                        commit(live);
                                    }}
                                    onPointerCancel={() => commit(null)}
                                    onKeyDown={(event) => {
                                        const step = event.key === 'ArrowLeft' ? -15
                                            : event.key === 'ArrowRight' ? 15 : 0;
                                        if (!step) return;
                                        event.preventDefault();
                                        for (const row of resizeSegments(segments, index, step)) {
                                            api.patchStop(row.stopId, {
                                                duration_minutes: String(row.minutes),
                                            });
                                        }
                                    }}
                                    className="absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2
                                        cursor-col-resize touch-none focus:outline-none
                                        flex items-center justify-center group/handle"
                                >
                                    <span className="h-5 w-0.5 rounded-full bg-white/70
                                        group-hover/handle:bg-white group-focus/handle:bg-white" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
                {asLength(total)} planned
                {segments.some((seg) => seg.assumed)
                    && ' · faded slices are assumed lengths — drag a divider to set one'}
            </p>
        </div>
    );
}

/**
 * The day along a clock.
 *
 * The axis is the day's own span, not midnight to midnight, so a day that
 * happens between nine and six uses the whole width instead of drawing fifteen
 * empty hours either side of itself.
 */
export function DayClock({ api, stops, onOpenStop }: {
    api: HoneymoonApi;
    stops: Stop[];
    onOpenStop: (stop: Stop) => void;
}) {
    const layout = clockLayout(stops, (stop) => labelFor(stop, api.placeById));
    if (!layout.items.length) {
        return <p className="text-xs text-gray-400 py-2">Nothing planned yet.</p>;
    }
    const stopById = new Map(stops.map((stop) => [stop.id, stop]));

    return (
        <div className="mt-1 pb-1">
            {/* Two label lanes with the axis between them. Fixed heights rather
                than flow: a label that moved the axis when it wrapped would make
                the times mean different things on different days. */}
            <div className="relative h-[4.5rem] w-full">
                {layout.items.filter((item) => item.above).map((item) => (
                    <ClockLabel
                        key={item.stopId}
                        item={item}
                        onClick={() => {
                            const stop = stopById.get(item.stopId);
                            if (stop) onOpenStop(stop);
                        }}
                        above
                    />
                ))}
            </div>

            {/* The axis: the line and the stops sit on the top third, the hour
                labels hang underneath them. They shared a centre line once, and
                every hour label was struck through by whatever stop ran past it. */}
            <div className="relative h-8 w-full">
                <div className="absolute inset-x-0 top-2 h-px bg-gray-200" />
                {layout.ticks.map((tick) => (
                    <div
                        key={tick.minutes}
                        className="absolute top-0 h-full"
                        style={{ left: `${tick.pct}%` }}
                    >
                        <span className="absolute top-0.5 h-3 w-px bg-gray-300" />
                        <span className="absolute left-1 top-4 text-[9px] text-gray-400 tabular-nums">
                            {tick.label}
                        </span>
                    </div>
                ))}
                {/* Each stop, as the stretch of the day it takes. */}
                {layout.items.map((item) => {
                    const stop = stopById.get(item.stopId);
                    const colour = stop ? colourOf(stop, api.placeById) : '#9ca3af';
                    return (
                        <button
                            key={item.stopId}
                            onClick={() => stop && onOpenStop(stop)}
                            title={`${item.label} · ${item.start}–${item.end}${
                                item.assumed ? ' (assumed)' : ''}`}
                            className="absolute top-2 h-3 -translate-y-1/2 rounded-full
                                border border-white hover:brightness-110 transition"
                            style={{
                                left: `${item.startPct}%`,
                                // Never thinner than a dot, or a short stop would
                                // be a line you cannot see, let alone press.
                                width: `max(0.75rem, ${item.widthPct}%)`,
                                backgroundColor: colour,
                                opacity: item.assumed ? 0.55 : 1,
                            }}
                        />
                    );
                })}
            </div>

            <div className="relative h-[4.5rem] w-full">
                {layout.items.filter((item) => !item.above).map((item) => (
                    <ClockLabel
                        key={item.stopId}
                        item={item}
                        onClick={() => {
                            const stop = stopById.get(item.stopId);
                            if (stop) onOpenStop(stop);
                        }}
                        above={false}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * One label, hanging off the axis by a leader line.
 *
 * Anchored by its middle and nudged back inside at the two ends, so the first
 * and last labels stay on the card rather than running off it.
 */
function ClockLabel({ item, above, onClick }: {
    item: ReturnType<typeof clockLayout>['items'][number];
    above: boolean;
    onClick: () => void;
}) {
    const edge = item.startPct < 8 ? 'left' : item.startPct > 92 ? 'right' : 'centre';
    return (
        <div
            className={`absolute w-32 ${above ? 'bottom-0' : 'top-0'}`}
            style={{
                left: `${item.startPct}%`,
                transform: edge === 'centre' ? 'translateX(-50%)'
                    : edge === 'right' ? 'translateX(-100%)' : 'none',
            }}
        >
            {!above && (
                <span className="absolute left-0 top-0 h-3 w-px bg-gray-200"
                    style={{ left: edge === 'centre' ? '50%' : edge === 'right' ? 'calc(100% - 1px)' : 0 }}
                />
            )}
            <button
                onClick={onClick}
                className={`block w-full ${above ? 'mb-3' : 'mt-3'} ${
                    edge === 'right' ? 'text-right' : edge === 'left' ? 'text-left' : 'text-center'}`}
                title={`${item.label} · ${item.start}–${item.end}`}
            >
                <span className="block truncate text-[11px] text-gray-800 hover:text-accent
                    hover:underline decoration-dotted underline-offset-2">
                    {item.label}
                </span>
                <span className={`block text-[10px] tabular-nums ${
                    item.assumed ? 'text-gray-300' : 'text-gray-400'}`}>
                    {item.start}
                </span>
            </button>
            {above && (
                <span className="absolute bottom-0 h-3 w-px bg-gray-200"
                    style={{ left: edge === 'centre' ? '50%' : edge === 'right' ? 'calc(100% - 1px)' : 0 }}
                />
            )}
        </div>
    );
}
