'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Backdrop-blurred modal, matching the rest of the admin panel.
 *
 * Closes on a backdrop *click*, and only when the press started on the backdrop
 * too. A `click` fires on the common ancestor of where the pointer went down and
 * up — so selecting text in a field and releasing past the edge of the dialog
 * lands that click on the backdrop and used to shut the whole thing, losing what
 * you were doing. Tracking where the press began fixes it: releasing outside is
 * not clicking outside.
 */
export function Modal({ open, onClose, title, children, wide = false, guard }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
    /**
     * Runs before any close the user asks for; false keeps the dialog open.
     *
     * This is how a half-typed form stops being thrown away by a stray Escape.
     * It is deliberately not consulted when the dialog closes *itself* after a
     * save — that path calls `onClose` directly.
     */
    guard?: () => boolean;
}) {
    const pressedBackdrop = useRef(false);

    // Escape closes, like every other dialog on the platform. Bound while open
    // only, so a page with five mounted-but-closed dialogs has one listener.
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // A native <select> popup swallows its own Escape; anything else
            // that wants to keep it must stop propagation itself.
            event.stopPropagation();
            if (!guard || guard()) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose, guard]);

    // A portal needs a document, which the server render doesn't have. No
    // mounted flag is needed to bridge that: every dialog in the portal starts
    // closed and is opened by a click, so `open` is always false on the server
    // and on the hydrating render — both sides agree on null.
    if (!open || typeof document === 'undefined') return null;

    /*
     * Rendered into <body>, not in place.
     *
     * The admin area lives inside AppShell's `position: fixed` container, and a
     * fixed element establishes a stacking context — so every z-index inside it,
     * however large, is capped at that container's own level. The site's fixed
     * nav sits outside it at z-index 50 and therefore painted straight over the
     * top of any dialog opened from an admin page, hiding its title bar and
     * close button. Escaping to <body> puts the dialog in the same stacking
     * context as the nav, where z-[60] actually means above it.
     *
     * Raising the z-index alone cannot fix this, and pushing the dialog down
     * below the nav would only trade a covered title for lost height.
     */
    return createPortal((
        <div
            className="fixed inset-0 z-[60] bg-gray-900/30 backdrop-blur-sm flex items-end md:items-center
                justify-center p-0 md:p-4"
            onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
            onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (!pressedBackdrop.current) return;
                pressedBackdrop.current = false;
                if (!guard || guard()) onClose();
            }}
        >
            <div
                className={`bg-white w-full ${wide ? 'md:max-w-3xl xl:max-w-5xl' : 'md:max-w-lg'} rounded-t-3xl md:rounded-3xl
                    shadow-xl max-h-[92vh] overflow-y-auto`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-white/95 backdrop-blur px-5 py-4 border-b border-gray-100
                    flex items-center justify-between rounded-t-3xl">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button
                        onClick={() => { if (!guard || guard()) onClose(); }}
                        className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-4 md:p-5">{children}</div>
            </div>
        </div>
    ), document.body);
}
