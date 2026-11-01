'use client';

import { Drawer, type DrawerWidth } from '@/components/admin/Drawer';

export { useIsPhone } from '@/components/admin/Drawer';

/**
 * The portal's panel: from the right on a laptop, up from the bottom on a
 * phone.
 *
 * Since v0.10.33 every panel in the admin is the same `Drawer`, laid out with
 * whatever else is open beside it (see `Drawer.tsx`); this keeps the portal's
 * own name and props. `side="center"` used to draw a pop-up in the middle of
 * the screen — there are no pop-ups now, so it is a drawer too.
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
    width?: DrawerWidth;
    dataAttrs?: Record<string, string>;
    /** On a phone, open at full height — a form needs the room. */
    startTall?: boolean;
}) {
    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={title}
            actions={actions}
            modal={modal}
            guard={guard}
            width={width}
            dataAttrs={dataAttrs}
            // A form that used to be a pop-up needs the room on a phone too.
            startTall={startTall || side === 'center'}
        >
            {children}
        </Drawer>
    );
}
