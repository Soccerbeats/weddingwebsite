/**
 * Verifies the schedule's pure logic — which events a guest may see, and what
 * order the run-of-show ends up in.
 *
 *   npm run check:schedule
 *
 * No database and no browser. The public predicate is the load-bearing one: the
 * admin schedule now holds the whole day, including things no guest should read,
 * and one wrong answer here publishes a vendor's phone time or blanks a live
 * schedule.
 */
import {
    blankEvent, formatEventTime, isPublicEvent, normalizeEventTime, parseEventTime,
    publicScheduleEvents, SCHEDULE_HEADERS, scheduleRows, sortByTime, type ScheduleEvent,
} from '../src/lib/schedule';
import { toCsv } from '../src/lib/mailing';
import {
    clampWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, mergeWidths, parseWidths, widthAfterDrag,
} from '../src/lib/columnWidths';

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

function ev(title: string, time = '', isPublic?: boolean): ScheduleEvent {
    return { time, title, description: '', location: '', ...(isPublic === undefined ? {} : { public: isPublic }) };
}

/* ---- who may see it ---- */
{
    console.log('\nwhat a guest may see');

    // The trap this exists to catch: every event written before the Public tick
    // existed has no `public` key at all, and reading that as "private" would
    // empty a live schedule page the moment this shipped.
    check('an event with no flag is public', isPublicEvent(ev('Ceremony')));
    check('an event ticked public is public', isPublicEvent(ev('Ceremony', '', true)));
    check('an event unticked is not', !isPublicEvent(ev('Vendor load-in', '', false)));
    check('undefined is not the same as false', isPublicEvent({ public: undefined }));

    const day = [
        ev('Hair and makeup', '8:00 AM', false),
        ev('Ceremony', '4:00 PM'),
        ev('Photos', '4:30 PM', true),
        ev('Vendor breakdown', '11:30 PM', false),
    ];
    const shown = publicScheduleEvents(day);
    check('only the public rows reach the page', shown.length === 2, `${shown.length}`);
    check('and in the order they were put in',
        shown[0].title === 'Ceremony' && shown[1].title === 'Photos',
        shown.map(e => e.title).join(', '));
    check('nothing configured is not a crash', publicScheduleEvents(undefined).length === 0);
    check('a day with nothing public shows nothing',
        publicScheduleEvents([ev('Setup', '6:00 AM', false)]).length === 0);
    // Private until ticked: most of a run-of-show is not for guests, and the
    // safe default on a page that publishes is the one where forgetting to think
    // about it shows nobody anything.
    check('a new row starts private', !isPublicEvent(blankEvent()));
    check('and says so explicitly rather than leaving the flag off',
        blankEvent().public === false);
    check('which does not disturb the rule that an absent flag is public',
        isPublicEvent({ public: undefined }));

    // What the public page actually renders: filtered, then put in clock order.
    const timeline = sortByTime(publicScheduleEvents([
        ev('Reception', '6:00 PM'), ev('Vendor load-in', '7:00 AM', false), ev('Ceremony', '4pm'),
    ]));
    check('the public timeline is the public rows, in clock order',
        timeline.map(e => e.title).join(',') === 'Ceremony,Reception', timeline.map(e => e.title).join(','));
}

/* ---- reading a time off the page ---- */
{
    console.log('\nreading the time');

    check('4:00 PM', parseEventTime('4:00 PM') === 16 * 60);
    check('4:00 pm, lower case', parseEventTime('4:00 pm') === 16 * 60);
    check('4pm with no minutes', parseEventTime('4pm') === 16 * 60);
    check('9:30 AM', parseEventTime('9:30 AM') === 9 * 60 + 30);
    check('9.30am, written with a dot', parseEventTime('9.30am') === 9 * 60 + 30);
    check('p.m. with the stops in', parseEventTime('4:00 p.m.') === 16 * 60);
    check('16:00 on a 24-hour clock', parseEventTime('16:00') === 16 * 60);
    check('00:30 is half past midnight', parseEventTime('00:30') === 30);
    check('12:00 AM is midnight, not noon', parseEventTime('12:00 AM') === 0);
    check('12:00 PM is noon, not midnight', parseEventTime('12:00 PM') === 12 * 60);
    check('noon', parseEventTime('noon') === 12 * 60);
    check('midnight', parseEventTime('midnight') === 0);
    check('surrounding spaces do not matter', parseEventTime('  4:00 PM  ') === 16 * 60);

    // No colon, because nobody reaches for it on a number pad. The old parser
    // matched a prefix, so `1230` read as twelve o'clock and the minutes were
    // dropped without a word.
    check('1230 is half past twelve', parseEventTime('1230') === 12 * 60 + 30);
    check('830 is half past eight', parseEventTime('830') === 8 * 60 + 30);
    check('0800 is eight', parseEventTime('0800') === 8 * 60);
    check('1600 is four in the afternoon', parseEventTime('1600') === 16 * 60);
    check('1230pm is half past noon', parseEventTime('1230pm') === 12 * 60 + 30);
    check('830 am is half past eight', parseEventTime('830 am') === 8 * 60 + 30);
    check('0015 is a quarter past midnight', parseEventTime('0015') === 15);
    check('two digits are still an hour, not minutes', parseEventTime('12') === 12 * 60);
    check('one digit is still an hour', parseEventTime('8') === 8 * 60);
    check('2430 is unknown', parseEventTime('2430') === null);
    check('1275 is unknown', parseEventTime('1275') === null);
    check('999 is unknown', parseEventTime('999') === null);
    check('12345 is unknown', parseEventTime('12345') === null);

    // Anything it cannot read must say so rather than guess — a guess is a row
    // that silently moves somewhere nobody asked for.
    check('an empty time is unknown', parseEventTime('') === null);
    check('"after the toasts" is unknown', parseEventTime('after the toasts') === null);
    check('"TBD" is unknown', parseEventTime('TBD') === null);
    check('25:00 is unknown', parseEventTime('25:00') === null);
    check('13:00 PM is unknown', parseEventTime('13:00 PM') === null);
    check('4:75 is unknown', parseEventTime('4:75') === null);
    // Anchored at the end: a prefix that happens to look like a time is not one.
    check('"4:00 PM sharp" is unknown', parseEventTime('4:00 PM sharp') === null);
    check('"12 people" is unknown', parseEventTime('12 people') === null);
}

/* ---- tidying what was typed ---- */
{
    console.log('\ntidying the time');

    // The whole point: nobody types "8:00 AM" when "8am" will do, and the
    // timeline should not then show three notations for one day.
    check('8am becomes 8:00 AM', normalizeEventTime('8am') === '8:00 AM', normalizeEventTime('8am'));
    check('8 AM becomes 8:00 AM', normalizeEventTime('8 AM') === '8:00 AM');
    check('4pm becomes 4:00 PM', normalizeEventTime('4pm') === '4:00 PM');
    check('16:00 becomes 4:00 PM', normalizeEventTime('16:00') === '4:00 PM', normalizeEventTime('16:00'));
    check('9.30am becomes 9:30 AM', normalizeEventTime('9.30am') === '9:30 AM');
    check('1230 becomes 12:30 PM', normalizeEventTime('1230') === '12:30 PM', normalizeEventTime('1230'));
    check('830 becomes 8:30 AM', normalizeEventTime('830') === '8:30 AM');
    check('0800 becomes 8:00 AM', normalizeEventTime('0800') === '8:00 AM');
    check('4:00 p.m. becomes 4:00 PM', normalizeEventTime('4:00 p.m.') === '4:00 PM');
    check('noon becomes 12:00 PM', normalizeEventTime('noon') === '12:00 PM');
    check('midnight becomes 12:00 AM', normalizeEventTime('midnight') === '12:00 AM');
    check('00:30 becomes 12:30 AM', normalizeEventTime('00:30') === '12:30 AM');
    check('already tidy is left alone', normalizeEventTime('4:00 PM') === '4:00 PM');
    check('tidying twice changes nothing', normalizeEventTime(normalizeEventTime('8am')) === '8:00 AM');

    // A row can legitimately say when it happens in words. Rewriting that would
    // be worse than leaving it.
    check('"after the toasts" is left as written', normalizeEventTime('after the toasts') === 'after the toasts');
    check('"TBD" is left as written', normalizeEventTime('TBD') === 'TBD');
    check('an empty time stays empty', normalizeEventTime('') === '');
    check('only the surrounding spaces go', normalizeEventTime('  TBD  ') === 'TBD');

    check('formatting the top of the hour', formatEventTime(8 * 60) === '8:00 AM');
    check('formatting noon', formatEventTime(12 * 60) === '12:00 PM');
    check('formatting midnight', formatEventTime(0) === '12:00 AM');
    check('formatting pads the minutes', formatEventTime(9 * 60 + 5) === '9:05 AM');
}

/* ---- the order is the times ---- */
{
    console.log('\nthe order is the times');

    const out = sortByTime([ev('Reception', '6:00 PM'), ev('Hair', '8:00 AM'), ev('Ceremony', '4:00 PM')]);
    check('rows land in clock order', out.map(e => e.title).join(',') === 'Hair,Ceremony,Reception',
        out.map(e => e.title).join(','));

    check('AM and PM are not sorted as text',
        sortByTime([ev('a', '9:00 PM'), ev('b', '10:00 AM')]).map(e => e.title).join(',') === 'b,a');

    check('a 24-hour time sorts against a 12-hour one',
        sortByTime([ev('late', '18:00'), ev('early', '9am')]).map(e => e.title).join(',') === 'early,late');

    // There is no hand-ordering left to preserve, so a row with no readable time
    // has nowhere to be but the end — which is also where a blank new row wants
    // to sit until it is given a time.
    const mixed = sortByTime([
        ev('Whenever', 'after the toasts'), ev('Late', '9:00 PM'), ev('Blank', ''), ev('Early', '9:00 AM'),
    ]);
    check('rows with no readable time go to the end',
        mixed.map(e => e.title).join(',') === 'Early,Late,Whenever,Blank', mixed.map(e => e.title).join(','));
    check('and keep the order they were in among themselves',
        mixed[2].title === 'Whenever' && mixed[3].title === 'Blank');
    check('a new blank row sorts to the bottom',
        sortByTime([ev('Ceremony', '4pm'), blankEvent()])[1].title === '');
    check('a bare-digit time sorts against a written one',
        sortByTime([ev('late', '1630'), ev('early', '830')]).map(e => e.title).join(',') === 'early,late');

    check('equal times keep the order they were in',
        sortByTime([ev('first', '4:00 PM'), ev('second', '4:00 PM')]).map(e => e.title).join(',') === 'first,second');
    check('sorting an already sorted day changes nothing',
        sortByTime(sortByTime(out)).map(e => e.title).join(',') === out.map(e => e.title).join(','));

    check('sorting keeps every row', sortByTime([ev('a', '2pm'), ev('b'), ev('c', '1pm')]).length === 3);
    check('sorting an empty day is an empty day', sortByTime([]).length === 0);
    check('sorting does not disturb the public flags',
        sortByTime([ev('b', '5pm', false), ev('a', '4pm', true)]).map(e => String(e.public)).join(',') === 'true,false');
}

/* ---- the spreadsheet ---- */
{
    console.log('\nexporting');

    const day: ScheduleEvent[] = [
        { time: '8:00 AM', title: 'Hair and makeup', location: 'Suite 12', description: 'Both trailers', public: false },
        { time: '4:00 PM', title: 'Ceremony', location: 'Garden', description: '', public: true },
        { time: '6:00 PM', title: 'Reception', location: 'Ballroom', description: '' },
    ];
    const rows = scheduleRows(day);

    check('a column for every header', rows.every(r => r.length === SCHEDULE_HEADERS.length));
    check('every row is exported, private ones included', rows.length === 3);
    check('the order shown is the order exported',
        rows.map(r => r[1]).join(',') === 'Hair and makeup,Ceremony,Reception');
    check('the columns are in header order',
        rows[0].slice(0, 4).join('|') === '8:00 AM|Hair and makeup|Suite 12|Both trailers', rows[0].join('|'));
    check('a private row says No', rows[0][4] === 'No');
    check('a public row says Yes', rows[1][4] === 'Yes');
    check('a row with no flag says Yes', rows[2][4] === 'Yes');
    check('a missing field is an empty cell, not "undefined"',
        scheduleRows([{ time: '', title: 'x' } as ScheduleEvent])[0].join('|') === '|x|||Yes');
    check('an empty day exports no rows', scheduleRows([]).length === 0);

    // The header row has to survive the trip into a spreadsheet.
    const csv = toCsv([...SCHEDULE_HEADERS], rows);
    check('the file starts with the headers',
        csv.includes('"Time","Event","Location","Description","Public"'), csv.slice(0, 80));
    check('a private row is in the file', csv.includes('"Hair and makeup"'));
    check('rows are CRLF separated for Excel', csv.includes('\r\n'));
}

/* ---- remembered column widths ---- */
{
    console.log('\ncolumn widths');

    // Lives with the schedule because the schedule table is its only caller.
    const cols = { public: 84, time: 132, title: 224 };

    check('a drag right widens', widthAfterDrag(200, 60) === 260);
    check('a drag left narrows', widthAfterDrag(200, -60) === 140);
    check('a column cannot be dragged away to nothing',
        widthAfterDrag(80, -500) === MIN_COLUMN_WIDTH);
    check('nor dragged wider than the screen', widthAfterDrag(800, 5000) === MAX_COLUMN_WIDTH);
    check('a fractional drag lands on a whole pixel', Number.isInteger(widthAfterDrag(200, 12.4)));
    check('nonsense clamps rather than propagating', clampWidth(Number.NaN) === MIN_COLUMN_WIDTH);

    check('nothing stored means the defaults',
        JSON.stringify(mergeWidths(cols, null)) === JSON.stringify(cols));
    check('a stored width wins over the default', mergeWidths(cols, { time: 300 }).time === 300);
    check('columns not stored keep their default', mergeWidths(cols, { time: 300 }).public === 84);

    // Storage holds whatever was there last — an older version of this page, or
    // a hand-edited value. None of it may produce a column nobody can see.
    check('a column the table no longer has is dropped',
        !('gone' in mergeWidths(cols, { gone: 200 })));
    check('a stored width is clamped like a dragged one',
        mergeWidths(cols, { time: 5 }).time === MIN_COLUMN_WIDTH);
    check('a stored width that is not a number is ignored',
        mergeWidths(cols, { time: 'wide' }).time === 132);
    check('a negative stored width is ignored', mergeWidths(cols, { time: -50 }).time === 132);
    check('a numeric string still works', mergeWidths(cols, { time: '300' }).time === 300);
    check('an array is not a width set',
        JSON.stringify(mergeWidths(cols, [1, 2])) === JSON.stringify(cols));
    check('a string is not a width set',
        JSON.stringify(mergeWidths(cols, 'nope')) === JSON.stringify(cols));

    check('unreadable storage answers null rather than throwing', parseWidths('{oops') === null);
    check('empty storage answers null', parseWidths(null) === null);
    check('a stored set round-trips',
        (parseWidths(JSON.stringify({ time: 300 })) as Record<string, number>).time === 300);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
