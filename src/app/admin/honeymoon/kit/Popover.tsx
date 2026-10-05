'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet, useIsPhone } from './Sheet';

/**
 * A button with a small panel hung under it.
 *
 * Portalled to <body> so no card can clip it — the lesson `OverflowMenu`
 * already learned. Closes on Escape and on a press outside, and follows the
 * button while the page scrolls. With `sheetOnPhone` it becomes a bottom sheet
 * below 768px, where a 320px popover has nowhere sensible to hang.
 */
export function Popover({
    label, buttonClassName, buttonContent, children, sheetOnPhone = false, buttonData,
}: {
    label: string;
    buttonClassName: string;
    buttonContent: (open: boolean) => React.ReactNode;
    children: (close: () => void) => React.ReactNode;
    sheetOnPhone?: boolean;
    buttonData?: string;
}) {
    const phone = useIsPhone();
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
    const close = useCallback(() => setOpen(false), []);

    const place = useCallback(() => {
        const rect = trigger.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(320, window.innerWidth - 16);
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        setBox({ top: rect.bottom + 6, left, maxHeight: window.innerHeight - rect.bottom - 24 });
    }, []);

    const asSheet = sheetOnPhone && phone;

    // The sheet owns its own dismissal; these are for the hanging panel only.
    useEffect(() => {
        if (!open || asSheet) return;
        const onDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement;
            if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
            onClose();
        };
        const onClose = () => setOpen(false);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
        };
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, place, asSheet]);

    return (
        <>
            <button
                ref={trigger}
                type="button"
                onClick={() => { if (!open) place(); setOpen((v) => !v); }}
                aria-expanded={open}
                aria-label={label}
                data-popover-trigger={buttonData}
                className={buttonClassName}
            >
                {buttonContent(open)}
            </button>
            {asSheet ? (
                <Sheet open={open} onClose={close} title={<h2 className="font-semibold">{label}</h2>}>
                    {children(close)}
                </Sheet>
            ) : open && box && typeof document !== 'undefined' ? createPortal((
                <div
                    ref={panel}
                    data-popover
                    role="dialog"
                    aria-label={label}
                    style={{ top: box.top, left: box.left, maxHeight: Math.max(200, box.maxHeight) }}
                    className="fixed z-[900] w-[min(20rem,calc(100vw-1rem))] overflow-auto rounded-2xl border
                        border-gray-200 bg-white p-3 shadow-xl"
                >
                    {children(close)}
                </div>
            ), document.body) : null}
        </>
    );
}
