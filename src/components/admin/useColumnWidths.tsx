'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, mergeWidths, parseWidths, widthAfterDrag,
} from '@/lib/columnWidths';

/**
 * Draggable column widths for a table, remembered in the browser.
 *
 * Widths are a per-viewer, per-screen preference — a width that suits a 27-inch
 * monitor is wrong on a laptop — so they belong in `localStorage` rather than in
 * the site config, where they would follow you onto a screen they do not fit and
 * cost a write to a shared file on every drag.
 *
 * `localStorage` can be absent or throw (a private window, blocked site data),
 * so every read and write is guarded and the table simply opens at its defaults.
 */
export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
    const [widths, setWidths] = useState<Record<string, number>>(defaults);
    /** Nothing is written until the stored set has been read, or the first
     *  render would overwrite the remembered widths with the defaults. */
    const hydrated = useRef(false);

    useEffect(() => {
        let stored: unknown = null;
        try {
            stored = parseWidths(window.localStorage.getItem(storageKey));
        } catch {
            // Blocked or unavailable; the defaults are a fine answer.
        }
        setWidths(mergeWidths(defaults, stored));
        hydrated.current = true;
        // `defaults` is a literal at the call site; keying on the storage key is
        // what actually distinguishes one table from another.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const persist = useCallback((next: Record<string, number>) => {
        if (!hydrated.current) return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            // Not being able to remember the width is not a reason to refuse to
            // set it — the drag still applies for this session.
        }
    }, [storageKey]);

    /**
     * Start a drag on one column's right-hand edge.
     *
     * Pointer capture rather than window listeners: the pointer routinely leaves
     * the 6px handle within the first frame of a drag, and without capture the
     * column stops following the cursor the moment it does.
     */
    const startResize = useCallback((id: string) => (event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        const startX = event.clientX;
        const startWidth = widths[id] ?? defaults[id] ?? MIN_COLUMN_WIDTH;
        let latest = startWidth;

        handle.setPointerCapture(event.pointerId);
        const onMove = (e: PointerEvent) => {
            latest = widthAfterDrag(startWidth, e.clientX - startX, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
            setWidths(current => ({ ...current, [id]: latest }));
        };
        const onUp = () => {
            handle.releasePointerCapture(event.pointerId);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            // Written once, at the end: a drag is a hundred moves and storage is
            // synchronous.
            setWidths(current => {
                const next = { ...current, [id]: latest };
                persist(next);
                return next;
            });
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    }, [widths, defaults, persist]);

    /** Put one column back where it started. */
    const resetColumn = useCallback((id: string) => {
        setWidths(current => {
            const next = { ...current, [id]: defaults[id] };
            persist(next);
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persist]);

    /** Put them all back. */
    const resetAll = useCallback(() => {
        setWidths(defaults);
        persist(defaults);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persist]);

    const changed = Object.keys(defaults).some(id => widths[id] !== defaults[id]);

    return { widths, startResize, resetColumn, resetAll, changed };
}

/**
 * The grab strip on a column's right edge.
 *
 * Double-click puts that column back — the cheapest undo for a drag that went
 * somewhere silly, and the reason a mis-drag never needs the reset button.
 */
export function ColumnResizer({
    onPointerDown, onReset, label,
}: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onReset: () => void;
    label: string;
}) {
    return (
        <span
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize the ${label} column`}
            onPointerDown={onPointerDown}
            onDoubleClick={onReset}
            title={`Drag to resize ${label} · double-click to reset`}
            className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none
                touch-none group flex justify-center"
        >
            <span className="h-full w-px bg-gray-200 group-hover:bg-accent group-hover:w-0.5 transition-all" />
        </span>
    );
}
