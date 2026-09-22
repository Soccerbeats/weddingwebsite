'use client';

/**
 * The seating chart as a list.
 *
 * The canvas answers "what does the room look like"; this answers "who is
 * sitting where, and what still needs doing" — which is the question you have
 * when there are thirty tables and a hundred and forty people, and the one a
 * canvas is worst at. Everything here works on the same data and the same
 * endpoint as the canvas, through `src/lib/seating.ts`, so the two can never
 * disagree about what dropping a party on a table does.
 *
 * Two groupings over one row model:
 *   By table — a block per table, its people as rows, unseated parties on top.
 *              Rows are *people*, so you rebalance chair by chair.
 *   By guest — a row per party, wherever they are. Rows are *parties*, so you
 *              seat households in one move.
 * Selection, drag-and-drop and the bulk bar are shared; only the grouping and
 * what a row means change.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SeatingTableData, GuestListEntry, OffListRsvp, SeatData } from './types';
import {
    allSeats,
    splitPartyGroupIds,
    occupancy,
    seatingIssues,
    planSwap,
    planGatherParty,
    planAutoSeat,
    planSeatSelection,
    planUnseatSelection,
    applySeatChange,
    planRenameSeats,
    staleSeatNames,
    SeatChange,
    Selection,
} from '@/lib/seating';

type Grouping = 'table' | 'guest';

/** A selectable line. A seat is one person in a chair; a guest is a whole party. */
type Row =
    | { kind: 'seat'; key: string; name: string; table: SeatingTableData; seat: SeatData; partyGroupId: number | null; rsvp: string | null }
    | { kind: 'guest'; key: string; name: string; guest: GuestListEntry; seatedAt: SeatingTableData[]; rsvp: string | null };

const UNSEATED = -1;
/** The guest grouping's single block. Its own id, not UNSEATED's: collapsing
 *  "Not seated" must not also collapse it, and it is not a drop target. */
const ALL_PARTIES = -2;

const seatKey = (tableId: number, seatIndex: number) => `s:${tableId}:${seatIndex}`;
const guestKey = (guestId: number) => `g:${guestId}`;

// ── Small shared bits ──────────────────────────────────────────────────────

function RsvpDot({ status }: { status: string | null }) {
    const [cls, title] =
        status === 'declined' ? ['bg-red-400', 'Not coming']
            : status === 'likely_not_coming' ? ['bg-orange-400', 'Likely not coming']
                : status === 'attending' ? ['bg-green-400', 'Coming']
                    : status ? ['bg-green-400', status]
                        : ['bg-gray-200', 'No RSVP yet'];
    return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} title={title} />;
}

/** The ⋯ menu. Only the primary and destructive actions live on the bar itself. */
function OverflowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }[] }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                title="More actions"
            >
                ⋯
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-100 py-1.5 z-30">
                    {items.map(item => (
                        <button
                            key={item.label}
                            disabled={item.disabled}
                            onClick={() => { setOpen(false); item.onClick(); }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                item.disabled
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : item.danger
                                        ? 'text-red-600 hover:bg-red-50'
                                        : 'text-gray-700 hover:bg-gray-50'
                            }`}
                            title={item.hint}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── The view ───────────────────────────────────────────────────────────────

/** A stable empty default, so omitting the prop does not rebuild the issue list
 *  on every render. */
const NO_OFF_LIST: OffListRsvp[] = [];

export default function SeatingListView({
    tables,
    guests,
    offListRsvps = NO_OFF_LIST,
    onRefresh,
    onAddTable,
}: {
    tables: SeatingTableData[];
    guests: GuestListEntry[];
    offListRsvps?: OffListRsvp[];
    onRefresh: () => void;
    onAddTable: () => void;
}) {
    const [grouping, setGrouping] = useState<Grouping>('table');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // Everything starts collapsed: thirteen tables expanded is a thousand-row
    // page you have to scroll past to find anything. The counts in each header
    // are what you read first; you open the table you are working on.
    // ALL_PARTIES is deliberately absent — collapsing the guest grouping's only
    // block would leave an empty screen.
    const [collapsed, setCollapsed] = useState<Set<number>>(
        () => new Set([UNSEATED, ...tables.map(t => t.id)]),
    );
    const [search, setSearch] = useState('');
    const [filterSide, setFilterSide] = useState('all');
    const [filterRsvp, setFilterRsvp] = useState('all');
    const [filterSeated, setFilterSeated] = useState('all');
    const [sortBy, setSortBy] = useState<'name' | 'party' | 'rsvp'>('name');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [showIssues, setShowIssues] = useState(true);
    const [issuesExpanded, setIssuesExpanded] = useState(false);
    // On a phone the four filters plus the sort fill the screen before a single
    // name appears, so below `md` they fold behind a button. Above it they are
    // always shown and this flag is ignored.
    const [filtersOpen, setFiltersOpen] = useState(false);
    const lastClicked = useRef<string | null>(null);

    // A grouping switch changes what a row *is*, so a selection made under the
    // other one would act on things the user never picked.
    useEffect(() => { setSelected(new Set()); lastClicked.current = null; }, [grouping]);

    const split = useMemo(() => splitPartyGroupIds(tables), [tables]);
    const issues = useMemo(() => seatingIssues(tables, guests, offListRsvps), [tables, guests, offListRsvps]);
    const guestById = useMemo(() => new Map(guests.map(g => [g.id, g])), [guests]);

    /** Where each party is sitting, if anywhere. */
    const placement = useMemo(() => {
        const map = new Map<number, SeatingTableData[]>();
        for (const { table, seat } of allSeats(tables)) {
            if (seat.party_group_id === null) continue;
            const list = map.get(seat.party_group_id) ?? [];
            if (!list.some(t => t.id === table.id)) list.push(table);
            map.set(seat.party_group_id, list);
        }
        return map;
    }, [tables]);

    const matches = useCallback((name: string, guest: GuestListEntry | undefined, rsvp: string | null, seated: boolean) => {
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            const hay = [name, guest?.guest_name, guest?.plus_one_name, ...(guest?.party_members ?? []).map(m => m?.name ?? '')]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (filterSide !== 'all' && (guest?.side ?? 'unspecified') !== filterSide) return false;
        if (filterRsvp !== 'all') {
            if (filterRsvp === 'none' ? !!rsvp : rsvp !== filterRsvp) return false;
        }
        if (filterSeated === 'seated' && !seated) return false;
        if (filterSeated === 'unseated' && seated) return false;
        return true;
    }, [search, filterSide, filterRsvp, filterSeated]);

    const sortRows = useCallback((rows: Row[]): Row[] => {
        const copy = [...rows];
        copy.sort((a, b) => {
            if (sortBy === 'rsvp') {
                const rank = (r: string | null) => r === 'declined' ? 0 : r === 'likely_not_coming' ? 1 : r ? 3 : 2;
                const diff = rank(a.rsvp) - rank(b.rsvp);
                if (diff !== 0) return diff;
            }
            if (sortBy === 'party') {
                const size = (row: Row) => row.kind === 'guest' ? row.guest.party_size : 1;
                const diff = size(b) - size(a);
                if (diff !== 0) return diff;
            }
            return a.name.localeCompare(b.name);
        });
        return copy;
    }, [sortBy]);

    /** Rows, grouped. `id` is a table id, or UNSEATED for the parties with no chair. */
    const groups = useMemo((): { id: number; title: string; subtitle: string; table: SeatingTableData | null; rows: Row[] }[] => {
        const seatedGroupIds = new Set(
            allSeats(tables).map(s => s.seat.party_group_id).filter((id): id is number => id !== null),
        );

        if (grouping === 'guest') {
            const rows: Row[] = guests
                .filter(g => g.invited)
                .map(g => ({
                    kind: 'guest' as const,
                    key: guestKey(g.id),
                    name: g.guest_name,
                    guest: g,
                    seatedAt: placement.get(g.id) ?? [],
                    rsvp: g.rsvp_status ?? null,
                }))
                .filter(r => matches(r.name, r.guest, r.rsvp, r.seatedAt.length > 0));
            return [{ id: ALL_PARTIES, title: 'All parties', subtitle: `${rows.length} of ${guests.filter(g => g.invited).length}`, table: null, rows: sortRows(rows) }];
        }

        const unseatedRows: Row[] = guests
            .filter(g => g.invited && !seatedGroupIds.has(g.id))
            .map(g => ({
                kind: 'guest' as const,
                key: guestKey(g.id),
                name: g.guest_name,
                guest: g,
                seatedAt: [],
                rsvp: g.rsvp_status ?? null,
            }))
            .filter(r => matches(r.name, r.guest, r.rsvp, false));

        const tableGroups = tables.map(table => {
            const rows: Row[] = table.seats
                .map(seat => ({
                    kind: 'seat' as const,
                    key: seatKey(table.id, seat.seat_index),
                    name: seat.display_name || seat.guest_name || '?',
                    table,
                    seat,
                    partyGroupId: seat.party_group_id,
                    rsvp: seat.rsvp_status ?? null,
                }))
                .filter(r => matches(r.name, r.partyGroupId !== null ? guestById.get(r.partyGroupId) : undefined, r.rsvp, true));
            const { seated, capacity } = occupancy(table);
            const parties = new Set(table.seats.map(s => s.party_group_id).filter(id => id !== null)).size;
            return {
                id: table.id,
                title: table.name,
                subtitle: `${seated} of ${capacity} seat${capacity === 1 ? '' : 's'} · ${parties} part${parties === 1 ? 'y' : 'ies'}`,
                table,
                // Seat order is the table's own order, so the list reads the way the
                // canvas draws it. Sorting is for the flat groupings.
                rows: sortBy === 'name' ? rows : sortRows(rows),
            };
        });

        return [
            {
                id: UNSEATED,
                title: 'Not seated',
                subtitle: `${unseatedRows.length} part${unseatedRows.length === 1 ? 'y' : 'ies'}`,
                table: null,
                rows: sortRows(unseatedRows),
            },
            ...tableGroups,
        ];
    }, [grouping, tables, guests, placement, matches, sortRows, sortBy, guestById]);

    /**
     * Whether a group is folded shut right now.
     *
     * A search or a filter overrides it: the rows it matched are the whole point,
     * and leaving them inside a collapsed block makes the search look broken.
     */
    const narrowing = search.trim().length > 0
        || filterSide !== 'all' || filterRsvp !== 'all' || filterSeated !== 'all';
    const isCollapsed = useCallback(
        (groupId: number, rowCount: number) => !(narrowing && rowCount > 0) && collapsed.has(groupId),
        [narrowing, collapsed],
    );

    /** Every visible row in display order — what shift-click ranges over. */
    const flatRows = useMemo(
        () => groups.flatMap(g => (isCollapsed(g.id, g.rows.length) ? [] : g.rows)),
        [groups, isCollapsed],
    );
    const rowByKey = useMemo(() => new Map(flatRows.map(r => [r.key, r])), [flatRows]);

    /** Turn rows into the shape the planners take. */
    const toSelection = useCallback((rows: Row[]): Selection => ({
        seats: rows.filter((r): r is Extract<Row, { kind: 'seat' }> => r.kind === 'seat')
            .map(r => ({ table: r.table, seat: r.seat })),
        parties: rows.filter((r): r is Extract<Row, { kind: 'guest' }> => r.kind === 'guest')
            .map(r => ({ guest: r.guest, seated: r.seatedAt.length > 0 })),
    }), []);

    const selectedRows = useMemo(
        () => [...selected].map(k => rowByKey.get(k)).filter((r): r is Row => !!r),
        [selected, rowByKey],
    );
    const selection = useMemo(() => toSelection(selectedRows), [selectedRows, toSelection]);
    const selectedSeats = selection.seats;
    const selectedGuests = useMemo(
        () => selectedRows.filter((r): r is Extract<Row, { kind: 'guest' }> => r.kind === 'guest'),
        [selectedRows],
    );

    // ── Selection ────────────────────────────────────────────────────────────

    const clickRow = useCallback((key: string, e: React.MouseEvent) => {
        // Read the anchor and the modifiers *now*, not inside the updater. The
        // updater runs during the next render, by which point `lastClicked` had
        // already been moved to this row — so every shift-click ranged from a row
        // to itself and behaved like a plain ⌘-click.
        const anchor = lastClicked.current;
        const extend = e.shiftKey;
        const additive = e.metaKey || e.ctrlKey;
        // Shift-clicking keeps the anchor where it was, so a range can be widened
        // and narrowed; anything else moves it here.
        if (!extend) lastClicked.current = key;

        setSelected(prev => {
            const next = new Set(prev);
            if (extend && anchor) {
                const from = flatRows.findIndex(r => r.key === anchor);
                const to = flatRows.findIndex(r => r.key === key);
                if (from !== -1 && to !== -1) {
                    const range = flatRows.slice(Math.min(from, to), Math.max(from, to) + 1).map(r => r.key);
                    // Shift *is* the range, so shift-clicking closer to the anchor
                    // narrows it — adding to the old one only ever grew it, and
                    // there was no way back short of starting again. ⌘-shift keeps
                    // what was already picked, for ranges at two different tables.
                    return additive ? new Set([...prev, ...range]) : new Set(range);
                }
            }
            if (additive) {
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
            }
            // A plain click on an already-sole selection clears it, so there is a
            // way out that is not hunting for empty space.
            if (next.size === 1 && next.has(key)) return new Set();
            return new Set([key]);
        });
    }, [flatRows]);

    /** The checkbox path: add or remove one row without disturbing the rest. */
    const toggleRow = useCallback((key: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
        lastClicked.current = key;
    }, []);

    const toggleGroup = useCallback((groupId: number, on: boolean) => {
        const keys = groups.find(g => g.id === groupId)?.rows.map(r => r.key) ?? [];
        setSelected(prev => {
            const next = new Set(prev);
            for (const k of keys) { if (on) next.add(k); else next.delete(k); }
            return next;
        });
    }, [groups]);

    // ── Acting ───────────────────────────────────────────────────────────────

    // Seats still carrying a name the guest list has since changed. Renames made
    // in the guest editor arrive on their own; this is for the ones that came by
    // another road — a CSV import, a bulk edit, a chart filled before either.
    const stale = useMemo(() => staleSeatNames(tables, guests), [tables, guests]);

    const run = useCallback(async (change: SeatChange, message?: string) => {
        if (change.deletes.length === 0 && change.seats.length === 0) {
            setNote(message ?? 'Nothing to do.');
            return;
        }
        setBusy(true);
        try {
            await applySeatChange(change);
            setSelected(new Set());
            setNote(message ?? null);
            onRefresh();
        } catch {
            setNote('That did not save — nothing was changed.');
        } finally {
            setBusy(false);
        }
    }, [onRefresh]);

    /**
     * Send the current selection to a table. Seats move person by person; a party
     * row takes its whole household, gathering the ones already seated elsewhere.
     */
    const moveSelectionTo = useCallback(async (tableId: number) => {
        const change = planSeatSelection(selection, tableId, tables);
        const table = tables.find(t => t.id === tableId);
        await run(change, `Seated ${change.seats.length} at ${table?.name ?? 'the table'}.`);
    }, [selection, tables, run]);

    const unseatSelection = useCallback(async () => {
        const change = planUnseatSelection(selection, tables);
        await run(change, `Freed ${change.deletes.length} chair${change.deletes.length === 1 ? '' : 's'}.`);
    }, [selection, tables, run]);

    const renameSeat = useCallback(async (row: Extract<Row, { kind: 'seat' }>, name: string) => {
        const trimmed = name.trim();
        setRenaming(null);
        if (!trimmed || trimmed === row.name) return;
        await run({
            deletes: [],
            seats: [{
                seating_table_id: row.table.id,
                seat_index: row.seat.seat_index,
                guest_list_id: row.seat.guest_list_id,
                display_name: trimmed,
                party_group_id: row.seat.party_group_id,
            }],
        }, `Renamed to ${trimmed}.`);
    }, [run]);

    // ── Drag and drop ────────────────────────────────────────────────────────

    const dragKeys = useRef<string[]>([]);

    const onRowDragStart = useCallback((row: Row, e: React.DragEvent) => {
        // Dragging a row that is not in the selection drags just that row, which
        // is what every file manager does and what people expect.
        const keys = selected.has(row.key) ? [...selected] : [row.key];
        dragKeys.current = keys;
        if (!selected.has(row.key)) setSelected(new Set(keys));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', keys.join(','));
    }, [selected]);

    const onGroupDrop = useCallback(async (groupId: number, e: React.DragEvent) => {
        e.preventDefault();
        setDropTarget(null);
        const keys = dragKeys.current.length ? dragKeys.current : e.dataTransfer.getData('text/plain').split(',');
        dragKeys.current = [];
        if (keys.length === 0) return;
        setSelected(new Set(keys));
        // setSelected has not landed yet, so act on the dragged keys directly.
        const dragged = toSelection(keys.map(k => rowByKey.get(k)).filter((r): r is Row => !!r));

        // The guest grouping's block stands for "everyone", not a place to put
        // anyone — dropping on it used to unseat the whole selection.
        if (groupId === ALL_PARTIES) return;
        if (groupId === UNSEATED) {
            const change = planUnseatSelection(dragged, tables);
            await run(change, `Freed ${change.deletes.length} chair${change.deletes.length === 1 ? '' : 's'}.`);
            return;
        }
        const change = planSeatSelection(dragged, groupId, tables);
        const table = tables.find(t => t.id === groupId);
        await run(change, `Seated ${change.seats.length} at ${table?.name ?? 'the table'}.`);
    }, [rowByKey, tables, run, toSelection]);

    // ── Bulk actions ─────────────────────────────────────────────────────────

    const canSwap = selectedSeats.length === 2;
    const totalSelected = selected.size;

    const bulkItems = [
        {
            label: 'Swap these two',
            disabled: !canSwap,
            hint: canSwap ? undefined : 'Pick exactly two seated people',
            onClick: () => { if (canSwap) run(planSwap(selectedSeats[0], selectedSeats[1]), 'Swapped.'); },
        },
        {
            label: 'Keep each party together',
            disabled: selectedRows.length === 0,
            hint: 'Bring every split party in the selection onto one table',
            onClick: () => {
                const groupIds = new Set<number>();
                for (const row of selectedRows) {
                    const id = row.kind === 'seat' ? row.partyGroupId : row.guest.id;
                    if (id !== null && split.has(id)) groupIds.add(id);
                }
                const change: SeatChange = { deletes: [], seats: [] };
                for (const id of groupIds) {
                    const plan = planGatherParty(id, tables);
                    change.deletes.push(...plan.deletes);
                    change.seats.push(...plan.seats);
                }
                run(change, groupIds.size === 0 ? 'Nothing in the selection is split.' : `Gathered ${groupIds.size} part${groupIds.size === 1 ? 'y' : 'ies'}.`);
            },
        },
        {
            label: 'Auto-seat into free chairs',
            disabled: selectedGuests.length === 0,
            hint: 'Each party goes to the first table with room for all of it',
            onClick: () => {
                const unseatedOnly = selectedGuests.filter(r => r.seatedAt.length === 0).map(r => r.guest);
                const { change, placed, unplaced } = planAutoSeat(unseatedOnly, tables);
                run(change, `Seated ${placed.length} part${placed.length === 1 ? 'y' : 'ies'}${unplaced.length ? `; ${unplaced.length} did not fit anywhere` : ''}.`);
            },
        },
    ];

    // ── Render ───────────────────────────────────────────────────────────────

    // So the collapsed Filters button can say whether anything is hiding behind it.
    const activeFilterCount = [filterSide, filterRsvp, filterSeated].filter(v => v !== 'all').length
        + (sortBy !== 'name' ? 1 : 0);

    const sides = useMemo(() => [...new Set(guests.map(g => g.side).filter(Boolean))] as string[], [guests]);
    const rsvpStatuses = useMemo(() => [...new Set(guests.map(g => g.rsvp_status).filter(Boolean))].sort() as string[], [guests]);

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-gray-50/60">
            {/* Toolbar */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 flex flex-wrap items-center gap-2">
                <div className="flex bg-gray-100 rounded-full p-0.5 text-xs font-medium">
                    {(['table', 'guest'] as Grouping[]).map(g => (
                        <button
                            key={g}
                            onClick={() => setGrouping(g)}
                            className={`px-3 py-1.5 rounded-full transition-colors ${
                                grouping === g ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {g === 'table' ? 'By table' : 'By guest'}
                        </button>
                    ))}
                </div>

                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search people…"
                    className="flex-1 min-w-[8rem] md:flex-none md:w-52 px-4 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
                />

                <button
                    onClick={() => setFiltersOpen(v => !v)}
                    className={`md:hidden px-3 py-2 rounded-2xl border text-sm transition-colors ${
                        filtersOpen || activeFilterCount > 0
                            ? 'bg-accent/10 border-accent text-accent-dark'
                            : 'border-gray-200 text-gray-500'
                    }`}
                >
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>

                <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex w-full md:w-auto flex-wrap items-center gap-2`}>
                <select value={filterSide} onChange={e => setFilterSide(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none">
                    <option value="all">Either side</option>
                    {sides.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="unspecified">No side</option>
                </select>

                <select value={filterRsvp} onChange={e => setFilterRsvp(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none">
                    <option value="all">Any RSVP</option>
                    {rsvpStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    <option value="none">No RSVP</option>
                </select>

                <select value={filterSeated} onChange={e => setFilterSeated(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none">
                    <option value="all">Seated or not</option>
                    <option value="seated">Seated</option>
                    <option value="unseated">Not seated</option>
                </select>

                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none">
                    <option value="name">Sort by name</option>
                    <option value="party">Sort by party size</option>
                    <option value="rsvp">Sort by RSVP</option>
                </select>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => setCollapsed(prev => (prev.size > 0 ? new Set() : new Set(groups.map(g => g.id))))}
                        className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        {collapsed.size > 0 ? 'Expand all' : 'Collapse all'}
                    </button>
                    <button
                        onClick={onAddTable}
                        className="px-4 py-1.5 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: 'var(--accent)' }}
                    >
                        Add table
                    </button>
                </div>
            </div>

            {/* What is wrong with the plan */}
            {issues.length > 0 && (
                <div className="bg-amber-50/80 border-b border-amber-200 px-4 py-2 shrink-0">
                    <button
                        onClick={() => setShowIssues(v => !v)}
                        className="text-xs font-semibold text-amber-800 hover:text-amber-900 transition-colors"
                    >
                        {issues.length} thing{issues.length === 1 ? '' : 's'} to look at {showIssues ? '▾' : '▸'}
                    </button>
                    {showIssues && (
                        <ul className="mt-1.5 space-y-1">
                            {issues.slice(0, issuesExpanded ? issues.length : 6).map((issue, i) => (
                                <li key={i}>
                                    <button
                                        className="text-xs text-amber-900/90 hover:text-amber-900 hover:underline text-left"
                                        onClick={() => {
                                            const keys = [
                                                ...issue.seats.map(s => seatKey(s.seating_table_id, s.seat_index)),
                                                ...(issue.kind === 'unseated-guest' || issue.kind === 'rsvp-mismatch'
                                                    ? issue.guestIds.map(guestKey) : []),
                                            ].filter(k => rowByKey.has(k));
                                            setSelected(new Set(keys));
                                        }}
                                        title="Select the people this is about"
                                    >
                                        {issue.label}
                                    </button>
                                    {/* The one issue with a right answer already
                                        worked out, so it is one press rather than
                                        a hunt through the chart. */}
                                    {issue.kind === 'stale-name' && (
                                        <button
                                            disabled={busy}
                                            onClick={() => run(
                                                planRenameSeats(stale, tables),
                                                `Renamed ${stale.length} seat${stale.length === 1 ? '' : 's'} to match the guest list.`,
                                            )}
                                            className="ml-2 px-2.5 py-0.5 rounded-full bg-amber-800 text-white text-[11px] font-medium hover:bg-amber-900 disabled:opacity-40"
                                        >
                                            Use the guest list&rsquo;s names
                                        </button>
                                    )}
                                </li>
                            ))}
                            {issues.length > 6 && (
                                <li>
                                    <button
                                        onClick={() => setIssuesExpanded(v => !v)}
                                        className="text-xs font-medium text-amber-800 hover:underline"
                                    >
                                        {issuesExpanded ? 'show fewer' : `and ${issues.length - 6} more`}
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}

            {/* Groups */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {groups.map(group => {
                    const folded = isCollapsed(group.id, group.rows.length);
                    const allSelected = group.rows.length > 0 && group.rows.every(r => selected.has(r.key));
                    return (
                        <div
                            key={group.id}
                            data-group-id={group.id}
                            onDragOver={e => { e.preventDefault(); setDropTarget(group.id); }}
                            onDragLeave={() => setDropTarget(t => (t === group.id ? null : t))}
                            onDrop={e => onGroupDrop(group.id, e)}
                            className={`bg-white rounded-2xl border transition-colors ${
                                dropTarget === group.id ? 'border-accent ring-2 ring-accent/30' : 'border-gray-200'
                            }`}
                        >
                            <div className="flex items-center gap-3 px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={e => toggleGroup(group.id, e.target.checked)}
                                    disabled={group.rows.length === 0}
                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                />
                                <button onClick={() => setCollapsed(prev => {
                                    const next = new Set(prev);
                                    if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                                    return next;
                                })} className="flex items-baseline gap-2 text-left min-w-0 flex-1">
                                    <span className="text-gray-400 text-xs shrink-0">{folded ? '▸' : '▾'}</span>
                                    <span className="text-sm font-semibold text-gray-800 truncate">{group.title}</span>
                                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{group.subtitle}</span>
                                </button>
                                {/* Hidden on touch-sized screens: there is no HTML5 drag there, and
                                    the hint was stealing enough width to wrap the table's own name. */}
                                {group.id !== UNSEATED && group.id !== ALL_PARTIES && (
                                    <span className="ml-auto hidden md:inline text-xs text-gray-400">drop here to seat</span>
                                )}
                                {group.id === UNSEATED && grouping === 'table' && (
                                    <span className="ml-auto hidden md:inline text-xs text-gray-400">drop here to free the chair</span>
                                )}
                            </div>

                            {!folded && (
                                <div className="border-t border-gray-100">
                                    {group.rows.length === 0 ? (
                                        <p className="px-5 py-3 text-xs text-gray-400">
                                            {group.id === UNSEATED ? 'Everyone invited has a chair.'
                                                : group.id === ALL_PARTIES ? 'Nobody matches that.'
                                                    : 'No one here yet.'}
                                        </p>
                                    ) : group.rows.map(row => {
                                        const isSelected = selected.has(row.key);
                                        const partyId = row.kind === 'seat' ? row.partyGroupId : row.guest.id;
                                        const isSplit = partyId !== null && split.has(partyId);
                                        const declined = row.rsvp === 'declined';
                                        return (
                                            <div
                                                key={row.key}
                                                data-row-key={row.key}
                                                draggable={renaming !== row.key}
                                                onDragStart={e => onRowDragStart(row, e)}
                                                onClick={e => clickRow(row.key, e)}
                                                onDoubleClick={() => { if (row.kind === 'seat') setRenaming(row.key); }}
                                                className={`flex items-center gap-3 px-5 py-2 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${
                                                    isSelected ? 'bg-accent/10' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleRow(row.key)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                                <RsvpDot status={row.rsvp} />
                                                {renaming === row.key && row.kind === 'seat' ? (
                                                    <input
                                                        autoFocus
                                                        defaultValue={row.name}
                                                        onClick={e => e.stopPropagation()}
                                                        onBlur={e => renameSeat(row, e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') renameSeat(row, (e.target as HTMLInputElement).value);
                                                            if (e.key === 'Escape') setRenaming(null);
                                                        }}
                                                        className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                                                    />
                                                ) : (
                                                    <span className={`truncate ${declined ? 'text-red-700 line-through decoration-red-400/70' : 'text-gray-800'}`}>
                                                        {row.name}
                                                    </span>
                                                )}
                                                {isSplit && <span className="text-[10px] font-medium text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded-full">split</span>}
                                                {row.kind === 'guest' && row.guest.party_size > 1 && (
                                                    <span className="text-[10px] text-gray-400">party of {row.guest.party_size}</span>
                                                )}
                                                <span className="ml-auto text-xs text-gray-400 truncate max-w-[40%]">
                                                    {row.kind === 'guest'
                                                        // Inside the "Not seated" block, saying "not seated" on every
                                                        // line is noise; in the guest grouping it is the whole point.
                                                        ? (row.seatedAt.length ? row.seatedAt.map(t => t.name).join(', ') : (grouping === 'guest' ? 'not seated' : ''))
                                                        : (row.seat.guest_list_id === null ? 'party member' : '')}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bulk bar */}
            {totalSelected > 0 && (
                <div className="shrink-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 shrink-0">
                        {totalSelected} selected
                    </span>
                    <button
                        onClick={() => setSelected(new Set())}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        clear
                    </button>

                    {/* The bar sits at the bottom of the list, so every row it wraps to is a
                        row taken off the list itself. At phone width the move target, Unseat
                        and the ⋯ share one line rather than claiming three. */}
                    <select
                        value=""
                        disabled={busy}
                        onChange={e => { if (e.target.value) moveSelectionTo(Number(e.target.value)); }}
                        className="order-2 md:order-none flex-1 min-w-[9rem] md:flex-none md:ml-2 px-3 py-2 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:outline-none"
                    >
                        <option value="">Move to table…</option>
                        {tables.map(t => {
                            const { free } = occupancy(t);
                            return <option key={t.id} value={t.id}>{t.name} — {free} free</option>;
                        })}
                    </select>

                    <button
                        onClick={unseatSelection}
                        disabled={busy}
                        className="order-2 md:order-none shrink-0 px-4 py-2 rounded-full text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        Unseat
                    </button>

                    {/* Ordered ahead of the two controls below `md` so the bar reads as
                        "what is selected" then "what to do with it", in two tidy lines
                        rather than three ragged ones. */}
                    <div className="order-1 md:order-none">
                        <OverflowMenu items={bulkItems} />
                    </div>

                    {note && <span className="order-3 md:order-none w-full md:w-auto md:ml-2 text-xs text-gray-500">{note}</span>}
                </div>
            )}
            {totalSelected === 0 && note && (
                <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500">{note}</div>
            )}
        </div>
    );
}
