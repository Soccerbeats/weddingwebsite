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
    /** The form's own field. `note` is the pre-JSONB migration's name for it. */
    other_text?: string | null;
    note?: string | null;
}

/** The restrictions the form collects, in the order they read best. */
export const DIET_CODES = ['VEG', 'VGN', 'GF', 'NUT', 'OTH'] as const;
export type DietCode = (typeof DIET_CODES)[number];

export const DIET_LABELS: Record<DietCode, string> = {
    VEG: 'Vegetarian',
    VGN: 'Vegan',
    GF: 'Gluten free',
    NUT: 'Nut allergy',
    OTH: 'Other',
};

/** The entry field each code is stored in — the editor toggles these by name. */
export const DIET_FIELDS: Record<DietCode, keyof DietaryEntry> = {
    VEG: 'vegetarian',
    VGN: 'vegan',
    GF: 'gluten_free',
    NUT: 'nut_allergy',
    OTH: 'other',
};

/**
 * The codes an answer carries.
 *
 * "Other" counts on the strength of its text as well as its checkbox: an entry
 * migrated from the old free-text column has the words and no boolean, and a
 * caterer reading "no shellfish" does not care which release wrote it.
 */
export function dietCodes(entry: DietaryEntry | null | undefined): DietCode[] {
    if (!entry) return [];
    const codes: DietCode[] = [];
    if (entry.vegetarian) codes.push('VEG');
    if (entry.vegan) codes.push('VGN');
    if (entry.gluten_free) codes.push('GF');
    if (entry.nut_allergy) codes.push('NUT');
    if (entry.other || dietNote(entry)) codes.push('OTH');
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
    const next: DietaryEntry = { ...entry };
    switch (code) {
        case 'VEG': next.vegetarian = !next.vegetarian; break;
        case 'VGN': next.vegan = !next.vegan; break;
        case 'GF': next.gluten_free = !next.gluten_free; break;
        case 'NUT': next.nut_allergy = !next.nut_allergy; break;
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
