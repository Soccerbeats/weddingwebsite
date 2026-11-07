/**
 * The guest-facing site's languages, with no browser:
 *
 *   npm run check:i18n
 *
 * Every language against English: the same keys, the same {placeholders} in
 * each message (a translation that drops {date} prints a sentence with a hole
 * in it), no empty strings, and every plural form the language's own rules
 * ask for. Then the helpers: filling, plurals, dates, the setting's fallback.
 */
import { LOCALES, resolveLocale, type Locale } from '../src/lib/i18n/locales';
import { fill, plural, formatDate, parseIsoDate, type Plural } from '../src/lib/i18n/format';
import { MESSAGES } from '../src/lib/i18n/messages';

let failures = 0;
let checks = 0;
function check(label: string, condition: boolean, detail = '') {
    checks += 1;
    if (condition) console.log(`  ✓ ${label}`);
    else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

type Tree = { [key: string]: string | Tree };
const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v: unknown): v is Plural =>
    !!v && typeof v === 'object' && 'other' in v && Object.keys(v).every(k => PLURAL_KEYS.has(k));

/** Every leaf as path → value; a plural is one leaf. */
function leaves(tree: Tree, prefix = ''): Map<string, string | Plural> {
    const out = new Map<string, string | Plural>();
    for (const [key, value] of Object.entries(tree)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string' || isPlural(value)) out.set(path, value as string | Plural);
        else for (const [p, v] of leaves(value as Tree, path)) out.set(p, v);
    }
    return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const pluralPlaceholders = (p: Plural) => placeholders(p.other);

const english = leaves(MESSAGES.en as unknown as Tree);
console.log(`\nEnglish has ${english.size} messages`);

for (const locale of Object.keys(LOCALES) as Locale[]) {
    if (locale === 'en') continue;
    console.log(`\n${LOCALES[locale].name} (${locale})`);
    const theirs = leaves(MESSAGES[locale] as unknown as Tree);
    const missing = [...english.keys()].filter(k => !theirs.has(k));
    const extra = [...theirs.keys()].filter(k => !english.has(k));
    check('has every message English has', missing.length === 0, missing.slice(0, 5).join(', '));
    check('has nothing English does not', extra.length === 0, extra.slice(0, 5).join(', '));

    const empty: string[] = [];
    const holes: string[] = [];
    const shape: string[] = [];
    const forms: string[] = [];
    const categories = new Intl.PluralRules(LOCALES[locale].intl).resolvedOptions().pluralCategories;
    for (const [path, en] of english) {
        const value = theirs.get(path);
        if (value === undefined) continue;
        if (typeof en === 'string') {
            if (typeof value !== 'string') { shape.push(path); continue; }
            if (!value.trim()) empty.push(path);
            if (placeholders(value) !== placeholders(en)) holes.push(`${path} (${placeholders(value)} vs ${placeholders(en)})`);
        } else {
            if (!isPlural(value)) { shape.push(path); continue; }
            for (const cat of categories) {
                // A form only falls back to `other` when the language never needs it for whole numbers.
                const needed = cat === 'other' || [0, 1, 2, 3, 4, 5, 11, 21, 22, 25].some(n => new Intl.PluralRules(LOCALES[locale].intl).select(n) === cat);
                if (needed && !(cat in value) && cat !== 'other') forms.push(`${path}.${cat}`);
            }
            for (const [cat, text] of Object.entries(value)) {
                if (!text?.trim()) empty.push(`${path}.${cat}`);
                if (placeholders(text) !== pluralPlaceholders(en)) holes.push(`${path}.${cat}`);
            }
        }
    }
    check('every message keeps its shape (text or plural)', shape.length === 0, shape.join(', '));
    check('no empty messages', empty.length === 0, empty.join(', '));
    check('every message keeps its {placeholders}', holes.length === 0, holes.slice(0, 5).join('; '));
    check(`every plural has the forms ${LOCALES[locale].name} needs (${categories.join('/')})`, forms.length === 0, forms.slice(0, 5).join(', '));
}

console.log('\nThe helpers');
{
    check('fill puts values in', fill('Hi {name}, {n}', { name: 'Ann', n: 2 }) === 'Hi Ann, 2');
    check('fill leaves an unknown placeholder alone', fill('{a} {b}', { a: 'x' }) === 'x {b}');
    const days = MESSAGES.en.rsvpPage.daysAway;
    check('English plural: 1 day / 5 days', plural('en', days, 1).includes('1 day away') && plural('en', days, 5).includes('5 days'));
    const ruGuests = MESSAGES.ru.rsvp.partyOf;
    check('Russian plural: 1 гость, 3 гостя, 5 гостей, 21 гость',
        plural('ru', ruGuests, 1) === '1 гость' && plural('ru', ruGuests, 3) === '3 гостя'
        && plural('ru', ruGuests, 5) === '5 гостей' && plural('ru', ruGuests, 21) === '21 гость',
        [1, 3, 5, 21].map(n => plural('ru', ruGuests, n)).join(' | '));
    const d = parseIsoDate('2027-06-15')!;
    check('a YYYY-MM-DD is a local date', d.getFullYear() === 2027 && d.getMonth() === 5 && d.getDate() === 15);
    check('anything else is not a date', parseIsoDate('June 15') === null && parseIsoDate(null) === null);
    const long = { year: 'numeric', month: 'long', day: 'numeric' } as const;
    check('dates follow the language', formatDate('de', d, long).includes('Juni') && formatDate('es', d, long).includes('junio')
        && formatDate('sv', d, long).includes('juni') && formatDate('ru', d, long).includes('июня') && formatDate('en', d, long).includes('June'),
        (Object.keys(LOCALES) as Locale[]).map(l => formatDate(l, d, long)).join(' | '));
    check('no setting means English', resolveLocale(undefined) === 'en' && resolveLocale('') === 'en');
    check('an unknown language means English', resolveLocale('klingon') === 'en' && resolveLocale(42) === 'en');
    check('a known language is kept', resolveLocale('sv') === 'sv');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
