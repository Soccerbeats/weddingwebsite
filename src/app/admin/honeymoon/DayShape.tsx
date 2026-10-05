'use client';

import { useRef, useState } from 'react';
import { categoryMeta, travelModeMeta, type Place, type Stop } from '@/lib/honeymoon';
import {
    clockLayout, daySegments, daySequence, formatDuration, resizeSegments,
    type DayLeg, type DayMarker, type DaySegment,
} from '@/lib/honeymoonTimeline';
import type { HoneymoonApi } from './useHoneymoon';
import { useTimeFormat } from './kit/useTimeFormat';

/** `formatDuration` speaks seconds; everything here is in minutes. */
const asLength = (minutes: number) => formatDuration(minutes * 60);

/**
 * A day drawn as a shape rather than a list — everything on it, travel included.
 *
 * Two of them, sharing everything but the geometry:
 *
 * - **The bar** is the day divided up, in the order it happens — one slice per
 *   stop *and per leg*, as wide as each is long. Stop boundaries drag.
 * - **The clock** is the day laid along a time axis: travel in its own lane
 *   above the stops, check-out and check-in as marks across both, and every
 *   item labelled with when it starts and when it ends.
 *
 * All the arithmetic lives in `honeymoonTimeline` and is covered by
 * `check:honeymoon`; these components own only pixels and pointers.
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

/** Travel is striped in its mode's colour, so it never reads as a stop. */
export function legBackground(mode: string): React.CSSProperties {
    const colour = travelModeMeta(mode).color;
    return {
        backgroundColor: colour,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 12px)',
    };
}

/**
 * The day as one stacked bar.
 *
 * Lengths are shown live while dragging and written once on release: a PATCH per
 * pointer-move would be a hundred writes for one adjustment.
 */
export function DayBar({ api, stops, legs = [], onOpenStop, onOpenLeg }: {
    api: HoneymoonApi;
    stops: Stop[];
    legs?: DayLeg[];
    onOpenStop: (stop: Stop) => void;
    onOpenLeg?: (legId: number) => void;
}) {
    const fmt = useTimeFormat();
    const trackRef = useRef<HTMLDivElement>(null);
    const [live, setLive] = useState<Map<number, number> | null>(null);
    const from = useRef<{ index: number; x: number; base: DaySegment[]; total: number } | null>(null);

    const shown = stops.map((stop) => (live?.has(stop.id)
        ? { ...stop, duration_minutes: live.get(stop.id) as number }
        : stop));
    const label = (stop: Stop) => labelFor(stop, api.placeById);
    const slices = daySequence(shown, legs, label);
    const segments = daySegments(shown, label);
    const stopIndex = new Map(stops.map((stop, index) => [stop.id, index]));
    const total = slices.reduce((sum, slice) => sum + slice.minutes, 0);
    const stopTotal = segments.reduce((sum, seg) => sum + seg.minutes, 0);

    const commit = (held: Map<number, number> | null) => {
        from.current = null;
        setLive(null);
        for (const [stopId, minutes] of held ?? []) {
            api.patchStop(stopId, { duration_minutes: String(minutes) });
        }
    };

    if (!slices.length) {
        return <p className="text-xs text-gray-400 py-2">Nothing planned yet.</p>;
    }

    const when = (start: string | null, end: string | null, minutes: number) => (start
        ? `${fmt(start)}${end ? `–${fmt(end)}` : ' →'}`
        : asLength(minutes));

    return (
        <div className="mt-1">
            <div
                ref={trackRef}
                className="flex h-12 w-full overflow-hidden rounded-2xl bg-gray-100 select-none"
            >
                {slices.map((slice, index) => {
                    const next = slices[index + 1];
                    const here = slice.kind === 'stop' ? stopIndex.get(slice.id) : undefined;
                    const there = next?.kind === 'stop' ? stopIndex.get(next.id) : undefined;
                    // A boundary drags only between two stops that are also
                    // neighbours in the day's own order — what `resizeSegments`
                    // trades length between.
                    const resizable = here != null && there != null && there === here + 1;
                    const stop = slice.kind === 'stop' ? stops[here as number] : null;
                    return (
                        <div
                            key={`${slice.kind}-${slice.id}`}
                            className="relative flex min-w-0 items-center"
                            style={{ width: `${slice.share * 100}%` }}
                        >
                            <button
                                type="button"
                                data-leg-slice={slice.kind === 'leg' ? slice.id : undefined}
                                onClick={() => (stop ? onOpenStop(stop) : onOpenLeg?.(slice.id))}
                                title={`${slice.label} · ${when(slice.start, slice.end, slice.minutes)}${
                                    slice.assumed ? ' (assumed length)' : ''}`}
                                className="h-full w-full min-w-0 px-2 text-left text-[11px] font-medium
                                    text-white/95 transition hover:brightness-110"
                                style={stop
                                    ? { backgroundColor: colourOf(stop, api.placeById), opacity: slice.assumed ? 0.55 : 1 }
                                    : { ...legBackground(slice.mode ?? 'car'), opacity: slice.assumed ? 0.6 : 1 }}
                            >
                                <span className="block truncate">{slice.label}</span>
                                <span className="block truncate text-[10px] font-normal opacity-90 tabular-nums">
                                    {when(slice.start, slice.end, slice.minutes)}
                                </span>
                            </button>
                            {resizable && (
                                <div
                                    role="separator"
                                    aria-label={`Time at ${slice.label}`}
                                    aria-orientation="vertical"
                                    tabIndex={0}
                                    title="Drag to give this stop more or less of the day"
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        from.current = { index: here, x: event.clientX, base: segments, total: stopTotal };
                                    }}
                                    onPointerMove={(event) => {
                                        const start = from.current;
                                        const width = trackRef.current?.getBoundingClientRect().width;
                                        if (!start || !width) return;
                                        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                                        // Pixels become minutes against the whole bar.
                                        const moved = resizeSegments(
                                            start.base, start.index,
                                            (event.clientX - start.x) * (total / width),
                                        );
                                        const held = new Map<number, number>();
                                        for (const row of moved) held.set(row.stopId, row.minutes);
                                        if (!moved.length) {
                                            held.set(start.base[start.index].stopId, start.base[start.index].minutes);
                                            held.set(start.base[start.index + 1].stopId, start.base[start.index + 1].minutes);
                                        }
                                        setLive(held);
                                    }}
                                    onPointerUp={(event) => {
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                        commit(live);
                                    }}
                                    onPointerCancel={() => commit(null)}
                                    onKeyDown={(event) => {
                                        const step = event.key === 'ArrowLeft' ? -15 : event.key === 'ArrowRight' ? 15 : 0;
                                        if (!step) return;
                                        event.preventDefault();
                                        for (const row of resizeSegments(segments, here, step)) {
                                            api.patchStop(row.stopId, { duration_minutes: String(row.minutes) });
                                        }
                                    }}
                                    className="group/handle absolute right-0 top-0 z-10 hidden h-full w-2 translate-x-1/2
                                        cursor-col-resize touch-none items-center justify-center focus:outline-none
                                        [@media(pointer:fine)]:flex"
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
                {legs.length > 0 && ' · striped slices are travel'}
                {slices.some((slice) => slice.assumed) && ' · faded slices are assumed lengths'}
            </p>
        </div>
    );
}

/**
 * The day along a clock.
 *
 * The axis is the day's own span — first thing to last, travel and check-out
 * included — so a day between nine and six uses the whole width.
 */
export function DayClock({ api, stops, legs = [], markers = [], onOpenStop, onOpenLeg }: {
    api: HoneymoonApi;
    stops: Stop[];
    legs?: DayLeg[];
    markers?: DayMarker[];
    onOpenStop: (stop: Stop) => void;
    onOpenLeg?: (legId: number) => void;
}) {
    const fmt = useTimeFormat();
    const layout = clockLayout(stops, (stop) => labelFor(stop, api.placeById), { legs, markers });
    if (!layout.items.length && !layout.legs.length) {
        return <p className="text-xs text-gray-400 py-2">Nothing planned yet.</p>;
    }
    const stopById = new Map(stops.map((stop) => [stop.id, stop]));
    const untimed = layout.untimedStopIds
        .map((id) => stopById.get(id))
        .filter((stop): stop is Stop => stop != null);
    const range = (start: string, end: string, open = false) => `${fmt(start)}–${open ? '→' : fmt(end)}`;

    return (
        <div className="mt-1 pb-1">
            <div className="relative h-[4.5rem] w-full">
                {layout.items.filter((item) => item.above).map((item) => (
                    <ClockLabel
                        key={item.stopId}
                        item={item}
                        time={range(item.start, item.end)}
                        onClick={() => { const stop = stopById.get(item.stopId); if (stop) onOpenStop(stop); }}
                        above
                    />
                ))}
            </div>

            {/* ---- Travel lane: the fixed things on a travel day ---- */}
            {layout.legs.length > 0 && (
                <div className="relative mb-1 h-7 w-full">
                    {layout.legs.map((leg) => (
                        <button
                            key={leg.legId}
                            type="button"
                            data-leg-slice={leg.legId}
                            onClick={() => onOpenLeg?.(leg.legId)}
                            title={`${leg.label} · ${range(leg.start, leg.end, leg.toNextDay)}`}
                            className={`absolute top-0 flex h-full min-w-0 items-center overflow-hidden px-2 text-[10px]
                                font-medium text-white transition hover:brightness-110
                                ${leg.fromPrevDay ? 'rounded-r-full' : leg.toNextDay ? 'rounded-l-full' : 'rounded-full'}`}
                            style={{ left: `${leg.startPct}%`, width: `max(1.25rem, ${leg.widthPct}%)`, ...legBackground(leg.mode) }}
                        >
                            <span className="truncate">
                                {leg.label} · {leg.fromPrevDay ? `→${fmt(leg.end)}` : range(leg.start, leg.end, leg.toNextDay)}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="relative h-8 w-full">
                <div className="absolute inset-x-0 top-2 h-px bg-gray-200" />
                {layout.ticks.map((tick) => (
                    <div key={tick.minutes} className="absolute top-0 h-full" style={{ left: `${tick.pct}%` }}>
                        <span className="absolute top-0.5 h-3 w-px bg-gray-300" />
                        <span className="absolute left-1 top-4 text-[9px] text-gray-400 tabular-nums">{fmt(tick.label)}</span>
                    </div>
                ))}
                {layout.items.map((item) => {
                    const stop = stopById.get(item.stopId);
                    return (
                        <button
                            key={item.stopId}
                            type="button"
                            onClick={() => stop && onOpenStop(stop)}
                            title={`${item.label} · ${range(item.start, item.end)}${item.assumed ? ' (not timed yet)' : ''}`}
                            className="absolute top-2 h-3 -translate-y-1/2 rounded-full border border-white transition
                                hover:brightness-110"
                            style={{
                                left: `${item.startPct}%`,
                                width: `max(0.75rem, ${item.widthPct}%)`,
                                backgroundColor: stop ? colourOf(stop, api.placeById) : '#9ca3af',
                                opacity: item.assumed ? 0.55 : 1,
                            }}
                        />
                    );
                })}
                {layout.markers.map((marker) => (
                    <span
                        key={`${marker.kind}-${marker.time}`}
                        title={`${marker.label} · ${fmt(marker.time)}`}
                        className="absolute -top-9 bottom-0 w-0 border-l-2 border-dashed border-gray-400"
                        style={{ left: `${marker.pct}%` }}
                    />
                ))}
            </div>

            <div className="relative h-[4.5rem] w-full">
                {layout.items.filter((item) => !item.above).map((item) => (
                    <ClockLabel
                        key={item.stopId}
                        item={item}
                        time={range(item.start, item.end)}
                        onClick={() => { const stop = stopById.get(item.stopId); if (stop) onOpenStop(stop); }}
                        above={false}
                    />
                ))}
            </div>

            {(layout.markers.length > 0 || untimed.length > 0 || layout.untimedLegs.length > 0) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    {layout.markers.map((marker) => (
                        <span key={`${marker.kind}-l-${marker.time}`}>
                            <span className="mr-1 inline-block h-3 border-l-2 border-dashed border-gray-400 align-middle" />
                            {marker.label} {fmt(marker.time)}
                        </span>
                    ))}
                    {(untimed.length > 0 || layout.untimedLegs.length > 0) && (
                        <span className="text-amber-700">
                            Not timed yet: {[
                                ...untimed.map((stop) => labelFor(stop, api.placeById)),
                                ...layout.untimedLegs.map((leg) => leg.label),
                            ].join(', ')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * One label, hanging off the axis by a leader line.
 *
 * Anchored by its middle and nudged back inside at the two ends, so the first
 * and last labels stay on the card rather than running off it.
 */
function ClockLabel({ item, time, above, onClick }: {
    item: ReturnType<typeof clockLayout>['items'][number];
    time: string;
    above: boolean;
    onClick: () => void;
}) {
    const edge = item.startPct < 8 ? 'left' : item.startPct > 92 ? 'right' : 'centre';
    const leader = { left: edge === 'centre' ? '50%' : edge === 'right' ? 'calc(100% - 1px)' : 0 };
    return (
        <div
            className={`absolute w-36 ${above ? 'bottom-0' : 'top-0'}`}
            style={{
                left: `${item.startPct}%`,
                transform: edge === 'centre' ? 'translateX(-50%)' : edge === 'right' ? 'translateX(-100%)' : 'none',
            }}
        >
            {!above && <span className="absolute left-0 top-0 h-3 w-px bg-gray-200" style={leader} />}
            <button
                type="button"
                onClick={onClick}
                className={`block w-full ${above ? 'mb-3' : 'mt-3'} ${
                    edge === 'right' ? 'text-right' : edge === 'left' ? 'text-left' : 'text-center'}`}
                title={`${item.label} · ${time}`}
            >
                <span className="block truncate text-[11px] text-gray-800 decoration-dotted underline-offset-2
                    hover:text-accent hover:underline">
                    {item.label}
                </span>
                <span className={`block text-[10px] tabular-nums ${item.assumed ? 'text-gray-300' : 'text-gray-400'}`}>
                    {item.assumed ? `~${time}` : time}
                </span>
            </button>
            {above && <span className="absolute bottom-0 h-3 w-px bg-gray-200" style={leader} />}
        </div>
    );
}

/**
 * The day as an agenda, top to bottom — the timeline on a phone.
 *
 * A horizontal axis of the whole day cannot be read at 390px, so on a phone
 * the time runs down the left edge instead: stops, travel and the hotel's
 * check-out and check-in in the order they happen, each with when it starts
 * and when it ends. Untimed stops go last, said to be untimed.
 */
export function DayAgenda({ api, stops, legs = [], markers = [], onOpenStop, onOpenLeg }: {
    api: HoneymoonApi;
    stops: Stop[];
    legs?: DayLeg[];
    markers?: DayMarker[];
    onOpenStop: (stop: Stop) => void;
    onOpenLeg?: (legId: number) => void;
}) {
    const fmt = useTimeFormat();
    const layout = clockLayout(stops, (stop) => labelFor(stop, api.placeById), { legs, markers });
    const stopById = new Map(stops.map((stop) => [stop.id, stop]));
    const untimed = new Set(layout.untimedStopIds);

    type Row =
        | { kind: 'stop'; at: number; stop: Stop; start: string; end: string }
        | { kind: 'leg'; at: number; leg: (typeof layout.legs)[number] }
        | { kind: 'marker'; at: number; label: string; time: string };
    const rows: Row[] = [
        ...layout.items
            .filter((item) => !untimed.has(item.stopId))
            .map((item): Row => ({
                kind: 'stop', at: item.startMinutes, stop: stopById.get(item.stopId) as Stop, start: item.start, end: item.end,
            })),
        ...layout.legs.map((leg): Row => ({ kind: 'leg', at: leg.fromPrevDay ? -1 : leg.startMinutes, leg })),
        ...markers.map((marker, index): Row => ({
            kind: 'marker', at: marker.minutes, label: marker.label, time: layout.markers[index]?.time ?? '',
        })),
    ].sort((a, b) => a.at - b.at);
    const later = stops.filter((stop) => untimed.has(stop.id));

    if (!rows.length && !later.length && !layout.untimedLegs.length) {
        return <p className="py-2 text-sm text-gray-400">Nothing planned yet.</p>;
    }

    return (
        <ol className="mt-1 space-y-1.5" data-day-agenda>
            {rows.map((row, index) => {
                if (row.kind === 'marker') {
                    return (
                        <li key={`m-${index}`} className="flex items-center gap-3 py-1 text-xs text-gray-500">
                            <span className="w-16 shrink-0 text-right tabular-nums">{fmt(row.time)}</span>
                            <span className="h-px flex-1 border-t border-dashed border-gray-300" />
                            <span className="shrink-0">{row.label}</span>
                        </li>
                    );
                }
                if (row.kind === 'leg') {
                    const { leg } = row;
                    return (
                        <li key={`l-${leg.legId}`}>
                            <button
                                type="button"
                                data-leg-slice={leg.legId}
                                onClick={() => onOpenLeg?.(leg.legId)}
                                className="flex min-h-12 w-full items-stretch gap-3 text-left"
                            >
                                <span className="w-16 shrink-0 pt-2 text-right text-xs tabular-nums text-gray-500">
                                    {leg.fromPrevDay ? '' : fmt(leg.start)}
                                    <span className="block text-gray-400">{leg.toNextDay ? '→ next day' : fmt(leg.end)}</span>
                                </span>
                                <span className="flex min-w-0 flex-1 items-center rounded-2xl px-3 py-2 text-sm font-medium text-white"
                                    style={legBackground(leg.mode)}>
                                    <span className="truncate">{leg.label}</span>
                                </span>
                            </button>
                        </li>
                    );
                }
                const colour = colourOf(row.stop, api.placeById);
                return (
                    <li key={`s-${row.stop.id}`}>
                        <button
                            type="button"
                            onClick={() => onOpenStop(row.stop)}
                            className="flex min-h-12 w-full items-stretch gap-3 text-left"
                        >
                            <span className="w-16 shrink-0 pt-2 text-right text-xs tabular-nums text-gray-700">
                                {fmt(row.start)}
                                <span className="block text-gray-400">{fmt(row.end)}</span>
                            </span>
                            <span className="flex min-w-0 flex-1 items-center rounded-2xl border border-gray-100 bg-white px-3 py-2
                                text-sm text-gray-800 shadow-sm" style={{ borderLeft: `4px solid ${colour}` }}>
                                <span className="truncate">{labelFor(row.stop, api.placeById)}</span>
                            </span>
                        </button>
                    </li>
                );
            })}
            {(later.length > 0 || layout.untimedLegs.length > 0) && (
                <li className="pt-1 text-xs text-amber-700">
                    Not timed yet:{' '}
                    {[...later.map((stop) => labelFor(stop, api.placeById)), ...layout.untimedLegs.map((leg) => leg.label)].join(', ')}
                </li>
            )}
        </ol>
    );
}
