/**
 * Where each open drawer sits on a laptop screen (v0.10.33).
 *
 * Every panel in the admin opens from the right. Opened from one another, they
 * line up side by side — the newest at the right edge, each older one pushed
 * left to make room — and once there is no room left, the oldest fold into a
 * strip with their name on it, tucked behind the oldest drawer still shown in
 * full. In "one drawer" mode only the newest is shown and the rest wait behind.
 *
 * Pure, so `check:honeymoon` can hold it to that without a browser.
 */

export type DrawerMode = 'stack' | 'single';

export interface DrawerSlot {
    /** Left edge, in px from the left of the window. */
    x: number;
    /** Width actually drawn: never wider than the window. */
    width: number;
    /** Only its strip shows. */
    folded: boolean;
    /** Something sits to its right. */
    behind: boolean;
    /** Not shown at all ("one drawer" mode, anything but the newest). */
    hidden: boolean;
}

/** How wide a folded drawer's strip is. */
export const SPINE = 52;
/** How much of the page is left showing before older drawers fold. */
export const PAGE_KEPT = 320;
/** Past this many strips they share a place rather than marching off screen. */
const MAX_SPINES = 6;

/** Laid out oldest first, the same order as `widths`. */
export function drawerLayout(widths: number[], viewport: number, mode: DrawerMode): DrawerSlot[] {
    const n = widths.length;
    const sized = widths.map((w) => Math.min(w, viewport));
    const slots: DrawerSlot[] = sized.map((width) => ({
        x: viewport - width, width, folded: false, behind: false, hidden: false,
    }));
    if (!n) return slots;

    if (mode === 'single') {
        for (let i = 0; i < n - 1; i++) { slots[i].hidden = true; slots[i].behind = true; }
        return slots;
    }

    // From the newest back: each one shown in full while the page keeps its share.
    let left = viewport;
    let i = n - 1;
    for (; i >= 0; i--) {
        const next = left - sized[i];
        // The newest always shows in full, however narrow the window.
        if (i < n - 1 && next < PAGE_KEPT) break;
        left = next;
        slots[i].x = left;
        slots[i].behind = i < n - 1;
    }
    // Everything older folds, each strip a step further left.
    for (let k = 1; i >= 0; i--, k++) {
        slots[i].x = Math.max(0, left - SPINE * Math.min(k, MAX_SPINES));
        slots[i].folded = true;
        slots[i].behind = true;
    }
    return slots;
}
