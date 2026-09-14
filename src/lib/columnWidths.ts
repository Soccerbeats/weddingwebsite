/**
 * Column widths for a resizable table, and the rules for reading them back.
 *
 * Pure: no React, no DOM, no storage. The widths themselves live in the
 * viewer's browser, which means what comes back is whatever was there last —
 * possibly written by an older version of the page, possibly hand-edited,
 * possibly nonsense. Everything here is about turning that into a usable set of
 * widths without ever throwing or handing back a column nobody can see.
 *
 * Used by the schedule table; covered by `npm run check:schedule`.
 */

/** Narrower than this and the column is a sliver nobody can grab again. */
export const MIN_COLUMN_WIDTH = 56;
/** Wider than this and one column pushes every other off the screen. */
export const MAX_COLUMN_WIDTH = 900;

export function clampWidth(
    width: number,
    min: number = MIN_COLUMN_WIDTH,
    max: number = MAX_COLUMN_WIDTH,
): number {
    if (!Number.isFinite(width)) return min;
    return Math.round(Math.min(Math.max(width, min), max));
}

/** Where a drag that started at `startWidth` and has moved `delta` px lands. */
export function widthAfterDrag(
    startWidth: number,
    delta: number,
    min: number = MIN_COLUMN_WIDTH,
    max: number = MAX_COLUMN_WIDTH,
): number {
    return clampWidth(startWidth + delta, min, max);
}

/**
 * Fold stored widths onto the defaults.
 *
 * The defaults decide which columns *exist*: a stored key the table no longer
 * has is dropped, and a column the stored set never heard of keeps its default.
 * That is what lets a column be added or renamed later without stranding
 * everyone who has already dragged something — the alternative is a table that
 * silently renders with a missing column for exactly the people who used the
 * feature.
 */
export function mergeWidths(
    defaults: Record<string, number>,
    stored: unknown,
    min: number = MIN_COLUMN_WIDTH,
    max: number = MAX_COLUMN_WIDTH,
): Record<string, number> {
    const out: Record<string, number> = { ...defaults };
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;

    for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
        if (!(id in defaults)) continue;
        const width = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(width) || width <= 0) continue;
        out[id] = clampWidth(width, min, max);
    }
    return out;
}

/**
 * Read a stored set back, answering null rather than throwing.
 *
 * Storage can hold anything — a half-written value, a string from a different
 * version, or nothing at all — and a table that cannot render because its
 * remembered widths were malformed is a worse outcome than a table at its
 * default widths.
 */
export function parseWidths(raw: string | null | undefined): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
