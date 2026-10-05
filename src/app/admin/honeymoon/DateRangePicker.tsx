'use client';

import { useEffect, useMemo, useState } from 'react';
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

    /*
     * Locked on a touch screen until you ask to change the dates.
     *
     * On a phone this calendar is most of the screen, and a scroll that started
     * on it dragged out a new trip. A finger cannot say "scroll" or "select" by
     * itself, so the page asks: the grid scrolls like everything else until
     * Change dates is tapped, and locks itself again once a range is set. A
     * mouse is never locked — a drag with one is never a scroll. `pointer:
     * coarse` reads the *primary* pointer, so a touch-screen laptop driven by its
     * trackpad stays unlocked too.
     */
    const [coarse, setCoarse] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(pointer: coarse)');
        const apply = () => setCoarse(query.matches);
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    const locked = coarse && !unlocked;

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
        // Set, so lock again: the next scroll must not move it.
        setUnlocked(false);
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
            onPointerDown={locked ? undefined : (e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
            onPointerMove={locked ? undefined : (e) => hoverAt(e.clientX, e.clientY)}
            onPointerUp={locked ? undefined : finish}
            onPointerCancel={locked ? undefined : finish}
            data-date-range={locked ? 'locked' : 'editing'}
            className={`select-none ${locked ? '' : 'touch-none'}`}
        >
            {coarse && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-600">
                        {locked ? 'Dates are locked so the page scrolls.' : 'Drag across the days you are away.'}
                    </p>
                    <Button
                        tone={locked ? 'primary' : 'default'}
                        onClick={() => { setUnlocked(locked); setDragging(null); }}
                    >
                        {locked ? 'Change dates' : 'Done'}
                    </Button>
                </div>
            )}
            <div className="flex items-center justify-between gap-2 mb-2">
                <Button className="!px-2.5 min-w-11 md:min-w-0" onClick={() => step(-1)} aria-label="Previous month">‹</Button>
                <div className="flex-1 text-center text-xs text-gray-500">
                    {preview
                        ? `${label(preview.start)} → ${label(preview.end)} · ${nights + 1} days, ${nights} night${nights === 1 ? '' : 's'}`
                        : 'Drag across the days you are away'}
                </div>
                <Button className="!px-2.5 min-w-11 md:min-w-0" onClick={() => step(1)} aria-label="Next month">›</Button>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl transition
                ${coarse && !locked ? 'ring-2 ring-accent/50 ring-offset-4' : ''} ${locked ? 'opacity-80' : ''}`}>
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
                                            if (locked) return;
                                            // Stops the browser turning the drag
                                            // into a text selection across cells.
                                            e.preventDefault();
                                            beginAt(cell.key);
                                        }}
                                        tabIndex={locked ? -1 : undefined}
                                        aria-label={cell.key}
                                        aria-pressed={!!inRange}
                                        className={`h-11 md:h-8 text-sm md:text-xs tabular-nums transition
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
            <div className={`flex flex-wrap items-center gap-1.5 mt-3 ${locked ? 'hidden' : ''}`}>
                <span className="text-[11px] text-gray-400 mr-1">Quick set:</span>
                {[7, 10, 14].map((n) => (
                    <Button
                        key={n}
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => {
                            const from = preview?.start ?? start ?? today;
                            onChange(from, addDays(from, n - 1));
                            setUnlocked(false);
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
