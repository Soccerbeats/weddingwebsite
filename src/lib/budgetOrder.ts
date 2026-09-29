/**
 * Where a dragged budget line ends up.
 *
 * The Budget tab's drag-and-drop reports only what was picked up and what it was
 * dropped on; every question after that — which section it belongs to now, what
 * order each section is in, and which rows the database has to be told about —
 * is answered here.
 *
 * It lives apart from the component for one reason: the same answer has to drive
 * two things that must not disagree. The list redraws optimistically the instant
 * you let go, and the rows go to the server a moment later. If the arithmetic
 * were written twice, a drop could look like one thing on screen and be stored
 * as another, and the difference would only surface on the next reload.
 *
 * Pure — no DOM, no network, no database. Covered by `npm run check:finance`.
 */

/** A section and the lines in it, in the order they are shown. */
export interface OrderedSection {
    id: number;
    itemIds: number[];
}

/** What a line was dropped on: another line, or a section itself. */
export type DropTarget =
    | { kind: 'item'; id: number }
    | { kind: 'section'; id: number };

export interface ReorderPlan {
    /**
     * The new arrangement, every section, for the optimistic redraw.
     */
    sections: OrderedSection[];
    /**
     * What to write: the lines of the touched sections only, in their new order.
     * The array's index becomes `sort_order`, and each row carries the section it
     * belongs to now — the move and the reorder are one write, so a line is never
     * momentarily filed under neither.
     */
    rows: { id: number; category_id: number }[];
}

/**
 * The plan for dropping `activeId` onto `target`, or `null` when nothing moves.
 *
 * `null` covers dropping a line on itself, dropping it back exactly where it
 * already was, and an id belonging to neither list — all of which must not
 * become a write. Every budget mutation refetches the whole payload, so a no-op
 * drop would cost a round trip and a full redraw to arrive back where it started.
 */
export function planLineMove(
    sections: OrderedSection[],
    activeId: number,
    target: DropTarget,
): ReorderPlan | null {
    const from = sections.find(s => s.itemIds.includes(activeId));
    if (!from) return null;

    const to = target.kind === 'section'
        ? sections.find(s => s.id === target.id)
        : sections.find(s => s.itemIds.includes(target.id));
    if (!to) return null;

    if (target.kind === 'item' && target.id === activeId) return null;

    const fromIndex = from.itemIds.indexOf(activeId);

    // The target index is read from the section **as it was**, then the line is
    // inserted at that index into the section with the line lifted out. That is
    // `arrayMove`, which is what every other sortable list in this admin does and
    // what the gap under the cursor is showing you: drag a row from the top onto
    // the third row and it lands third, not second. Recomputing the index after
    // the lift instead drops a downward drag one row short of where it was let go.
    const toIndex = target.kind === 'section'
        ? to.itemIds.filter(id => id !== activeId).length
        : to.itemIds.indexOf(target.id);
    if (toIndex < 0) return null;

    const lifted = sections.map(s => ({
        id: s.id,
        itemIds: s.itemIds.filter(id => id !== activeId),
    }));
    const destination = lifted.find(s => s.id === to.id)!;

    // Nothing actually moved: same section, same gap.
    if (from.id === to.id && fromIndex === toIndex) return null;

    destination.itemIds.splice(toIndex, 0, activeId);

    const touched = from.id === to.id ? [to.id] : [from.id, to.id];
    const rows = lifted
        .filter(s => touched.includes(s.id))
        .flatMap(s => s.itemIds.map(id => ({ id, category_id: s.id })));

    return { sections: lifted, rows };
}

/** The arrangement as it stands, read off the loaded budget. */
export function sectionsOf(
    categories: { id: number; items: { id: number }[] }[],
): OrderedSection[] {
    return categories.map(c => ({ id: c.id, itemIds: c.items.map(i => i.id) }));
}

/**
 * The plan applied to the loaded budget, for the redraw that happens on drop.
 *
 * Every budget mutation refetches the whole payload — deliberately, so no derived
 * number can drift — but a drop that waits for the round trip snaps the row back
 * to where it came from for a beat before it settles. So the list is redrawn from
 * the plan immediately and the refetch confirms it; if the write fails, the
 * refetch is still the truth and puts it back.
 *
 * A section the plan did not touch is returned unchanged, by identity, so React
 * has nothing to re-render for it.
 */
export function applyPlan<
    I extends { id: number; category_id: number },
    C extends { id: number; items: I[] },
>(categories: C[], plan: ReorderPlan): C[] {
    const byId = new Map<number, I>();
    for (const category of categories) {
        for (const item of category.items) byId.set(item.id, item);
    }
    const wanted = new Map(plan.sections.map(s => [s.id, s.itemIds]));

    return categories.map(category => {
        const itemIds = wanted.get(category.id);
        if (!itemIds) return category;
        const unchanged = itemIds.length === category.items.length
            && itemIds.every((id, i) => category.items[i].id === id);
        if (unchanged) return category;
        const items = itemIds
            .map(id => byId.get(id))
            .filter((item): item is I => item != null)
            // The line that moved has to carry its new section here too, or the
            // next drag plans against a section it is no longer in.
            .map(item => (item.category_id === category.id ? item : { ...item, category_id: category.id }));
        return { ...category, items };
    });
}
