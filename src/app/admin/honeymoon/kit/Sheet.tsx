'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * True below the `md` breakpoint (768px), decided after mount.
 *
 * The server has no viewport, so the first render always says "not a phone"
 * and the effect corrects it — the same rule the seating chart's list view
 * follows. Anything that must not flash should be CSS, not this.
 */
export function useIsPhone(): boolean {
    const [phone, setPhone] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const apply = () => setPhone(query.matches);
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    return phone;
}

/**
 * A panel that slides in: from the right on a laptop, up from the bottom on a
 * phone.
 *
 * One component for both so the shape is a matter of CSS — rotating a phone or
 * resizing a window across the breakpoint keeps whatever is half-typed inside
 * it, because nothing remounts.
 *
 * Portalled to <body> for the same reason `Modal` is: the admin frame is a
 * fixed stacking context, and anything inside it paints under the site nav. The
 * old place drawer lived inside it, which is why it opened with its title
 * hidden.
 *
 * `modal={false}` draws no backdrop and lets the page underneath keep working —
 * the map stays pannable with a place open beside it. A press outside closes it
 * unless it lands inside an element marked `data-sheet-keep` (the map), where a
 * click on another pin swaps the place instead.
 */
export function Sheet({
    open, onClose, title, actions, children, side = 'right', modal = true, guard, width = 'md',
    dataAttrs, startTall = false,
}: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    side?: 'right' | 'center';
    modal?: boolean;
    /** Runs before a close you asked for; false keeps it open. */
    guard?: () => boolean;
    width?: 'md' | 'lg';
    dataAttrs?: Record<string, string>;
    /** On a phone, open at full height — a form needs the room. */
    startTall?: boolean;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const [tall, setTall] = useState(false);
    const guardRef = useRef(guard);
    const closeRef = useRef(onClose);
    useEffect(() => { guardRef.current = guard; closeRef.current = onClose; });

    useEffect(() => {
        if (!open) return;
        const attempt = () => { if (!guardRef.current || guardRef.current()) closeRef.current(); };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // Something on top of us (a dialog, a menu) owns this Escape.
            const top = document.querySelectorAll('[data-sheet-panel], [role="dialog"]');
            if (top.length && top[top.length - 1] !== panel.current) return;
            event.stopPropagation();
            attempt();
        };
        const onDown = (event: PointerEvent) => {
            if (modal) return;
            const target = event.target as HTMLElement | null;
            if (!target || panel.current?.contains(target)) return;
            if (target.closest('[data-sheet-keep], [data-sheet-panel], [role="dialog"], [data-popover]')) return;
            attempt();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDown);
        };
    }, [open, modal]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setTall(open && startTall); }, [open, startTall]);

    /*
     * Drag the top of the sheet: down to shrink or close, up to expand — the
     * gesture every phone sheet has taught people.
     *
     * The whole top is the grip, not just the little bar: the bar is 40px wide
     * and a thumb missed it as often as it hit it. A press only becomes a drag
     * once it has moved, so the buttons up there still take a tap, and the
     * click that would follow a drag is swallowed. The sheet follows the finger
     * both ways (it used to move only downwards, so dragging up looked like it
     * had not caught), then snaps to the nearest of closed, half and full — a
     * quick flick goes one step that way whatever the distance.
     */
    const drag = useRef<{
        id: number; y: number; startH: number; lastY: number; lastT: number; v: number; active: boolean;
    } | null>(null);
    const swallowClick = useRef(false);
    const [dragH, setDragH] = useState<number | null>(null);

    const onGripDown = (event: React.PointerEvent<HTMLDivElement>) => {
        swallowClick.current = false;
        if (event.button > 0 || !panel.current || !window.matchMedia('(max-width: 767px)').matches) return;
        drag.current = {
            id: event.pointerId, y: event.clientY, lastY: event.clientY, lastT: event.timeStamp, v: 0,
            startH: panel.current.getBoundingClientRect().height, active: false,
        };
    };
    const onGripMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== event.pointerId) return;
        const dy = event.clientY - d.y;
        if (!d.active) {
            if (Math.abs(dy) < 6) return;
            d.active = true;
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        const dt = event.timeStamp - d.lastT;
        if (dt > 0) d.v = (event.clientY - d.lastY) / dt;
        d.lastY = event.clientY;
        d.lastT = event.timeStamp;
        setDragH(Math.min(window.innerHeight * 0.94, Math.max(0, d.startH - dy)));
    };
    const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
        const d = drag.current;
        drag.current = null;
        if (!d || !d.active) return;
        // Cleared by the next press, not a timer: when the click lands varies.
        swallowClick.current = true;
        setDragH(null);
        if (cancelled) return;
        const vh = window.innerHeight;
        const half = vh * 0.62;
        const full = vh * 0.94;
        const height = Math.min(full, Math.max(0, d.startH - (event.clientY - d.y)));
        // A flick that stopped before lifting is not a flick.
        const v = event.timeStamp - d.lastT > 120 ? 0 : d.v;
        let next: 'closed' | 'half' | 'full';
        if (v > 0.5) next = tall ? 'half' : 'closed';
        else if (v < -0.5) next = 'full';
        else if (height < half * 0.6) next = 'closed';
        else next = height > (half + full) / 2 ? 'full' : 'half';
        if (next === 'closed') { if (!guard || guard()) onClose(); return; }
        setTall(next === 'full');
    };

    if (!open || typeof document === 'undefined') return null;

    const widthClass = width === 'lg' ? 'md:w-[min(40rem,100vw)]' : 'md:w-[min(30rem,100vw)]';
    const shape = side === 'center'
        ? `md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
           md:max-h-[88vh] md:rounded-3xl ${width === 'lg' ? 'md:w-[min(48rem,94vw)]' : 'md:w-[min(32rem,94vw)]'}`
        : `md:inset-y-0 md:right-0 md:left-auto md:top-0 md:h-full md:max-h-none md:rounded-none
           md:rounded-l-3xl ${widthClass}`;

    return createPortal((
        <>
            {modal && (
                <div
                    className="fixed inset-0 z-[55] bg-gray-900/30 backdrop-blur-sm"
                    onClick={() => { if (!guard || guard()) onClose(); }}
                    aria-hidden
                />
            )}
            <div
                ref={panel}
                data-sheet-panel
                role="dialog"
                aria-modal={modal}
                {...dataAttrs}
                style={dragH != null ? { height: dragH } : undefined}
                className={`fixed inset-x-0 bottom-0 z-[56] flex flex-col bg-white shadow-2xl
                    rounded-t-3xl border border-gray-200/70
                    ${dragH != null ? '' : 'transition-[height] duration-300 ease-out motion-reduce:transition-none'}
                    ${tall ? 'h-[94dvh]' : 'h-[62dvh]'} md:h-auto ${shape}`}
            >
                {/* The grip: the handle and the title row together. `touch-none`
                    so the browser hands the finger to us instead of scrolling. */}
                <div
                    data-sheet-grip
                    onPointerDown={onGripDown}
                    onPointerMove={onGripMove}
                    onPointerUp={(e) => endDrag(e, false)}
                    onPointerCancel={(e) => endDrag(e, true)}
                    onClickCapture={(e) => {
                        if (!swallowClick.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    className="shrink-0 max-md:touch-none max-md:select-none"
                >
                {/* A tap on the handle toggles half and full height. Full width and
                    44px tall, so a thumb cannot miss it. */}
                <button
                    type="button"
                    data-sheet-handle
                    onClick={() => setTall((v) => !v)}
                    aria-label={tall ? 'Shrink the panel (drag down to close)' : 'Expand the panel (drag down to close)'}
                    className="md:hidden flex h-11 w-full items-center justify-center rounded-t-3xl
                        cursor-grab active:cursor-grabbing"
                >
                    <span className="h-1.5 w-12 rounded-full bg-gray-300" />
                </button>
                <div className="flex shrink-0 items-start gap-2 border-b border-gray-100 px-4 pb-3 pt-0 md:pt-4">
                    <div className="min-w-0 flex-1">{title}</div>
                    {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
                    <button
                        type="button"
                        onClick={() => { if (!guard || guard()) onClose(); }}
                        aria-label="Close"
                        className="-mr-1 flex size-11 md:size-9 shrink-0 items-center justify-center
                            rounded-full text-2xl leading-none text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                    >
                        ×
                    </button>
                </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4
                    pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {children}
                </div>
            </div>
        </>
    ), document.body);
}
