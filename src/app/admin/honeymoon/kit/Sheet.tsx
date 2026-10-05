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
    dataAttrs,
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
    useEffect(() => { if (!open) setTall(false); }, [open]);

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
                className={`fixed inset-x-0 bottom-0 z-[56] flex flex-col bg-white shadow-2xl
                    rounded-t-3xl border border-gray-200/70 transition-[height]
                    ${tall ? 'h-[94dvh]' : 'h-[62dvh]'} md:h-auto ${shape}`}
            >
                {/* The grab handle: a tap toggles half and full height, which is
                    the whole of what a phone sheet needs without a gesture library. */}
                <button
                    type="button"
                    onClick={() => setTall((v) => !v)}
                    aria-label={tall ? 'Shrink the panel' : 'Expand the panel'}
                    className="md:hidden mx-auto mt-1.5 flex h-6 w-16 items-center justify-center"
                >
                    <span className="h-1.5 w-10 rounded-full bg-gray-300" />
                </button>
                <div className="flex shrink-0 items-start gap-2 border-b border-gray-100 px-4 pb-3 pt-1 md:pt-4">
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
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4
                    pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {children}
                </div>
            </div>
        </>
    ), document.body);
}
