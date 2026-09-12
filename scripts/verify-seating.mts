/**
 * Verifies the seating chart's pure logic — who gets a chair, which chair, and
 * what the plan is getting wrong.
 *
 *   npm run check:seating
 *
 * No database and no browser. Both views (the canvas and the list) route every
 * change through these functions, so a wrong answer here would seat someone
 * twice, drop someone silently, or hand two people the same chair — none of
 * which announces itself on screen.
 */
import type { GuestListEntry, SeatData, SeatingTableData } from '../src/components/seating/types';
import {
    allSeats, buildPartySeats, expectedSeats, headcount, occupancy, partyAttendees,
    planAutoSeat, planGatherParty, planMove, planSeatSelection, planSwap, planUnseat,
    planUnseatSelection, seatIndexer, seatingIssues, splitPartyGroupIds,
} from '../src/lib/seating';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = '') {
    checks += 1;
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        failures += 1;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

/* ---- fixtures ---- */

function guest(id: number, name: string, partySize: number, members: { name: string | null; attending?: boolean | null }[] = [], extra: Partial<GuestListEntry> = {}): GuestListEntry {
    return {
        id,
        guest_name: name,
        plus_one_name: null,
        party_size: partySize,
        side: null,
        rsvp_status: 'attending',
        invited: true,
        party_members: members,
        ...extra,
    };
}

function seat(index: number, name: string, partyGroupId: number | null, guestListId: number | null = null, rsvp: string | null = 'attending'): SeatData {
    return {
        seat_index: index,
        guest_list_id: guestListId,
        display_name: name,
        party_group_id: partyGroupId,
        guest_name: null,
        plus_one_name: null,
        party_size: null,
        rsvp_status: rsvp,
    };
}

function table(id: number, name: string, seatCount: number, seats: SeatData[] = []): SeatingTableData {
    return { id, name, table_type: 'round', seat_count: seatCount, x: 0, y: 0, rotation: 0, seats };
}

/* ---- who takes a chair ---- */

console.log('\nWho takes a chair');
{
    const solo = guest(1, 'Ada Byron', 1);
    check('a party of one is one person', partyAttendees(solo).length === 1);

    const couple = guest(2, 'Anna Mathy', 2, [{ name: 'Greg Mathy', attending: true }]);
    check('a party of two is both', partyAttendees(couple).map(p => p.name).join(', ') === 'Anna Mathy, Greg Mathy');

    // The bug this whole area exists for: a party of three, one of whom declined.
    const three = guest(3, 'Anna Mathy', 3, [
        { name: 'Greg Mathy', attending: false },
        { name: 'Ashley Mathy', attending: true },
    ]);
    const attending = partyAttendees(three);
    check('a member who declined takes no chair', attending.length === 2, `${attending.length} chairs`);
    check('the ones who are coming keep their names',
        attending.map(p => p.name).join(', ') === 'Anna Mathy, Ashley Mathy',
        attending.map(p => p.name).join(', '));

    const unanswered = guest(4, 'Janet Taylor', 3, [{ name: 'Stephen Taylor' }, { name: 'Petra Taylor', attending: null }]);
    check('a member who has not answered still gets a chair', partyAttendees(unanswered).length === 3);

    const unnamed = guest(5, 'Mabel Grey', 3, [{ name: null }, { name: null }]);
    check('an unnamed slot is seated under a placeholder',
        partyAttendees(unnamed).map(p => p.name).join(', ') === "Mabel Grey, Mabel's guest 1, Mabel's guest 2",
        partyAttendees(unnamed).map(p => p.name).join(', '));

    // party_size is the authority: a plus-one left on a party since shrunk to one
    // must not conjure a second chair.
    const shrunk = guest(6, 'Ida Lovelace', 1, [], { plus_one_name: 'A Ghost' });
    check('a stale plus-one on a party of one seats nobody extra', partyAttendees(shrunk).length === 1);

    const withPlusOne = guest(7, 'Alan Turing', 2, [], { plus_one_name: 'Joan Clarke' });
    check('a plus-one is the first companion',
        partyAttendees(withPlusOne).map(p => p.name).join(', ') === 'Alan Turing, Joan Clarke');

    // The plus-one is also in party_members — it must not be seated twice.
    const dup = guest(8, 'Alan Turing', 2, [{ name: 'Joan Clarke', attending: true }], { plus_one_name: 'Joan Clarke' });
    check('a plus-one also listed as a member is one person, not two',
        partyAttendees(dup).length === 2, partyAttendees(dup).map(p => p.name).join(', '));

    check('only the guest carries a guest_list_id',
        partyAttendees(three).filter(p => p.guestListId !== null).length === 1);
}

/* ---- chairs ---- */

console.log('\nChairs');
{
    const next = seatIndexer([0, 2, 3]);
    check('the indexer skips what is taken', next() === 1 && next() === 4 && next() === 5);

    const built = buildPartySeats(guest(1, 'Ada Byron', 3, [{ name: 'B' }, { name: 'C' }]), 9, [0, 1]);
    check('a party fills the free indices', built.map(s => s.seat_index).join(',') === '2,3,4', built.map(s => s.seat_index).join(','));
    check('every seat is filed under the party', built.every(s => s.party_group_id === 1));
    check('the seats land at the table asked for', built.every(s => s.seating_table_id === 9));

    const t = table(1, 'Table 1', 8, [seat(0, 'A', 1), seat(1, 'B', 1)]);
    check('occupancy counts seats against the declared capacity',
        occupancy(t).seated === 2 && occupancy(t).capacity === 8 && occupancy(t).free === 6);
    const over = table(2, 'Table 2', 2, [seat(0, 'A', 1), seat(1, 'B', 1), seat(2, 'C', 1)]);
    check('capacity widens to the seats in use rather than going negative',
        occupancy(over).capacity === 3 && occupancy(over).free === 0);
}

/* ---- moving ---- */

console.log('\nMoving');
{
    const t1 = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, 'Bea', 1), seat(2, 'Cy', 2, 2)]);
    const t2 = table(2, 'Table 2', 8, [seat(0, 'Dot', 3, 3)]);
    const tables = [t1, t2];

    const move = planMove([{ table: t1, seat: t1.seats[0] }, { table: t1, seat: t1.seats[1] }], 2, tables);
    check('a move deletes exactly what it re-inserts', move.deletes.length === 2 && move.seats.length === 2);
    check('the moved people do not collide with who is already there',
        new Set(move.seats.map(s => s.seat_index)).size === 2 && !move.seats.some(s => s.seat_index === 0),
        move.seats.map(s => s.seat_index).join(','));
    check('a move keeps the party it belonged to', move.seats.every(s => s.party_group_id === 1));
    check('a move keeps the guest link of the person who has one',
        move.seats.filter(s => s.guest_list_id === 1).length === 1);

    const noop = planMove([{ table: t2, seat: t2.seats[0] }], 2, tables);
    check('moving someone to the table they are already at does nothing',
        noop.deletes.length === 0 && noop.seats.length === 0);

    const nowhere = planMove([{ table: t1, seat: t1.seats[0] }], 99, tables);
    check('a move to a table that does not exist does nothing',
        nowhere.deletes.length === 0 && nowhere.seats.length === 0);

    const unseat = planUnseat([{ table: t1, seat: t1.seats[0] }]);
    check('unseating deletes and inserts nothing', unseat.deletes.length === 1 && unseat.seats.length === 0);

    const swap = planSwap({ table: t1, seat: t1.seats[0] }, { table: t2, seat: t2.seats[0] });
    check('a swap writes two rows and deletes none', swap.seats.length === 2 && swap.deletes.length === 0);
    check('a swap puts each person in the other chair',
        swap.seats[0].seating_table_id === 1 && swap.seats[0].display_name === 'Dot'
        && swap.seats[1].seating_table_id === 2 && swap.seats[1].display_name === 'Ada',
        JSON.stringify(swap.seats.map(s => [s.seating_table_id, s.display_name])));
}

/* ---- split parties ---- */

console.log('\nSplit parties');
{
    const t1 = table(1, 'Table 1', 8, [seat(0, 'Ada', 7, 7), seat(1, 'Bea', 7)]);
    const t2 = table(2, 'Table 2', 8, [seat(0, 'Cy', 7), seat(1, 'Dot', 8, 8)]);
    const tables = [t1, t2];

    check('a party at two tables is split', splitPartyGroupIds(tables).has(7));
    check('a party at one table is not', !splitPartyGroupIds(tables).has(8));

    // Two of the party sit at Table 1, one at Table 2 — the majority table wins.
    const gather = planGatherParty(7, tables);
    check('gathering moves the minority to where most of the party sits',
        gather.seats.length === 1 && gather.seats[0].seating_table_id === 1,
        JSON.stringify(gather.seats.map(s => s.seating_table_id)));
    check('the gathered person does not land on a taken chair',
        !t1.seats.some(s => s.seat_index === gather.seats[0].seat_index),
        String(gather.seats[0].seat_index));

    const forced = planGatherParty(7, tables, 2);
    check('gathering somewhere specific moves everyone else there',
        forced.seats.length === 2 && forced.seats.every(s => s.seating_table_id === 2));
    check('a party nobody has seated gathers into nothing',
        planGatherParty(999, tables).seats.length === 0);
}

/* ---- a whole selection ---- */

console.log('\nActing on a selection');
{
    const t1 = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, 'Bea', 1)]);
    const t2 = table(2, 'Table 2', 8, [seat(0, 'Cy', 2, 2)]);
    const tables = [t1, t2];
    const newParty = guest(3, 'Dot Grey', 2, [{ name: 'Eli Grey', attending: true }]);

    const change = planSeatSelection({
        seats: [{ table: t1, seat: t1.seats[0] }],
        parties: [{ guest: newParty, seated: false }],
    }, 2, tables);

    check('a selection of a person and a party lands in one change',
        change.seats.length === 3 && change.deletes.length === 1,
        `${change.seats.length} seats, ${change.deletes.length} deletes`);
    check('nobody in the change shares a chair',
        new Set(change.seats.map(s => s.seat_index)).size === change.seats.length,
        change.seats.map(s => s.seat_index).join(','));
    check('nobody in the change takes a chair already in use at the table',
        !change.seats.some(s => s.seat_index === 0),
        change.seats.map(s => s.seat_index).join(','));

    // The case that made this one function instead of two: a party already seated
    // elsewhere is gathered, not seated a second time.
    const seatedParty = guest(1, 'Ada Byron', 2, [{ name: 'Bea Byron', attending: true }]);
    const gathered = planSeatSelection({ seats: [], parties: [{ guest: seatedParty, seated: true }] }, 2, tables);
    check('a party already seated is moved, not duplicated',
        gathered.seats.length === 2 && gathered.deletes.length === 2,
        `${gathered.seats.length} seats, ${gathered.deletes.length} deletes`);

    const freed = planUnseatSelection({
        seats: [{ table: t1, seat: t1.seats[0] }],
        parties: [{ guest: seatedParty, seated: true }],
    }, tables);
    check('unseating a person and their party deletes each chair once',
        freed.deletes.length === 2,
        JSON.stringify(freed.deletes));
}

/* ---- auto-seating ---- */

console.log('\nAuto-seating');
{
    const tables = [
        table(1, 'Table 1', 2, [seat(0, 'Ada', 1, 1)]),   // one free chair
        table(2, 'Table 2', 6, []),                        // six free
    ];
    const pair = guest(2, 'Bea Byron', 2, [{ name: 'Cy Byron', attending: true }]);
    const solo = guest(3, 'Dot Grey', 1);
    const crowd = guest(4, 'Eli Vance', 9, Array.from({ length: 8 }, () => ({ name: null })));

    const { change, placed, unplaced } = planAutoSeat([pair, solo, crowd], tables);
    check('a party goes to the first table with room for all of it',
        change.seats.filter(s => s.party_group_id === 2).every(s => s.seating_table_id === 2));
    check('a party that fits the gap takes it',
        change.seats.filter(s => s.party_group_id === 3).every(s => s.seating_table_id === 1));
    check('a party that fits nowhere is reported rather than split',
        unplaced.length === 1 && unplaced[0].id === 4 && placed.length === 2);
    check('auto-seating moves nobody who is already sitting down', change.deletes.length === 0);
    const perTable = new Map<number, number[]>();
    for (const s of change.seats) perTable.set(s.seating_table_id, [...(perTable.get(s.seating_table_id) ?? []), s.seat_index]);
    check('nobody is auto-seated onto an occupied chair',
        [...perTable.entries()].every(([id, idx]) => {
            const existing = tables.find(t => t.id === id)!.seats.map(s => s.seat_index);
            return new Set([...idx, ...existing]).size === idx.length + existing.length;
        }),
        JSON.stringify([...perTable]));
}

/* ---- what is wrong with the plan ---- */

console.log('\nWhat is wrong with the plan');
{
    const t1 = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, 'Greg', 1, null, 'declined')]);
    const t2 = table(2, 'Table 2', 8, [seat(0, 'Bea', 1)]);
    const tiny = table(3, 'Table 3', 1, [seat(0, 'Cy', 2, 2), seat(1, 'Dot', 2)]);
    const tables = [t1, t2, tiny];
    const guests = [
        guest(1, 'Ada Byron', 3, [{ name: 'Greg', attending: false }, { name: 'Bea', attending: true }]),
        guest(2, 'Cy Vance', 2, [{ name: 'Dot Vance', attending: true }]),
        guest(9, 'Unseated Ursula', 1),
        guest(10, 'Not Coming Nora', 1, [], { rsvp_status: 'declined' }),
    ];

    const issues = seatingIssues(tables, guests);
    const kinds = issues.map(i => i.kind);
    check('a party across two tables is flagged', kinds.includes('split-party'));
    check('someone seated who said no is flagged', kinds.includes('declined-seated'));
    check('a table past its own chair count is flagged', kinds.includes('over-capacity'));
    check('a guest who is coming with nowhere to sit is flagged', kinds.includes('unseated-guest'));

    const unseatedIssue = issues.find(i => i.kind === 'unseated-guest')!;
    check('someone who declined is not counted as needing a chair',
        unseatedIssue.guestIds.length === 1 && unseatedIssue.guestIds[0] === 9,
        JSON.stringify(unseatedIssue.guestIds));

    const declinedIssue = issues.find(i => i.kind === 'declined-seated')!;
    check('the declined flag points at the chair to free',
        declinedIssue.seats.length === 1 && declinedIssue.seats[0].seating_table_id === 1 && declinedIssue.seats[0].seat_index === 1);

    // A whole family that declined used to produce one line each, which buried
    // the list under its own warnings.
    const familyTable = table(5, 'Table 5', 8, [
        seat(0, 'A', 1, 1, 'declined'), seat(1, 'B', 1, null, 'declined'),
        seat(2, 'C', 1, null, 'declined'), seat(3, 'D', 1, null, 'declined'),
        seat(4, 'E', 1, null, 'declined'),
    ]);
    const familyIssues = seatingIssues([familyTable], [guest(1, 'A', 5)]).filter(i => i.kind === 'declined-seated');
    check('a table full of people who declined is one line, not five', familyIssues.length === 1, `${familyIssues.length} lines`);
    check('that line names a few and counts the rest',
        familyIssues[0].label.includes('5 people') && familyIssues[0].label.includes('and 2 more'),
        familyIssues[0].label);
    check('that line still points at every chair to free', familyIssues[0].seats.length === 5);

    const clean = seatingIssues(
        [table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1)])],
        [guest(1, 'Ada Byron', 1)],
    );
    check('a plan with nothing wrong reports nothing', clean.length === 0, JSON.stringify(clean.map(i => i.kind)));

    check('a table with no declared capacity is never over it',
        seatingIssues([table(4, 'Sweetheart', 0, [seat(0, 'A', 1, 1), seat(1, 'B', 1)])], [guest(1, 'A', 2, [{ name: 'B' }])])
            .every(i => i.kind !== 'over-capacity'));

    check('flattening finds every seat at every table', allSeats(tables).length === 5);
}

/* ---- the RSVP answer against the invitation ---- */
{
    console.log('\nexpected headcount');

    // The bug this covers: `party_size` is what a household was *invited* for.
    // A party of four that answers for one keeps its party_size of four, so
    // reading the invitation as the headcount seated three people who said no
    // — and nothing on screen compared the chart's total with the RSVP's.
    check('the RSVP answer beats the invitation',
        expectedSeats(guest(1, 'Ada', 4, [], { rsvp_guests: 1 })) === 1);
    check('answering for more than the invitation is still what they answered',
        expectedSeats(guest(1, 'Ada', 2, [], { rsvp_guests: 3 })) === 3);
    check('with no answer, an attending party falls back to the invitation',
        expectedSeats(guest(1, 'Ada', 3)) === 3);
    check('with no answer, a declined member still takes no chair',
        expectedSeats(guest(1, 'Ada', 3, [{ name: 'B', attending: false }, { name: 'C' }])) === 2);
    check('a party that declined needs no chairs',
        expectedSeats(guest(1, 'Ada', 4, [], { rsvp_status: 'declined', rsvp_guests: 4 })) === 0);
    check('a party that is likely not coming needs no chairs',
        expectedSeats(guest(1, 'Ada', 2, [], { rsvp_status: 'likely_not_coming' })) === 0);
    check('a party that has not answered needs no chairs yet',
        expectedSeats(guest(1, 'Ada', 2, [], { rsvp_status: null })) === 0);
    check('someone not invited needs no chairs',
        expectedSeats(guest(1, 'Ada', 2, [], { invited: false })) === 0);
    check('an answer of zero is an answer, not a missing one',
        expectedSeats(guest(1, 'Ada', 4, [], { rsvp_guests: 0 })) === 0);

    const t = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, 'Bea', 1)]);
    const hc = headcount(
        [t],
        [guest(1, 'Ada', 2, [], { rsvp_guests: 2 }), guest(2, 'Cy', 3, [], { rsvp_guests: 3 })],
        [{ guest_name: 'Off List Olive', number_of_guests: 2 }],
    );
    // Households, chairs filled and people expected are three different numbers.
    // The header showed only the first and called it "guests", which is how a
    // chart seating 102 people could read as 100.
    check('households are counted as households', hc.parties === 2);
    check('chairs filled are counted as people', hc.seated === 2);
    check('people expected come from the RSVP answers', hc.expected === 5);
    check('people who answered off the guest list are counted apart', hc.offList === 2);
}

/* ---- the two totals disagreeing ---- */
{
    console.log('\nRSVP against the chart');

    const over = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, "Ada's guest 1", 1)]);
    const overIssues = seatingIssues([over], [guest(1, 'Ada', 2, [], { rsvp_guests: 1 })]);
    check('a party holding more chairs than it answered for is flagged',
        overIssues.some(i => i.kind === 'rsvp-mismatch'), JSON.stringify(overIssues.map(i => i.kind)));
    check('that line says both numbers',
        overIssues.find(i => i.kind === 'rsvp-mismatch')!.label.includes('answered for 1')
        && overIssues.find(i => i.kind === 'rsvp-mismatch')!.label.includes('2 chairs'));
    check('that line points at the chairs to free',
        overIssues.find(i => i.kind === 'rsvp-mismatch')!.seats.length === 2);

    const under = table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1), seat(1, 'Bea', 1), seat(2, 'Cy', 1)]);
    const underIssue = seatingIssues([under], [guest(1, 'Ada', 4, [], { rsvp_guests: 4 })])
        .find(i => i.kind === 'rsvp-mismatch')!;
    check('a party short a chair is flagged too', underIssue !== undefined);
    check('and reads as short, not spare', underIssue.label.includes('only 3 chairs'), underIssue.label);

    check('a party seated for exactly what it answered is not flagged',
        seatingIssues([over], [guest(1, 'Ada', 4, [], { rsvp_guests: 2 })])
            .every(i => i.kind !== 'rsvp-mismatch'));

    // One household, one line: a party that declined but is still seated is
    // already `declined-seated`, and a party with no chairs at all is
    // `unseated-guest`.
    const declinedSeated = seatingIssues(
        [table(1, 'Table 1', 8, [seat(0, 'Ada', 1, 1, 'declined')])],
        [guest(1, 'Ada', 1, [], { rsvp_status: 'declined' })],
    );
    check('a seated party that declined is one line, not two',
        declinedSeated.filter(i => i.kind === 'rsvp-mismatch').length === 0
        && declinedSeated.some(i => i.kind === 'declined-seated'));
    const noChairs = seatingIssues([table(1, 'Table 1', 8, [])], [guest(1, 'Ada', 2, [], { rsvp_guests: 2 })]);
    check('a party with no chairs is unseated, not a mismatch',
        noChairs.some(i => i.kind === 'unseated-guest')
        && noChairs.every(i => i.kind !== 'rsvp-mismatch'));

    const offList = seatingIssues([table(1, 'Table 1', 8, [])], [], [
        { guest_name: 'Greg', number_of_guests: 2 },
        { guest_name: 'Olive', number_of_guests: 1 },
    ]).find(i => i.kind === 'rsvp-off-list')!;
    check('RSVPs matching no household are flagged', offList !== undefined);
    check('that line counts the people, not the forms',
        offList.label.includes('3 people'), offList.label);
    check('and names them', offList.label.includes('Greg') && offList.label.includes('Olive'));
    check('no off-list RSVPs, no line',
        seatingIssues([table(1, 'Table 1', 8, [])], []).every(i => i.kind !== 'rsvp-off-list'));
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
