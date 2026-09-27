/**
 * What people cannot eat, and where that answer lives.
 *
 * One array per household, on the RSVP (`rsvps.dietary_restrictions`), one entry
 * per attending person, matched to them by name. The RSVP form writes it; the
 * guest list editor now writes it too, for the people who tell the couple in
 * person; the seating export reads it.
 *
 * Pure — no DOM, no network, no database. Covered by `npm run check:seating`.
 */
import { cleanName } from './names';

/** One person's answer, as `rsvps.dietary_restrictions` stores it. */
export interface DietaryEntry {
    name?: string | null;
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
    nut_allergy?: boolean;
    other?: boolean;
    /** A child's plate rather than the adult one. A meal, not a restriction. */
    kids_meal?: boolean;
    /** No plate at all — they still take a chair. A baby whose food comes with them. */
    no_meal?: boolean;
    /** The form's own field. `note` is the pre-JSONB migration's name for it. */
    other_text?: string | null;
    note?: string | null;
}

/**
 * The restrictions — things that change what is *on* a plate.
 *
 * Not the whole list of answers: see `MEAL_CODES` for the two that change
 * whether there is a plate, and what kind.
 */
export const DIET_CODES = ['VEG', 'VGN', 'GF', 'NUT', 'OTH'] as const;

/**
 * Which plate, or none at all.
 *
 * Kept apart from the restrictions because they are counted differently and the
 * difference is the whole point: a restriction modifies a plate, `KID` *is* a
 * different plate, and `NOM` is a chair with no plate against it — the baby
 * whose mother brings their food. A caterer asked for "111 meals" when one of
 * them eats nothing has been told the wrong number.
 */
export const MEAL_CODES = ['KID', 'NOM'] as const;

/** Everything one person's answer can say, in the order it reads best. */
export const ALL_DIET_CODES = [...DIET_CODES, ...MEAL_CODES] as const;

export type RestrictionCode = (typeof DIET_CODES)[number];
export type DietCode = (typeof ALL_DIET_CODES)[number];

export const DIET_LABELS: Record<DietCode, string> = {
    VEG: 'Vegetarian',
    VGN: 'Vegan',
    GF: 'Gluten free',
    NUT: 'Nut allergy',
    OTH: 'Other',
    KID: 'Kids meal',
    NOM: 'Not eating',
};

/** The entry field each code is stored in — the editor toggles these by name. */
export const DIET_FIELDS: Record<DietCode, keyof DietaryEntry> = {
    VEG: 'vegetarian',
    VGN: 'vegan',
    GF: 'gluten_free',
    NUT: 'nut_allergy',
    OTH: 'other',
    KID: 'kids_meal',
    NOM: 'no_meal',
};

/** Is this code one of the two that decide the plate rather than modify it? */
export function isMealCode(code: DietCode): boolean {
    return (MEAL_CODES as readonly string[]).includes(code);
}

/**
 * The codes an answer carries.
 *
 * "Other" counts on the strength of its text as well as its checkbox: an entry
 * migrated from the old free-text column has the words and no boolean, and a
 * caterer reading "no shellfish" does not care which release wrote it.
 */
export function dietCodes(entry: DietaryEntry | null | undefined): DietCode[] {
    if (!entry) return [];
    // Not eating is the whole answer. Restrictions on a plate that is not being
    // served say nothing, and printing "no meal · gluten free" beside a name
    // invites someone to make the gluten-free plate anyway. Enforced here rather
    // than only in the editor, so a row written by an older release — or by
    // hand — still reads sensibly.
    if (entry.no_meal) return ['NOM'];
    const codes: DietCode[] = [];
    if (entry.vegetarian) codes.push('VEG');
    if (entry.vegan) codes.push('VGN');
    if (entry.gluten_free) codes.push('GF');
    if (entry.nut_allergy) codes.push('NUT');
    if (entry.other || dietNote(entry)) codes.push('OTH');
    if (entry.kids_meal) codes.push('KID');
    return codes;
}

/** The free text behind an "other", from either of the two fields that hold it. */
export function dietNote(entry: DietaryEntry | null | undefined): string {
    return (entry?.other_text ?? entry?.note ?? '').trim();
}

/** Nothing reported — worth knowing, because it is not the same as no entry. */
export function isEmptyEntry(entry: DietaryEntry | null | undefined): boolean {
    return dietCodes(entry).length === 0;
}

/**
 * The entry belonging to one person, by name.
 *
 * Both sides are hand-entered and either can carry a note — the guest list
 * writes a plus-one as "Steve Reesman (Lauren's Boyfriend)" — so the note comes
 * off both before they are compared.
 */
export function entryFor(entries: DietaryEntry[] | null | undefined, name: string): DietaryEntry | null {
    if (!Array.isArray(entries)) return null;
    const wanted = cleanName(name).toLowerCase();
    if (!wanted) return null;
    return entries.find(e => cleanName(e?.name).toLowerCase() === wanted) ?? null;
}

/**
 * The household's answers lined up with the household's people.
 *
 * The editor shows one row per person, so it needs an entry per person in that
 * order, whether or not the RSVP has one for them. An answer whose name matches
 * nobody in the party — someone renamed since they answered — is kept on the end
 * rather than dropped, or saving the form would quietly delete it.
 */
export function alignEntries(people: string[], entries: DietaryEntry[] | null | undefined): DietaryEntry[] {
    const list = Array.isArray(entries) ? entries : [];
    const used = new Set<DietaryEntry>();
    const aligned = people.map(person => {
        const found = entryFor(list, person);
        if (found) used.add(found);
        return { ...(found ?? {}), name: person };
    });
    const orphans = list.filter(e => !used.has(e) && !isEmptyEntry(e));
    return [...aligned, ...orphans];
}

/**
 * The array to store back, from the rows the editor holds.
 *
 * Only the people who are coming, because that is what the array means
 * everywhere else: `database/init.sql` recovers each person's own RSVP answer
 * from *being listed here*, and the export counts plates from it. An unnamed
 * slot cannot be matched to anybody, so it is left out rather than stored under
 * a placeholder.
 */
export function entriesToStore(
    rows: { entry: DietaryEntry; name: string; attending?: boolean | null }[],
): DietaryEntry[] {
    return rows
        .filter(row => row.attending !== false && cleanName(row.name) !== '')
        .map(row => ({
            name: cleanName(row.name),
            vegetarian: !!row.entry.vegetarian,
            vegan: !!row.entry.vegan,
            gluten_free: !!row.entry.gluten_free,
            nut_allergy: !!row.entry.nut_allergy,
            other: !!row.entry.other,
            kids_meal: !!row.entry.kids_meal,
            no_meal: !!row.entry.no_meal,
            other_text: row.entry.other ? dietNote(row.entry) : '',
        }));
}

/** Is this restriction set on this answer? */
export function isOn(entry: DietaryEntry | null | undefined, code: DietCode): boolean {
    return dietCodes(entry).includes(code);
}

/**
 * Turn one restriction on or off.
 *
 * Switching "other" off clears its text as well — a note left behind would keep
 * the restriction on, because `dietCodes` counts the words as the answer.
 */
export function toggleRestriction(entry: DietaryEntry, code: DietCode): DietaryEntry {
    // "Not eating" and everything else are mutually exclusive, in both
    // directions: turning it on clears the rest, and answering anything else
    // turns it off. Otherwise a form can hold "not eating, vegetarian" and
    // whoever reads the sheet has to decide which of the two the kitchen meant.
    if (code === 'NOM') {
        if (entry.no_meal) return { ...entry, no_meal: false };
        return { name: entry.name, no_meal: true, other_text: '', note: null };
    }

    const next: DietaryEntry = { ...entry, no_meal: false };
    switch (code) {
        case 'VEG': next.vegetarian = !next.vegetarian; break;
        case 'VGN': next.vegan = !next.vegan; break;
        case 'GF': next.gluten_free = !next.gluten_free; break;
        case 'NUT': next.nut_allergy = !next.nut_allergy; break;
        case 'KID': next.kids_meal = !next.kids_meal; break;
        case 'OTH':
            next.other = !isOn(entry, 'OTH');
            if (!next.other) { next.other_text = ''; next.note = null; }
            break;
    }
    return next;
}

/** The note behind "other", replaced. The legacy field is cleared with it. */
export function setNote(entry: DietaryEntry, text: string): DietaryEntry {
    return { ...entry, other: true, other_text: text, note: null };
}

/**
 * What a set of answers amounts to, for telling whether anything changed.
 *
 * Compares what is *recorded* — the person, their restrictions, their note —
 * and not how it is stored, so an answer written by the RSVP form and the same
 * answer written by the editor come out identical.
 */
export function signature(entries: DietaryEntry[] | null | undefined): string {
    const list = Array.isArray(entries) ? entries : [];
    return JSON.stringify(
        list
            .filter(e => !isEmptyEntry(e))
            .map(e => [cleanName(e?.name).toLowerCase(), dietCodes(e).join('+'), dietNote(e)])
            .sort((a, b) => a[0].localeCompare(b[0])),
    );
}
