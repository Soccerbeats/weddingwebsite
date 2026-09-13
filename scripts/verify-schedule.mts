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
    blankEvent, isPublicEvent, moveEvent, parseEventTime, publicScheduleEvents, sortByTime,
    type ScheduleEvent,
} from '../src/lib/schedule';

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
    check('a new row starts public', isPublicEvent(blankEvent()));
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

    // Anything it cannot read must say so rather than guess — a guess is a row
    // that silently moves somewhere nobody asked for.
    check('an empty time is unknown', parseEventTime('') === null);
    check('"after the toasts" is unknown', parseEventTime('after the toasts') === null);
    check('"TBD" is unknown', parseEventTime('TBD') === null);
    check('25:00 is unknown', parseEventTime('25:00') === null);
    check('13:00 PM is unknown', parseEventTime('13:00 PM') === null);
    check('4:75 is unknown', parseEventTime('4:75') === null);
}

/* ---- putting the day in order ---- */
{
    console.log('\nsorting the run of the day');

    const out = sortByTime([ev('Reception', '6:00 PM'), ev('Hair', '8:00 AM'), ev('Ceremony', '4:00 PM')]);
    check('rows land in clock order', out.map(e => e.title).join(',') === 'Hair,Ceremony,Reception',
        out.map(e => e.title).join(','));

    check('AM and PM are not sorted as text',
        sortByTime([ev('a', '9:00 PM'), ev('b', '10:00 AM')]).map(e => e.title).join(',') === 'b,a');

    // A row whose time nobody can parse is a row the user placed by hand. It
    // keeps its index; the rows around it sort among themselves.
    const mixed = sortByTime([
        ev('Late', '9:00 PM'), ev('Whenever', 'after the toasts'), ev('Early', '9:00 AM'),
    ]);
    check('an unreadable time keeps its place',
        mixed.map(e => e.title).join(',') === 'Early,Whenever,Late', mixed.map(e => e.title).join(','));

    check('equal times keep the order they were in',
        sortByTime([ev('first', '4:00 PM'), ev('second', '4:00 PM')]).map(e => e.title).join(',') === 'first,second');

    check('sorting keeps every row', sortByTime([ev('a', '2pm'), ev('b'), ev('c', '1pm')]).length === 3);
    check('sorting an empty day is an empty day', sortByTime([]).length === 0);
    check('sorting does not disturb the public flags',
        sortByTime([ev('b', '5pm', false), ev('a', '4pm', true)]).map(e => String(e.public)).join(',') === 'true,false');
}

/* ---- moving a row by hand ---- */
{
    console.log('\nmoving a row');

    const rows = [ev('a'), ev('b'), ev('c')];
    check('up', moveEvent(rows, 2, 1).map(e => e.title).join(',') === 'a,c,b');
    check('down', moveEvent(rows, 0, 1).map(e => e.title).join(',') === 'b,a,c');
    check('off the top does nothing', moveEvent(rows, 0, -1).map(e => e.title).join(',') === 'a,b,c');
    check('off the bottom does nothing', moveEvent(rows, 2, 3).map(e => e.title).join(',') === 'a,b,c');
    check('onto itself does nothing', moveEvent(rows, 1, 1).map(e => e.title).join(',') === 'a,b,c');
    check('the original list is not mutated', rows.map(e => e.title).join(',') === 'a,b,c');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
