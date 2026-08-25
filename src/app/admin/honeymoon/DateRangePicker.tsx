'use client';

import { useMemo, useState } from 'react';
import { addDays, daysBetween, monthMatrix, todayIso } from '@/lib/honeymoon';
import { Button } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Pick a trip by dragging across a calendar.
 *
 * Two date inputs describe a range; they don't show you one. Dragging does both
 * — you see the shape of the trip against the weekends while you choose it,
 * which is most of why anyone opens a calendar in the first place.
 *
 * The gesture is press-on-the-first-day, release-on-the-last, and it works in
 * either direction. Once a range exists, pressing on either end picks that end
 * up so the trip can be stretched from either side, and pressing anywhere else
 * starts a new range — the same rules every date-range picker has trained
 * people to expect. Everything is `YYYY-MM-DD` strings on UTC parts, matching
 * how the trip's dates are stored and compared.
 */
export default function DateRangePicker({ start, end, onChange, months = 2 }: {
    start: string | null;
    end: string | null;
    /** Fired once, on release, with the normalised range. */
    onChange: (start: string, end: string) => void;
    months?: number;
}) {
    const today = todayIso();

    // The first month on screen. Anchored on the trip if there is one, so
    // opening the page shows the trip rather than whatever month it is now.
    const [anchor, setAnchor] = useState(() => {
        const base = start ?? today;
        const date = new Date(`${base}T00:00:00Z`);
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });

    /** The end being dragged, and where it currently is. */
    const [dragging, setDragging] = useState<{ anchorDate: string; hover: string } | null>(null);

    // What the range would be if you let go now.
    const preview = useMemo(() => {
        if (!dragging) return start && end ? normalise(start, end) : null;
        return normalise(dragging.anchorDate, dragging.hover);
    }, [dragging, start, end]);

    const grids = useMemo(() => Array.from({ length: months }, (_, i) => {
        const date = new Date(Date.UTC(anchor.year, anchor.month + i, 1));
        return monthMatrix(date.getUTCFullYear(), date.getUTCMonth());
    }), [anchor, months]);

    const step = (delta: number) => setAnchor((a) => {
        const date = new Date(Date.UTC(a.year, a.month + delta, 1));
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });

    const beginAt = (iso: string) => {
        // Grabbing an existing end keeps the other one fixed, so a trip can be
        // stretched from either side without redrawing it.
        if (preview && iso === preview.start) setDragging({ anchorDate: preview.end, hover: iso });
        else if (preview && iso === preview.end) setDragging({ anchorDate: preview.start, hover: iso });
        else setDragging({ anchorDate: iso, hover: iso });
    };

    const finish = () => {
        if (!dragging) return;
        const range = normalise(dragging.anchorDate, dragging.hover);
        setDragging(null);
        onChange(range.start, range.end);
    };

    const nights = preview ? (daysBetween(preview.start, preview.end) ?? 0) : 0;

    /**
     * Find the cell under the pointer by hit-testing.
     *
     * `pointerenter` on each cell does not fire during a touch drag — the
     * finger's events all go to the element first touched — so on a phone the
     * range never grew past one day. Reading the element under the pointer
     * works for mouse and touch alike.
     */
    const hoverAt = (clientX: number, clientY: number) => {
        if (!dragging) return;
        const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        const iso = el?.closest<HTMLElement>('[data-day]')?.dataset.day;
        if (iso && iso !== dragging.hover) setDragging({ ...dragging, hover: iso });
    };

    return (
        <div
            // Bound here rather than on each cell: releasing outside the calendar
            // still has to end the drag, or the range would follow the cursor
            // around the page. Pointer capture keeps the move events coming even
            // when the pointer leaves the grid.
            onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
            onPointerMove={(e) => hoverAt(e.clientX, e.clientY)}
            onPointerUp={finish}
            onPointerCancel={finish}
            className="select-none touch-none"
        >
            <div className="flex items-center justify-between gap-2 mb-2">
                <Button className="!px-2.5" onClick={() => step(-1)} aria-label="Previous month">‹</Button>
                <div className="flex-1 text-center text-xs text-gray-500">
                    {preview
                        ? `${label(preview.start)} → ${label(preview.end)} · ${nights + 1} days, ${nights} night${nights === 1 ? '' : 's'}`
                        : 'Drag across the days you are away'}
                </div>
                <Button className="!px-2.5" onClick={() => step(1)} aria-label="Next month">›</Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {grids.map((grid) => (
                    <div key={grid.key}>
                        <h4 className="text-xs font-semibold text-gray-700 text-center mb-1">
                            {grid.label}
                        </h4>
                        <div className="grid grid-cols-7 gap-px">
                            {WEEKDAYS.map((weekday, i) => (
                                <div
                                    key={`${grid.key}-${weekday}-${i}`}
                                    className="text-[10px] text-gray-400 font-semibold text-center pb-1"
                                >
                                    {weekday}
                                </div>
                            ))}
                            {grid.cells.map((cell) => {
                                const inRange = preview
                                    && cell.key >= preview.start && cell.key <= preview.end;
                                const isStart = preview && cell.key === preview.start;
                                const isEnd = preview && cell.key === preview.end;
                                const isToday = cell.key === today;
                                return (
                                    <button
                                        key={cell.key}
                                        type="button"
                                        data-day={cell.key}
                                        onPointerDown={(e) => {
                                            // Stops the browser turning the drag
                                            // into a text selection across cells.
                                            e.preventDefault();
                                            beginAt(cell.key);
                                        }}
                                        aria-label={cell.key}
                                        aria-pressed={!!inRange}
                                        className={`h-8 text-xs tabular-nums transition
                                            ${isStart && isEnd ? 'rounded-lg'
                                            : isStart ? 'rounded-l-lg'
                                                : isEnd ? 'rounded-r-lg' : ''}
                                            ${inRange
                                            ? (isStart || isEnd
                                                ? 'bg-accent text-white font-semibold'
                                                : 'bg-accent/20 text-gray-800')
                                            : cell.inMonth
                                                ? 'text-gray-700 hover:bg-gray-100 rounded-lg'
                                                : 'text-gray-300 hover:bg-gray-50 rounded-lg'}
                                            ${isToday && !inRange ? 'ring-1 ring-inset ring-accent/40' : ''}`}
                                    >
                                        {cell.dayOfMonth}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Round numbers, because "a week" is how people actually decide. */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="text-[11px] text-gray-400 mr-1">Quick set:</span>
                {[7, 10, 14].map((n) => (
                    <Button
                        key={n}
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => {
                            const from = preview?.start ?? start ?? today;
                            onChange(from, addDays(from, n - 1));
                        }}
                    >
                        {n} days
                    </Button>
                ))}
            </div>
        </div>
    );
}

function normalise(a: string, b: string) {
    return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function label(iso: string) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
}
