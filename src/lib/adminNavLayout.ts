/**
 * How much of the admin sidebar fits on the screen, worked out from its height.
 *
 * The rule (Austin, v0.10.51): no scroll bar within reason. The day-to-day
 * pages — Dashboard and the Planning group — are always listed. Everything
 * else is shown in full while there is room, and folded into one row with a
 * submenu when there is not. Only when even the folded list does not fit does
 * the sidebar scroll.
 *
 * The ladder, first rung that fits wins:
 *
 *   1. everything, comfortable spacing
 *   2. everything, compact spacing          (fine pointers only)
 *   3. fold the first foldable group        (Settings), comfortable
 *   4. the same, compact
 *   5. fold the next (Pages) … and so on
 *   last. everything folded, as tight as allowed — and it scrolls
 *
 * Showing every page tighter beats hiding some at full size, which is why
 * compact comes before folding. Compact is never offered to a touch screen:
 * a 36px row is under the 44px a finger needs.
 *
 * The layout depends only on the height, never on which page is open, so the
 * menu does not rearrange itself under the pointer as you move around.
 *
 * Pure: no DOM. The sidebar sizes its rows from `DENSITY` (inline styles, not
 * class names), so the arithmetic here and the pixels on screen cannot drift
 * apart. Covered by `npm run check:nav`.
 */

export type NavDensity = 'comfortable' | 'compact';

/** Pixel sizes for each spacing. The sidebar draws its rows from these. */
export const DENSITY: Record<NavDensity, { item: number; gap: number; title: number }> = {
    comfortable: { item: 44, gap: 4, title: 32 },
    compact: { item: 36, gap: 2, title: 24 },
};

/** The list's own padding (top and bottom each), and the space between groups. */
export const NAV_PADDING = 12;
export const GROUP_GAP = 12;

export interface NavGroupShape {
    id: string;
    /** How many pages the group lists. */
    items: number;
    /** Has a heading row above its items (every group but the first). */
    titled: boolean;
    /** Always listed in full — never folded. */
    pinned: boolean;
}

export interface NavLayout {
    density: NavDensity;
    /** Ids of the groups shown as one row with a submenu. */
    folded: string[];
    /** The list's height in pixels, padding included. */
    height: number;
    /** False on the last rung: nothing fits, and the list scrolls. */
    fits: boolean;
}

/** One group's height. A folded group is a single row with no heading. */
export function groupHeight(group: NavGroupShape, density: NavDensity, folded: boolean, first: boolean): number {
    const d = DENSITY[density];
    const above = first ? 0 : GROUP_GAP;
    if (folded) return above + d.item;
    const items = group.items * d.item + Math.max(0, group.items - 1) * d.gap;
    return above + (group.titled ? d.title : 0) + items;
}

/** The whole list's height for a given spacing and set of folded groups. */
export function navHeight(groups: NavGroupShape[], density: NavDensity, folded: ReadonlySet<string>): number {
    return groups.reduce(
        (sum, group, i) => sum + groupHeight(group, density, !group.pinned && folded.has(group.id), i === 0),
        NAV_PADDING * 2,
    );
}

/**
 * The layout for `available` pixels of list.
 *
 * `foldOrder` names the groups that may fold, the first to go first — the
 * rarely-touched ones lead. A pinned group in it is ignored. With
 * `allowCompact` false (a touch screen) the compact rungs are skipped.
 */
export function chooseNavLayout(
    groups: NavGroupShape[],
    available: number,
    foldOrder: string[],
    allowCompact = true,
): NavLayout {
    const foldable = foldOrder.filter(id => groups.some(g => g.id === id && !g.pinned));
    const densities: NavDensity[] = allowCompact ? ['comfortable', 'compact'] : ['comfortable'];

    let last: NavLayout | null = null;
    for (let count = 0; count <= foldable.length; count++) {
        const folded = foldable.slice(0, count);
        const set = new Set(folded);
        for (const density of densities) {
            const height = navHeight(groups, density, set);
            last = { density, folded, height, fits: height <= available };
            if (last.fits) return last;
        }
    }
    // Nothing fits: the tightest rung, and the list scrolls.
    return { ...last!, fits: false };
}
