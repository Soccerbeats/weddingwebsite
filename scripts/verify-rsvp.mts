/**
 * The RSVP's pure logic, with no database or browser:
 *
 *   npm run check:rsvp
 *
 * - the couple's own questions: what a stored question may look like, which are
 *   asked, what counts as an answer, keeping answers the form did not show,
 *   required questions, the tallies the Questions tab draws
 * - the entrée counts the seating export prints from the meal question
 * - folding a typed name, so "Noren" finds "Norén"
 */
import {
    QUESTION_TEMPLATES, askedQuestions, cleanAnswer, cleanAnswers, cleanQuestions, formatAnswer,
    mealQuestion, missingRequired, tallyQuestion, type Respondent, type RsvpQuestion,
} from '../src/lib/rsvpQuestions';
import { mealParts, mealTally, tallyParts, tally, csvHeaders, csvRows, DEFAULT_EXPORT_OPTIONS } from '../src/lib/seatingExport';
import type { SeatingExportData } from '../src/lib/seatingExport';
import { foldName } from '../src/lib/names';

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

const entree: RsvpQuestion = {
    id: 'q_meal', label: 'Which entrée?', type: 'choice', scope: 'person', required: true, meal: true,
    options: [{ id: 'o_fish', label: 'Fish' }, { id: 'o_beef', label: 'Beef' }, { id: 'o_veg', label: 'Risotto' }],
};
const song: RsvpQuestion = { id: 'q_song', label: 'A song?', type: 'text', scope: 'household', required: false, onlyIfAttending: true };
const shuttle: RsvpQuestion = { id: 'q_bus', label: 'Shuttle?', type: 'yes_no', scope: 'person', required: false };
const events: RsvpQuestion = {
    id: 'q_events', label: 'Which events?', type: 'multi', scope: 'person', required: false,
    options: [{ id: 'o_brunch', label: 'Brunch' }, { id: 'o_drinks', label: 'Drinks' }],
};

console.log('\nStoring questions');
{
    const cleaned = cleanQuestions([
        entree, song, shuttle, events,
        { id: 'q_meal', label: 'A duplicate id', type: 'text', scope: 'person' },
        { id: 'bad id!', label: 'Bad id', type: 'text' },
        { id: 'q_x', label: 'Unknown type', type: 'essay' },
        'not an object',
        { ...entree, id: 'q_meal2', label: 'Second meal' },
    ]);
    check('well-formed questions are kept, in order',
        cleaned.map(q => q.id).join() === 'q_meal,q_song,q_bus,q_events,q_meal2', cleaned.map(q => q.id).join());
    check('a duplicate id, a bad id, an unknown type and junk are dropped', cleaned.length === 5);
    check('only one question can be the meal', cleaned.filter(q => q.meal).length === 1 && cleaned[0].meal === true);
    const notMeal = cleanQuestions([{ ...entree, scope: 'household' }, { ...entree, id: 'q2', type: 'multi' }]);
    check('only a per-person single choice can be the meal', notMeal.every(q => !q.meal));
    check('a household question asks only if someone is coming by default',
        cleanQuestions([{ ...song, onlyIfAttending: undefined }])[0].onlyIfAttending === true);
    check('yes/no and text questions carry no options', cleanQuestions([{ ...shuttle, options: [{ id: 'a', label: 'x' }] }])[0].options === undefined);
    const long = cleanQuestions([{ ...song, label: 'x'.repeat(500) }])[0];
    check('labels are capped', long.label.length === 200);
    check('nothing usable is an empty list', cleanQuestions('nope').length === 0 && cleanQuestions(null).length === 0);
}

console.log('\nWhich questions a guest sees');
{
    const qs = [entree, song, shuttle, { ...events, hidden: true }, { ...shuttle, id: 'q_blank', label: '  ' }];
    check('per-person questions, in order', askedQuestions(qs, 'person').map(q => q.id).join() === 'q_meal,q_bus');
    check('a hidden question is not asked', !askedQuestions(qs, 'person').some(q => q.id === 'q_events'));
    check('a question with no wording yet is not asked', !askedQuestions(qs, 'person').some(q => q.id === 'q_blank'));
    check('household questions are their own list', askedQuestions(qs, 'household').map(q => q.id).join() === 'q_song');
    const noOptions = { ...entree, id: 'q_empty', options: [{ id: 'o1', label: '' }] };
    check('a choice with no named option is not asked', askedQuestions([noOptions], 'person').length === 0);
}

console.log('\nWhat counts as an answer');
{
    check('a choice must be one of its options', cleanAnswer(entree, 'o_fish') === 'o_fish' && cleanAnswer(entree, 'o_lamb') === undefined);
    check('yes/no takes a boolean', cleanAnswer(shuttle, false) === false && cleanAnswer(shuttle, 'yes') === undefined);
    const multi = cleanAnswer(events, ['o_brunch', 'o_brunch', 'o_nope', 3]);
    check('pick-any keeps known options once each', JSON.stringify(multi) === '["o_brunch"]', JSON.stringify(multi));
    check('pick-any with nothing picked is no answer', cleanAnswer(events, []) === undefined);
    check('text is trimmed and capped', (cleanAnswer(song, `  ${'a'.repeat(900)} `) as string).length === 500);
    check('blank text is no answer', cleanAnswer(song, '   ') === undefined);

    const qs = [entree, shuttle, { ...events, hidden: true }];
    const kept = cleanAnswers(qs, 'person', { q_meal: 'o_beef', q_unknown: 'x' }, { q_events: ['o_drinks'], q_bus: true });
    check('answers to unknown questions are dropped', !('q_unknown' in kept));
    check('a hidden question keeps the answer already on file', JSON.stringify(kept.q_events) === '["o_drinks"]');
    check('an asked question cleared on the form is cleared', !('q_bus' in kept), JSON.stringify(kept));
    check('household answers are not person answers', Object.keys(cleanAnswers(qs, 'household', { q_meal: 'o_beef' })).length === 0);
}

console.log('\nRequired questions and words');
{
    check('a required question with no answer is missing', missingRequired([entree, shuttle], {}).map(q => q.id).join() === 'q_meal');
    check('…and answered is not', missingRequired([entree], { q_meal: 'o_fish' }).length === 0);
    check('an answer reads as its option', formatAnswer(entree, 'o_fish') === 'Fish');
    check('a removed option says so rather than showing an id', formatAnswer(entree, 'o_gone') === 'a removed option');
    check('yes/no reads Yes / No', formatAnswer(shuttle, true) === 'Yes' && formatAnswer(shuttle, false) === 'No');
    check('pick-any reads as a list', formatAnswer(events, ['o_brunch', 'o_drinks']) === 'Brunch, Drinks');
    check('the meal question is found', mealQuestion([song, entree])?.id === 'q_meal' && mealQuestion([song]) === null);
}

console.log('\nTallies for the Questions tab');
{
    const people: Respondent[] = [
        { name: 'Ann', household: 'A', answers: { q_meal: 'o_fish', q_bus: true } },
        { name: 'Bo', household: 'A', answers: { q_meal: 'o_fish' } },
        { name: 'Cy', household: 'C', answers: { q_meal: 'o_veg', q_bus: false } },
        { name: 'Di', household: 'C', answers: {} },
    ];
    const t = tallyQuestion(entree, people);
    check('a choice counts each option, in the menu’s order',
        t.options.map(o => `${o.label}:${o.count}`).join() === 'Fish:2,Beef:0,Risotto:1', JSON.stringify(t.options));
    check('…names who chose it', t.options[0].names.join() === 'Ann,Bo');
    check('…and who has not answered', t.answered === 3 && t.unanswered.join() === 'Di');
    const yn = tallyQuestion(shuttle, people);
    check('yes/no counts both', yn.options.map(o => o.count).join() === '1,1');
    const txt = tallyQuestion(song, [{ name: 'A', household: 'A', answers: { q_song: 'September' } }]);
    check('text answers are listed with who gave them', txt.texts[0]?.text === 'September' && txt.texts[0].name === 'A');
}

console.log('\nStarting points');
{
    const made = QUESTION_TEMPLATES.map(t => t.make());
    check('every template makes a question that survives cleaning',
        cleanQuestions(made).length === made.length, `${cleanQuestions(made).length}/${made.length}`);
    check('templates make fresh ids every time', QUESTION_TEMPLATES[0].make().id !== QUESTION_TEMPLATES[0].make().id);
    check('the entrée template is the meal', made.find(q => q.meal)?.type === 'choice');
}

console.log('\nEntrées on the seating export');
{
    const dishes = ['Fish', 'Beef', 'Risotto'];
    const people = [
        { diet: [], meal: 'Fish' }, { diet: [], meal: 'Fish' }, { diet: ['VEG'] as never[], meal: 'Risotto' },
        { diet: [], meal: null }, { diet: ['KID'] as never[], meal: null }, { diet: ['NOM'] as never[], meal: 'Beef' },
        { diet: [], meal: 'A dish since removed' },
    ];
    const m = mealTally(people, dishes);
    check('plates are counted by dish, in the menu’s order',
        m.dishes.map(d => `${d.label}:${d.count}`).join() === 'Fish:2,Beef:0,Risotto:1', JSON.stringify(m));
    check('a kids’ meal and not eating are neither a dish nor waiting', m.unchosen === 2);
    check('a removed dish is waiting for a choice', mealTally([{ diet: [], meal: 'Gone' }], dishes).unchosen === 1);
    check('the line leaves zeroes out', mealParts(m).join() === '2 fish,1 risotto,2 no choice yet', mealParts(m).join());
    const parts = tallyParts(tally(people), 8, 'seated', m);
    check('with a menu, the dishes follow the headcount', parts[1] === '2 fish', parts.join(' | '));
    check('…and the last bucket is no longer “chicken”', parts[parts.length - 1].endsWith('no restriction'), parts.join(' | '));
    check('without a menu it still says chicken', tallyParts(tally(people)).at(-1)!.endsWith('chicken'));

    const data = {
        title: 'T', date: null, venue: null, room: null, vendors: [], unseated: [],
        meal: { question: 'Which entrée?', dishes },
        tables: [{ id: 1, name: 'One', table_type: 'round', seat_count: 4, x: 0, y: 0, people: [
            { name: 'Ann', seat: 1, table_name: 'One', household: 'A', side: null, rsvp_status: 'attending', diet: [], note: '', meal: 'Fish' },
            { name: 'Kid', seat: 2, table_name: 'One', household: 'A', side: null, rsvp_status: 'attending', diet: ['KID'], note: '', meal: null },
        ] }],
    } as SeatingExportData;
    const opts = { ...DEFAULT_EXPORT_OPTIONS, format: 'csv' as const };
    const headers = csvHeaders(opts);
    const col = headers.indexOf('Entrée');
    const rows = csvRows(data, opts);
    check('the spreadsheet has an Entrée column', col > 0);
    check('…with the dish, or “Kids meal”', rows[0][col] === 'Fish' && rows[1][col] === 'Kids meal', JSON.stringify(rows));
    check('…and none when there is no menu', !csvHeaders({ ...opts, meals: false }).includes('Entrée'));
    check('every row is as wide as the header', rows.every(r => r.length === headers.length));
}

console.log('\nFolding names for lookup');
{
    check('accents off', foldName('Norén') === 'noren' && foldName('José García') === 'jose garcia');
    check('letters that do not decompose', foldName('Łukasz Søren') === 'lukasz soren');
    check('two-letter letters', foldName('Straße') === 'strasse' && foldName('Ærø') === 'aero');
    check('Vietnamese stacked accents', foldName('Đặng Thị') === 'dang thi');
    check('case and spacing', foldName('  ÉLODIE   Ñúñez ') === 'elodie nunez');
    check('nothing is nothing', foldName(null) === '' && foldName(undefined) === '');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
