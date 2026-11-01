'use client';

import { Drawer } from './Drawer';

/**
 * A titled panel: what the admin's dialogs are built from.
 *
 * It was a pop-up in the middle of the screen until v0.10.33; now it is a
 * `Drawer` from the right like every other panel, so a place opened from inside
 * one lands beside it instead of underneath. The props are unchanged.
 *
 * `guard` runs before any close the user asks for; false keeps it open. This is
 * how a half-typed form stops being thrown away by a stray Escape. It is
 * deliberately not consulted when the panel closes *itself* after a save —
 * that path calls `onClose` directly.
 */
export function Modal({ open, onClose, title, children, wide = false, guard }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
    guard?: () => boolean;
}) {
    return (
        <Drawer
            open={open}
            onClose={onClose}
            guard={guard}
            width={wide ? 'lg' : 'md'}
            title={<h3 className="pt-1.5 font-semibold text-gray-900">{title}</h3>}
        >
            {children}
        </Drawer>
    );
}
