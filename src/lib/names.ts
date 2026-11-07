/**
 * Reading the hand-entered names on the guest list.
 *
 * Every name in this app was typed by a person, and the guest list has always
 * carried notes inside them — "Natalie Williams (Zack's Girlfriend)",
 * "(Collin's Date)" — because that is how the couple knows who a plus-one is.
 * The note is for them; it is not part of anybody's name, and anything that
 * matches names to each other has to agree about that or the same person exists
 * twice under two spellings.
 */

/**
 * A hand-entered name with its parenthetical note removed.
 *
 * Returns '' for a name that was nothing but a note, e.g. "(Collin's Date)" —
 * the caller decides what an unnamed person is called.
 */
export function cleanName(raw: string | null | undefined): string {
    return (raw || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Do two hand-entered names refer to the same person? Notes and case ignored. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = cleanName(a).toLowerCase();
    const right = cleanName(b).toLowerCase();
    return left !== '' && left === right;
}

/**
 * The same rule as `cleanName`, as a SQL expression over `expr`.
 *
 * Queries match a seat's name against a party member's and against the name on
 * an RSVP's dietary answer, and all three are hand-entered. Doing it in SQL
 * rather than fetching both sides and comparing in JS keeps the join a join —
 * but it means the rule exists twice, so it lives next to the function it
 * mirrors. Change one, change the other.
 */
export function cleanNameSql(expr: string): string {
    return `LOWER(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(${expr}, '\\([^)]*\\)', '', 'g'), '\\s+', ' ', 'g')))`;
}

/*
 * Folding a typed name for lookup: case, spacing and accents ignored, so a
 * guest typing "Noren" finds "Norén", and "Jose" finds "José". (Idea from the
 * fnoren17 fork, which used Postgres's `unaccent`; this needs no extension, so
 * every install gets it.) One table of letters drives both the JS and the SQL,
 * so the two cannot disagree about what matches.
 */
/** Letters Unicode does not decompose into a base letter plus an accent. */
const NO_DECOMPOSITION: Record<string, string> = { 'đ': 'd', 'ħ': 'h', 'ı': 'i', 'ŀ': 'l', 'ł': 'l', 'ø': 'o', 'ŧ': 't' };

/**
 * Every accented Latin letter, capital or not, (Latin-1, Extended-A and B, Extended
 * Additional — Vietnamese's stacked accents included) beside its plain letter,
 * position for position. Built from Unicode, not typed out.
 */
const [ACCENTED, PLAIN] = (() => {
    let from = '';
    let to = '';
    // Capitals too: a database whose locale is C lower-cases ASCII only.
    const ranges: [number, number][] = [[0x00c0, 0x00ff], [0x0100, 0x024f], [0x1e00, 0x1eff]];
    for (const [lo, hi] of ranges) {
        for (let code = lo; code <= hi; code++) {
            const ch = String.fromCodePoint(code);
            const lower = ch.toLowerCase();
            const base = (NO_DECOMPOSITION[lower] ?? lower.normalize('NFD')[0]).toLowerCase();
            if (base !== ch && /^[a-z]$/.test(base) && [...ch].length === 1) { from += ch; to += base; }
        }
    }
    return [from, to];
})();

/** Letters that become two. */
const LIGATURES: [string, string][] = [
    ['ß', 'ss'], ['ẞ', 'ss'], ['æ', 'ae'], ['Æ', 'ae'], ['œ', 'oe'], ['Œ', 'oe'], ['þ', 'th'], ['Þ', 'th'],
];

/** A name as lookups compare it: lower case, accents off, single spaces, trimmed. */
export function foldName(raw: string | null | undefined): string {
    let s = (raw || '').toLowerCase();
    for (const [from, to] of LIGATURES) s = s.split(from).join(to);
    let out = '';
    for (const ch of s) {
        const i = ACCENTED.indexOf(ch);
        out += i === -1 ? ch : PLAIN.charAt(i);
    }
    return out.replace(/\s+/g, ' ').trim();
}

/** `foldName` as a SQL expression over `expr`. Change one, change the other. */
export function foldNameSql(expr: string): string {
    let s = `LOWER(COALESCE(${expr}, ''))`;
    for (const [from, to] of LIGATURES) s = `REPLACE(${s}, '${from}', '${to}')`;
    return `BTRIM(REGEXP_REPLACE(TRANSLATE(${s}, '${ACCENTED}', '${PLAIN}'), '\\s+', ' ', 'g'))`;
}
