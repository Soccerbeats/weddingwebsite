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
    planRenameSeats, renamesBetween, staleSeatNames,
} from '../src/lib/seating';
import {
    DEFAULT_EXPORT_OPTIONS, alphabetical, csvHeaders, csvRows, dietCodes, dietNote,
    exportFilename, freeSeats, surname, tally, tallyParts,
    type ExportOptions, type ExportPerson, type SeatingExportData,
} from '../src/lib/seatingExport';
import {
    alignEntries, entriesToStore, isEmptyEntry, isOn, setNote, signature, toggleRestriction,
} from '../src/lib/dietary';

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

    // A plus-one is written with a note saying who they are — the guest list has
    // always done it. The chart seated the whole string, so it disagreed with the
    // guest list about the person's name, and nothing matching on that name (the
    // export's dietary lookup, for one) could find them.
    const noted = guest(9, 'Lauren Stanfield', 2, [{ name: 'Steve Reesman', attending: true }], {
        plus_one_name: "Steve Reesman (Lauren's Boyfriend)",
    });
    check('a plus-one is seated under their name, not the note about them',
        partyAttendees(noted).map(p => p.name).join(', ') === 'Lauren Stanfield, Steve Reesman',
        partyAttendees(noted).map(p => p.name).join(', '));
    check('the note does not make them a second person',
        partyAttendees(noted).length === 2);

    // And the answer that lives on the member entry has to survive the match, or
    // the note is enough to seat someone who said no.
    const notedDeclined = guest(10, 'Lauren Stanfield', 2, [{ name: 'Steve Reesman', attending: false }], {
        plus_one_name: "Steve Reesman (Lauren's Boyfriend)",
    });
    check('a noted plus-one who declined takes no chair',
        partyAttendees(notedDeclined).map(p => p.name).join(', ') === 'Lauren Stanfield',
        partyAttendees(notedDeclined).map(p => p.name).join(', '));

    // Where the note *is* the whole entry there is no name to recover, so it is
    // an unnamed slot like any other — not a person called "(Collin's Date)".
    const onlyNote = guest(11, 'Collin Woldt', 2, [], { plus_one_name: "(Collin's Date)" });
    check('a plus-one that is only a note is an unnamed slot',
        partyAttendees(onlyNote).map(p => p.name).join(', ') === "Collin Woldt, Collin's guest 1",
        partyAttendees(onlyNote).map(p => p.name).join(', '));

    // The guest editor writes `party_members` and has no plus-one field — that
    // name only ever arrives by CSV import. So a named member has to beat the
    // plus-one, or renaming someone in the only editor there is changes nothing
    // the chart can see.
    const renamedMember = guest(13, 'Robert Lucas', 2, [{ name: 'Jessica Bigari', attending: true }], {
        plus_one_name: 'Jessica',
    });
    check('a named party member beats a stale plus-one',
        partyAttendees(renamedMember).map(p => p.name).join(', ') === 'Robert Lucas, Jessica Bigari',
        partyAttendees(renamedMember).map(p => p.name).join(', '));

    const stillPlusOne = guest(14, 'Alan Turing', 2, [{ name: null, attending: null }], { plus_one_name: 'Joan Clarke' });
    check('the plus-one still fills a slot nobody has been named for',
        partyAttendees(stillPlusOne).map(p => p.name).join(', ') === 'Alan Turing, Joan Clarke',
        partyAttendees(stillPlusOne).map(p => p.name).join(', '));

    const unnamedDeclined = guest(15, 'Alan Turing', 2, [{ name: null, attending: false }], { plus_one_name: 'Joan Clarke' });
    check('an unnamed slot marked not coming takes no chair, plus-one or not',
        partyAttendees(unnamedDeclined).length === 1,
        partyAttendees(unnamedDeclined).map(p => p.name).join(', '));

    const laterSlot = guest(16, 'Mabel Grey', 3, [{ name: null }, { name: 'Bea Frost' }], { plus_one_name: 'Ann Frost' });
    check('a plus-one never reaches past the first slot',
        partyAttendees(laterSlot).map(p => p.name).join(', ') === 'Mabel Grey, Ann Frost, Bea Frost',
        partyAttendees(laterSlot).map(p => p.name).join(', '));

    const notedMember = guest(12, 'Zack Novak', 2, [{ name: 'Natalie Williams (Zack\'s Girlfriend)', attending: true }]);
    check('a note on a party member is taken off too',
        partyAttendees(notedMember).map(p => p.name).join(', ') === 'Zack Novak, Natalie Williams',
        partyAttendees(notedMember).map(p => p.name).join(', '));
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
        [table(1, 'Table 1', 8, [seat(0, 'Ada Byron', 1, 1)])],
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

/* ---- the export ---- */

console.log('\nExporting the chart');
{
    const person = (
        name: string,
        diet: ExportPerson['diet'] = [],
        extra: Partial<ExportPerson> = {},
    ): ExportPerson => ({
        name,
        seat: 1,
        table_name: 'Table 1',
        household: name,
        side: null,
        rsvp_status: 'attending',
        diet,
        note: '',
        ...extra,
    });

    /* dietary answers → codes */
    check('an empty answer carries no codes', dietCodes(null).length === 0);
    check('every checkbox maps to its code',
        dietCodes({ vegetarian: true, vegan: true, gluten_free: true, nut_allergy: true, other: true })
            .join(',') === 'VEG,VGN,GF,NUT,OTH');
    check('free text counts as "other" even without the checkbox',
        dietCodes({ other_text: 'No shellfish' }).join(',') === 'OTH');
    check('the pre-JSONB `note` field is read too',
        dietCodes({ note: 'No shellfish' }).join(',') === 'OTH'
        && dietNote({ note: ' No shellfish ' }) === 'No shellfish');
    check('an empty "other" text is not a restriction', dietCodes({ other_text: '   ' }).length === 0);

    /* counting */
    const table1 = [
        person('Ada', ['VEG']),
        person('Bo', ['VEG', 'GF']),
        person('Cy'),
        person('Di', ['NUT']),
        person('Ed'),
    ];
    const t = tally(table1);
    check('restrictions are counted per person', t.VEG === 2 && t.GF === 1 && t.NUT === 1);
    check('someone with two restrictions is counted in both', t.VEG + t.GF >= 3);
    check('people who reported nothing are counted apart', t.none === 2);
    check('the total is the headcount, not the restriction count', t.total === 5);

    const parts = tallyParts(t, 8);
    check('the tally leads with seats of capacity', parts[0] === '5 seated of 8', parts[0]);
    check('a restriction nobody has is left out', parts.every(p => !p.startsWith('0 ')), parts.join(' · '));
    check('the tally ends with the people who reported nothing',
        parts[parts.length - 1] === '2 no restrictions', parts[parts.length - 1]);
    check('with no capacity it just says seated',
        tallyParts(tally(table1))[0] === '5 seated');
    check('an empty table still reads as zero',
        tallyParts(tally([]), 10)[0] === '0 seated of 10');

    /* free chairs */
    const exTable = (seat_count: number, people: ExportPerson[]) => ({
        id: 1, name: 'Table 1', table_type: 'round', seat_count, people,
    });
    check('free chairs are capacity less the people', freeSeats(exTable(8, table1)) === 3);
    check('an over-full table reports no free chairs, never a negative',
        freeSeats(exTable(3, table1)) === 0);

    /* sorting */
    check('a name sorts under its surname', surname('Nora Whitfield') === 'Whitfield');
    check('a suffix is not the surname', surname('Nick Lucas Jr.') === 'Lucas');
    check('a parenthetical note is not the surname',
        surname("Natalie Williams (Zack's Girlfriend)") === 'Williams');
    check('a one-word name sorts under itself', surname('Cher') === 'Cher');
    check('an unnamed companion still sorts', surname("Anna's guest 1") === '1');

    const data: SeatingExportData = {
        title: 'Nora & Elliot',
        date: null,
        venue: null,
        tables: [
            exTable(8, [person('Bo Zeller'), person('Ada Marsh', ['VGN'])]),
            { id: 2, name: 'Table 2', table_type: 'round', seat_count: 4, people: [person('Cy Abbott', [], { table_name: 'Table 2', seat: 1 })] },
        ],
        unseated: [person('Di Nolan', ['GF'], { seat: null, table_name: null })],
    };

    const az = alphabetical(data, true);
    check('the A–Z list is sorted by surname',
        az.map(p => p.name).join(', ') === 'Cy Abbott, Ada Marsh, Di Nolan, Bo Zeller',
        az.map(p => p.name).join(', '));
    check('leaving out the unseated leaves them out of the list',
        alphabetical(data, false).every(p => p.name !== 'Di Nolan'));

    /* the spreadsheet */
    const opts: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, format: 'csv' };
    const rows = csvRows(data, opts);
    check('the spreadsheet is one row per person, not per party', rows.length === 4, String(rows.length));
    check('every row has a cell for every column',
        rows.every(r => r.length === csvHeaders(opts).length));
    check('each restriction is its own yes/blank column, for pivoting',
        csvHeaders(opts).includes('Vegan')
        && rows.find(r => r[2] === 'Ada Marsh')?.[csvHeaders(opts).indexOf('Vegan')] === 'yes');
    check('someone with no restriction leaves those columns blank',
        rows.find(r => r[2] === 'Bo Zeller')?.[csvHeaders(opts).indexOf('Vegan')] === '');
    check('an unseated person says so rather than claiming a table',
        rows.find(r => r[2] === 'Di Nolan')?.[0] === 'Not seated');
    check('turning the unseated off drops their rows',
        csvRows(data, { ...opts, unseated: false }).length === 3);
    check('household and side are columns only when asked for',
        !csvHeaders(opts).includes('Household')
        && csvHeaders({ ...opts, household: true, side: true }).includes('Side'));

    check('the filename carries the date, so a folder of them sorts',
        exportFilename('csv', new Date(2026, 8, 19)) === 'seating-chart-2026-09-19.csv',
        exportFilename('csv', new Date(2026, 8, 19)));
    check('a single-digit month and day are padded',
        exportFilename('pdf', new Date(2027, 0, 5)) === 'seating-chart-2027-01-05.pdf');
}

/* ---- recording what people cannot eat ---- */

console.log('\nRecording restrictions');
{
    /* toggling */
    const off = {};
    check('an empty answer has nothing on', isEmptyEntry(off) && !isOn(off, 'GF'));
    const gf = toggleRestriction(off, 'GF');
    check('toggling sets one restriction', isOn(gf, 'GF') && !isOn(gf, 'VEG'));
    check('toggling again clears it', !isOn(toggleRestriction(gf, 'GF'), 'GF'));
    check('the original answer is not mutated', isEmptyEntry(off));

    const noted = setNote(toggleRestriction(off, 'OTH'), 'No shellfish');
    check('a note turns "other" on and is kept', isOn(noted, 'OTH') && noted.other_text === 'No shellfish');
    check('turning "other" off clears the note with it',
        !isOn(toggleRestriction(noted, 'OTH'), 'OTH'),
        JSON.stringify(toggleRestriction(noted, 'OTH')));

    /* lining answers up with the people */
    const stored = [
        { name: 'Lauren Stanfield', vegetarian: true },
        { name: "Steve Reesman (Lauren's Boyfriend)", gluten_free: true },
        { name: 'Someone Renamed', nut_allergy: true },
    ];
    const aligned = alignEntries(['Lauren Stanfield', 'Steve Reesman'], stored);
    check('there is a row per person, in order',
        aligned[0].name === 'Lauren Stanfield' && aligned[1].name === 'Steve Reesman');
    check('an answer filed under a noted name still finds its person',
        isOn(aligned[1], 'GF'), JSON.stringify(aligned[1]));
    check('an answer matching nobody is kept, not silently dropped',
        aligned.length === 3 && isOn(aligned[2], 'NUT'), String(aligned.length));
    const blank = alignEntries(['Ada', 'Bo'], null);
    check('a household with no answers still gets a row each',
        blank.length === 2 && blank.every(isEmptyEntry));

    /* what gets stored back */
    const rows = [
        { entry: { vegetarian: true }, name: 'Lauren Stanfield', attending: null },
        { entry: { gluten_free: true }, name: "Steve Reesman (Lauren's Boyfriend)", attending: true },
        { entry: { vegan: true }, name: 'Declined Person', attending: false },
        { entry: { nut_allergy: true }, name: '   ', attending: null },
    ];
    const toStore = entriesToStore(rows);
    check('only the people who are coming are stored', toStore.length === 2, String(toStore.length));
    check('someone who declined is left out', toStore.every(e => e.name !== 'Declined Person'));
    check('an unnamed slot is left out — nothing could match it later',
        toStore.every(e => (e.name ?? '').trim() !== ''));
    check('names are stored without their note',
        toStore[1].name === 'Steve Reesman', String(toStore[1].name));
    check('every restriction is written explicitly, not left undefined',
        toStore.every(e => typeof e.vegan === 'boolean' && typeof e.other === 'boolean'));
    check('"other" text is dropped when "other" is off', toStore.every(e => e.other_text === ''));

    /* has anything actually changed? */
    check('the same answers written two ways compare equal',
        signature([{ name: 'Ada', gluten_free: true }])
        === signature([{ name: 'ada ', gluten_free: true, vegan: false, other_text: '' }]));
    check('order does not count as a change',
        signature([{ name: 'Ada', vegan: true }, { name: 'Bo', gluten_free: true }])
        === signature([{ name: 'Bo', gluten_free: true }, { name: 'Ada', vegan: true }]));
    check('an empty answer is not a change',
        signature([{ name: 'Ada' }, { name: 'Bo', vegan: true }]) === signature([{ name: 'Bo', vegan: true }]));
    check('a different restriction is a change',
        signature([{ name: 'Ada', vegan: true }]) !== signature([{ name: 'Ada', gluten_free: true }]));
    check('a changed note is a change',
        signature([{ name: 'Ada', other: true, other_text: 'No shellfish' }])
        !== signature([{ name: 'Ada', other: true, other_text: 'No pork' }]));
}

/* ---- a name changed in the guest list ---- */

console.log('\nCarrying a rename');
{
    /* what one edit changed */
    const before = { guest_name: 'Robert Lucas', plus_one_name: 'Jessica', party_members: [{ name: 'Jessica' }] };
    const after = { guest_name: 'Robert Lucas', plus_one_name: 'Jessica', party_members: [{ name: 'Jessica Bigari' }] };
    const renames = renamesBetween(before, after);
    check('a renamed party member is one rename',
        renames.length === 1 && renames[0].from === 'Jessica' && renames[0].to === 'Jessica Bigari',
        JSON.stringify(renames));
    check('nothing changed, nothing to carry', renamesBetween(before, before).length === 0);
    check('a name that only gained a note is not a rename',
        renamesBetween(
            { guest_name: 'Steve Reesman' },
            { guest_name: "Steve Reesman (Lauren's Boyfriend)" },
        ).length === 0);
    check('a name appearing is not a rename',
        renamesBetween({ party_members: [{ name: null }] }, { party_members: [{ name: 'Jessica' }] }).length === 0);
    check('a name being cleared is not a rename',
        renamesBetween({ party_members: [{ name: 'Jessica' }] }, { party_members: [{ name: '' }] }).length === 0);
    check('the household itself can be renamed',
        renamesBetween({ guest_name: 'Rob Lucas' }, { guest_name: 'Robert Lucas' })[0]?.to === 'Robert Lucas');
    check('members are matched by row, not by guesswork',
        renamesBetween(
            { party_members: [{ name: 'Ada' }, { name: 'Bo' }] },
            { party_members: [{ name: 'Ada Byron' }, { name: 'Bo Zeller' }] },
        ).length === 2);

    /* drift that arrived some other way */
    const drifted = table(1, 'Table 1', 8, [
        seat(0, 'Robert Lucas', 10, 10),
        seat(1, 'Jessica', 10),
    ]);
    const household = guest(10, 'Robert Lucas', 2, [{ name: 'Jessica Bigari', attending: true }]);
    const stale = staleSeatNames([drifted], [household]);
    check('a seat the guest list no longer agrees with is found',
        stale.length === 1 && stale[0].from === 'Jessica' && stale[0].to === 'Jessica Bigari',
        JSON.stringify(stale));
    check('the seat that is already right is left alone',
        stale.every(r => r.from !== 'Robert Lucas'));
    check('a chart that agrees with the guest list reports nothing',
        staleSeatNames([table(1, 'Table 1', 8, [
            seat(0, 'Robert Lucas', 10, 10),
            seat(1, 'Jessica Bigari', 10),
        ])], [household]).length === 0);
    check('a note on the seat is not a disagreement',
        staleSeatNames([table(1, 'Table 1', 8, [
            seat(0, 'Robert Lucas', 10, 10),
            seat(1, "Jessica Bigari (Rob's Girlfriend)", 10),
        ])], [household]).length === 0);

    // Two unnamed slots and two new names could pair up either way round, and
    // putting the wrong name on a chair is worse than leaving it alone.
    const ambiguous = staleSeatNames(
        [table(1, 'Table 1', 8, [
            seat(0, 'Mabel Grey', 11, 11),
            seat(1, "Mabel's guest 1", 11),
            seat(2, "Mabel's guest 2", 11),
        ])],
        [guest(11, 'Mabel Grey', 3, [{ name: 'Ann Frost' }, { name: 'Bea Frost' }])],
    );
    check('ambiguous drift is left alone rather than guessed at',
        ambiguous.length === 2, JSON.stringify(ambiguous));

    /* and the fix */
    const change = planRenameSeats(stale, [drifted]);
    check('the fix re-labels the chair without moving anyone',
        change.deletes.length === 0 && change.seats.length === 1
        && change.seats[0].seat_index === 1 && change.seats[0].display_name === 'Jessica Bigari',
        JSON.stringify(change));
    check('it keeps the seat filed under its party',
        change.seats[0].party_group_id === 10 && change.seats[0].guest_list_id === null);

    const issue = seatingIssues([drifted], [household]).find(i => i.kind === 'stale-name');
    check('the chart says so', issue !== undefined);
    check('and names both spellings',
        !!issue && issue.label.includes('Jessica') && issue.label.includes('Jessica Bigari'), issue?.label);
    check('and points at the chair to fix', issue?.seats.length === 1);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
