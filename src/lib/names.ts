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
