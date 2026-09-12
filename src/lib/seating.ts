/**
 * The seating chart's pure logic — who takes a chair, which chair, and what is
 * wrong with the plan as it stands.
 *
 * Nothing here touches the network or the DOM, so both views (the canvas and the
 * list) can share one answer to "what does dropping this party here do?" rather
 * than each keeping their own. Covered by `npm run check:seating`.
 */
import type { GuestListEntry, OffListRsvp, SeatData, SeatingTableData } from '@/components/seating/types';

/** One row of `seat_assignments`, as the assign endpoint wants it. */
export interface SeatPayload {
    seating_table_id: number;
    seat_index: number;
    guest_list_id: number | null;
    display_name: string;
    party_group_id: number | null;
}

/** A seat that already exists, addressed the way a delete wants it. */
export interface SeatRef {
    seating_table_id: number;
    seat_index: number;
}

/** A whole change to the plan, applied in one transaction. */
export interface SeatChange {
    deletes: SeatRef[];
    seats: SeatPayload[];
}

/**
 * Hand out seat indices that are free at a table.
 *
 * Indices are not positions around the table — the seat list is ordered by index
 * and the canvas lays it out — so the only rule is that two people never share
 * one, which is also what the table's unique constraint enforces.
 */
export function seatIndexer(used: Iterable<number>): () => number {
    const taken = new Set(used);
    let next = 0;
    return () => {
        while (taken.has(next)) next += 1;
        taken.add(next);
        return next;
    };
}

/**
 * The people of a party who need a chair, in order, starting with the guest.
 *
 * `party_size` is the count the guest list edits, so it — not `plus_one_name` —
 * decides how many slots a party has: the guest plus party_size - 1 others. A
 * plus-one still recorded against a guest whose party has since shrunk to one is
 * *not* seated; that name is only settable by CSV import, so it outlives the
 * party it belonged to.
 *
 * Someone who answered "not attending" is skipped — a party of three where one
 * declined takes two chairs. Someone who has not answered is still seated;
 * nothing is assumed on their behalf.
 */
export function partyAttendees(guest: GuestListEntry): { name: string; guestListId: number | null }[] {
    const people: { name: string; guestListId: number | null }[] = [
        { name: guest.guest_name, guestListId: guest.id },
    ];

    const plusOne = (guest.plus_one_name ?? '').trim();
    const members = (guest.party_members ?? [])
        .filter(m => (m?.name ?? '').trim().toLowerCase() !== plusOne.toLowerCase());
    // The plus-one is the first companion when there is room for one.
    const companions: { name: string | null; attending?: boolean | null }[] = plusOne
        ? [{ name: plusOne, attending: null }, ...members]
        : members;

    const slots = Math.max(0, (guest.party_size ?? 1) - 1);
    for (let i = 0; i < slots; i += 1) {
        const companion = companions[i];
        if (companion?.attending === false) continue;
        people.push({
            name: (companion?.name ?? '').trim() || `${guest.guest_name.split(' ')[0]}'s guest ${i + 1}`,
            guestListId: null,
        });
    }
    return people;
}

/** Seat a whole party at a table, filling the free indices in order. */
export function buildPartySeats(
    guest: GuestListEntry,
    tableId: number,
    usedIndices: Iterable<number>,
): SeatPayload[] {
    const nextIndex = seatIndexer(usedIndices);
    return partyAttendees(guest).map(person => ({
        seating_table_id: tableId,
        seat_index: nextIndex(),
        guest_list_id: person.guestListId,
        display_name: person.name,
        party_group_id: guest.id,
    }));
}

/**
 * How many chairs a household is expected to need.
 *
 * The RSVP answer wins whenever there is one: `party_size` is the number they
 * were *invited* for, and a party of four that answers for two keeps its
 * party_size of four. Reading the invitation as the headcount is what made the
 * chart and the RSVP totals disagree with no way to see which was right.
 * Without an answer, an attending household falls back to the people the
 * invitation covers; anyone who has declined, is likely not coming, has not
 * answered, or was never invited needs none.
 */
export function expectedSeats(guest: GuestListEntry): number {
    if (!guest.invited) return 0;
    if (guest.rsvp_status !== 'attending') return 0;
    const answered = guest.rsvp_guests;
    if (typeof answered === 'number' && Number.isFinite(answered) && answered >= 0) {
        return Math.floor(answered);
    }
    return partyAttendees(guest).length;
}

/**
 * The plan in three numbers: households, chairs filled, and people expected.
 *
 * `parties` counts households and `seated`/`expected` count people — three
 * different things the header used to collapse into one figure labelled
 * "guests", which is how a chart seating 102 people could read as 100.
 */
export function headcount(
    tables: SeatingTableData[],
    guests: GuestListEntry[],
    offList: OffListRsvp[] = [],
): { parties: number; seated: number; expected: number; offList: number } {
    return {
        parties: guests.length,
        seated: allSeats(tables).length,
        expected: guests.reduce((n, g) => n + expectedSeats(g), 0),
        offList: offList.reduce((n, r) => n + (Number(r.number_of_guests) || 0), 0),
    };
}

/** Every seat at every table, flattened, with the table it belongs to. */
export function allSeats(tables: SeatingTableData[]): { table: SeatingTableData; seat: SeatData }[] {
    return tables.flatMap(table => table.seats.map(seat => ({ table, seat })));
}

/** Party groups sitting at more than one table. */
export function splitPartyGroupIds(tables: SeatingTableData[]): Set<number> {
    const byParty = new Map<number, Set<number>>();
    for (const { table, seat } of allSeats(tables)) {
        if (seat.party_group_id === null) continue;
        if (!byParty.has(seat.party_group_id)) byParty.set(seat.party_group_id, new Set());
        byParty.get(seat.party_group_id)!.add(table.id);
    }
    const split = new Set<number>();
    for (const [groupId, tableIds] of byParty) if (tableIds.size > 1) split.add(groupId);
    return split;
}

/**
 * Move existing seats to another table.
 *
 * A move is a delete and an insert, planned together so the freed indices at the
 * source are not handed back out at the destination and two moved people never
 * collide on one index. Seats already at the destination are left alone.
 */
export function planMove(
    seats: { table: SeatingTableData; seat: SeatData }[],
    toTableId: number,
    tables: SeatingTableData[],
): SeatChange {
    const target = tables.find(t => t.id === toTableId);
    if (!target) return { deletes: [], seats: [] };

    const moving = seats.filter(s => s.table.id !== toTableId);
    const nextIndex = seatIndexer(target.seats.map(s => s.seat_index));

    return {
        deletes: moving.map(({ table, seat }) => ({
            seating_table_id: table.id,
            seat_index: seat.seat_index,
        })),
        seats: moving.map(({ seat }) => ({
            seating_table_id: toTableId,
            seat_index: nextIndex(),
            guest_list_id: seat.guest_list_id,
            display_name: seat.display_name || seat.guest_name || '?',
            party_group_id: seat.party_group_id,
        })),
    };
}

/** Take seats out of the plan entirely. */
export function planUnseat(seats: { table: SeatingTableData; seat: SeatData }[]): SeatChange {
    return {
        deletes: seats.map(({ table, seat }) => ({
            seating_table_id: table.id,
            seat_index: seat.seat_index,
        })),
        seats: [],
    };
}

/**
 * Swap two people's chairs. They keep the seat index they land on, so the two
 * tables' orders are otherwise untouched — which is the point of a swap, as
 * against moving both.
 */
export function planSwap(
    a: { table: SeatingTableData; seat: SeatData },
    b: { table: SeatingTableData; seat: SeatData },
): SeatChange {
    const at = (
        target: { table: SeatingTableData; seat: SeatData },
        person: SeatData,
    ): SeatPayload => ({
        seating_table_id: target.table.id,
        seat_index: target.seat.seat_index,
        guest_list_id: person.guest_list_id,
        display_name: person.display_name || person.guest_name || '?',
        party_group_id: person.party_group_id,
    });
    // Both rows already exist, so the upsert overwrites them in place — no delete.
    return { deletes: [], seats: [at(a, b.seat), at(b, a.seat)] };
}

/**
 * Bring every seat of a party to one table, with the rest of the party.
 *
 * The destination is the table where most of the party already sits (ties go to
 * the lowest table id, so the answer does not wander between renders).
 */
export function planGatherParty(
    partyGroupId: number,
    tables: SeatingTableData[],
    toTableId?: number,
): SeatChange {
    const seats = allSeats(tables).filter(s => s.seat.party_group_id === partyGroupId);
    if (seats.length === 0) return { deletes: [], seats: [] };

    let destination = toTableId;
    if (destination === undefined) {
        const counts = new Map<number, number>();
        for (const { table } of seats) counts.set(table.id, (counts.get(table.id) ?? 0) + 1);
        destination = [...counts.entries()]
            .sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
    }
    return planMove(seats, destination, tables);
}

/** Seats in use against the chairs the table says it has. */
export function occupancy(table: SeatingTableData): { seated: number; capacity: number; free: number } {
    const seated = table.seats.length;
    const capacity = Math.max(Number(table.seat_count) || 0, seated);
    return { seated, capacity, free: Math.max(0, capacity - seated) };
}

/**
 * Seat whole parties into the chairs that are free, one party at a time.
 *
 * Deliberately dumb and explainable: each party goes to the first table (in the
 * order given) with room for all of it, and a party that fits nowhere is
 * reported rather than split. Nobody already seated is moved. "First table with
 * room" beats any packing cleverness here, because the person running it needs
 * to be able to predict the result and undo it by eye.
 */
export function planAutoSeat(
    guests: GuestListEntry[],
    tables: SeatingTableData[],
): { change: SeatChange; placed: GuestListEntry[]; unplaced: GuestListEntry[] } {
    const free = new Map<number, number>();
    const used = new Map<number, Set<number>>();
    for (const table of tables) {
        free.set(table.id, occupancy(table).free);
        used.set(table.id, new Set(table.seats.map(s => s.seat_index)));
    }

    const seats: SeatPayload[] = [];
    const placed: GuestListEntry[] = [];
    const unplaced: GuestListEntry[] = [];

    for (const guest of guests) {
        const size = partyAttendees(guest).length;
        const table = tables.find(t => (free.get(t.id) ?? 0) >= size);
        if (!table) { unplaced.push(guest); continue; }
        seats.push(...buildPartySeats(guest, table.id, used.get(table.id)!));
        for (const seat of seats.slice(-size)) used.get(table.id)!.add(seat.seat_index);
        free.set(table.id, (free.get(table.id) ?? 0) - size);
        placed.push(guest);
    }
    return { change: { deletes: [], seats }, placed, unplaced };
}

/**
 * A selection, as the two views both end up describing it: some people already
 * in chairs, and some whole parties.
 */
export interface Selection {
    seats: { table: SeatingTableData; seat: SeatData }[];
    parties: { guest: GuestListEntry; seated: boolean }[];
}

/**
 * Put a selection at one table, in a single change.
 *
 * A seated person moves on their own — that is the point of picking one chair.
 * A party row takes its whole household: already seated somewhere, it is
 * gathered here; not seated at all, it is seated fresh. Indices are handed out
 * once across the whole change, so twenty people arriving from four tables never
 * collide on one chair.
 */
export function planSeatSelection(
    selection: Selection,
    toTableId: number,
    tables: SeatingTableData[],
): SeatChange {
    const target = tables.find(t => t.id === toTableId);
    if (!target) return { deletes: [], seats: [] };

    const nextIndex = seatIndexer(target.seats.map(s => s.seat_index));
    const change: SeatChange = { deletes: [], seats: [] };

    const move = planMove(selection.seats, toTableId, tables);
    change.deletes.push(...move.deletes);
    // Re-index rather than trusting planMove's own run, so every source of seats
    // in this change draws from the same allocator.
    change.seats.push(...move.seats.map(s => ({ ...s, seat_index: nextIndex() })));

    for (const { guest, seated } of selection.parties) {
        if (seated) {
            const gather = planGatherParty(guest.id, tables, toTableId);
            change.deletes.push(...gather.deletes);
            change.seats.push(...gather.seats.map(s => ({ ...s, seat_index: nextIndex() })));
        } else {
            const built = buildPartySeats(guest, toTableId, []);
            change.seats.push(...built.map(s => ({ ...s, seat_index: nextIndex() })));
        }
    }
    return change;
}

/** Take a selection out of the plan — a seat on its own, a party entirely. */
export function planUnseatSelection(selection: Selection, tables: SeatingTableData[]): SeatChange {
    const change = planUnseat(selection.seats);
    const already = new Set(change.deletes.map(d => `${d.seating_table_id}:${d.seat_index}`));
    for (const { guest } of selection.parties) {
        for (const { table, seat } of allSeats(tables)) {
            if (seat.party_group_id !== guest.id) continue;
            const key = `${table.id}:${seat.seat_index}`;
            if (already.has(key)) continue;
            already.add(key);
            change.deletes.push({ seating_table_id: table.id, seat_index: seat.seat_index });
        }
    }
    return change;
}

export type IssueKind =
    | 'split-party' | 'declined-seated' | 'over-capacity' | 'unseated-guest'
    | 'rsvp-mismatch' | 'rsvp-off-list';

export interface SeatingIssue {
    kind: IssueKind;
    label: string;
    /** Seats the issue is about, so the list can jump to them. */
    seats: SeatRef[];
    /** Guest list ids the issue is about, for the unseated case. */
    guestIds: number[];
}

/**
 * What is wrong with the plan right now.
 *
 * Deliberately only the things a person cannot see at a glance on a canvas of
 * thirty tables: a party split across tables, someone seated who said no, a
 * table past its own chair count, a guest who is coming with nowhere to sit, a
 * party holding a different number of chairs than it answered for, and an RSVP
 * that matches no household at all.
 *
 * The last two are why the chart's total and the RSVP total could drift apart
 * silently: nothing compared them, so a party seated for two who answered for
 * one, and a whole household that answered without ever being on the guest
 * list, both counted in exactly one of the two figures.
 */
export function seatingIssues(
    tables: SeatingTableData[],
    guests: GuestListEntry[],
    offList: OffListRsvp[] = [],
): SeatingIssue[] {
    const issues: SeatingIssue[] = [];
    const seats = allSeats(tables);

    for (const groupId of splitPartyGroupIds(tables)) {
        const partySeats = seats.filter(s => s.seat.party_group_id === groupId);
        const name = guests.find(g => g.id === groupId)?.guest_name
            ?? partySeats[0]?.seat.display_name
            ?? 'A party';
        const tableNames = [...new Set(partySeats.map(s => s.table.name))].join(', ');
        issues.push({
            kind: 'split-party',
            label: `${name}'s party is split across ${tableNames}`,
            seats: partySeats.map(({ table, seat }) => ({ seating_table_id: table.id, seat_index: seat.seat_index })),
            guestIds: [groupId],
        });
    }

    // One line per table, not per person: a table that seated a whole declined
    // family produced eight near-identical lines and pushed the actual list off
    // the screen, which is how a warning stops being read.
    for (const table of tables) {
        const declined = table.seats.filter(s => s.rsvp_status === 'declined');
        if (declined.length === 0) continue;
        const names = declined.map(s => s.display_name || s.guest_name || 'Someone');
        const shown = names.slice(0, 3).join(', ');
        const rest = names.length - 3;
        issues.push({
            kind: 'declined-seated',
            label: names.length === 1
                ? `${shown} is not coming but is seated at ${table.name}`
                : `${names.length} people seated at ${table.name} are not coming — ${shown}${rest > 0 ? ` and ${rest} more` : ''}`,
            seats: declined.map(s => ({ seating_table_id: table.id, seat_index: s.seat_index })),
            guestIds: declined.map(s => s.guest_list_id).filter((id): id is number => id !== null),
        });
    }

    for (const table of tables) {
        const { seated } = occupancy(table);
        // occupancy() widens capacity to the seats in use, so a table is only
        // over its own count when that count was declared and is smaller.
        const declared = Number(table.seat_count) || 0;
        if (declared > 0 && seated > declared) {
            issues.push({
                kind: 'over-capacity',
                label: `${table.name} has ${seated} people in ${declared} chair${declared === 1 ? '' : 's'}`,
                seats: table.seats.map(s => ({ seating_table_id: table.id, seat_index: s.seat_index })),
                guestIds: [],
            });
        }
    }

    // A party that is coming but holds a different number of chairs than it
    // answered for — the drift that let the chart's total and the RSVP total
    // disagree with nothing on screen saying so. Only parties that answered
    // "attending" and hold *some* chairs: no chairs at all is the unseated case
    // below, and a seated party that declined is already `declined-seated`.
    for (const guest of guests) {
        if (guest.rsvp_status !== 'attending') continue;
        const partySeats = seats.filter(s => s.seat.party_group_id === guest.id);
        if (partySeats.length === 0) continue;
        const expected = expectedSeats(guest);
        if (expected === partySeats.length) continue;
        const chairs = `${partySeats.length} chair${partySeats.length === 1 ? '' : 's'}`;
        issues.push({
            kind: 'rsvp-mismatch',
            label: partySeats.length > expected
                ? `${guest.guest_name}'s party answered for ${expected} but has ${chairs}`
                : `${guest.guest_name}'s party answered for ${expected} but has only ${chairs}`,
            seats: partySeats.map(({ table, seat }) => ({ seating_table_id: table.id, seat_index: seat.seat_index })),
            guestIds: [guest.id],
        });
    }

    // Someone answered the RSVP form under a name the guest list does not have —
    // a household never added, or the same person spelt two ways. They are in
    // the RSVP headcount and can never appear on the chart, so neither total is
    // wrong on its own and only a comparison finds them.
    if (offList.length > 0) {
        const people = offList.reduce((n, r) => n + (Number(r.number_of_guests) || 0), 0);
        const shown = offList.slice(0, 3).map(r => r.guest_name).join(', ');
        const rest = offList.length - 3;
        issues.push({
            kind: 'rsvp-off-list',
            label: `${people} ${people === 1 ? 'person' : 'people'} RSVP'd but ${offList.length === 1 ? 'is' : 'are'} not on the guest list — ${shown}${rest > 0 ? ` and ${rest} more` : ''}`,
            seats: [],
            guestIds: [],
        });
    }

    const seatedGroupIds = new Set(seats.map(s => s.seat.party_group_id).filter((id): id is number => id !== null));
    const unseated = guests.filter(g => g.invited && g.rsvp_status === 'attending' && !seatedGroupIds.has(g.id));
    if (unseated.length > 0) {
        issues.push({
            kind: 'unseated-guest',
            label: `${unseated.length} ${unseated.length === 1 ? 'party is' : 'parties are'} coming with nowhere to sit`,
            seats: [],
            guestIds: unseated.map(g => g.id),
        });
    }

    return issues;
}

/** Send a planned change to the assign endpoint. One request, one transaction. */
export async function applySeatChange(change: SeatChange): Promise<void> {
    if (change.deletes.length === 0 && change.seats.length === 0) return;
    const res = await fetch('/api/admin/seating/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletes: change.deletes, seats: change.seats }),
    });
    if (!res.ok) throw new Error('Failed to apply seating change');
}
