/**
 * The travel documents — passports, visas, insurance, tickets — as something
 * you can find, check and trust at a border.
 *
 * Pure, and covered by `check:honeymoon`: the Files tab draws what these work
 * out. Nothing here guesses at a date it was not given.
 */
import { DOCUMENT_KINDS, addDays, formatDate } from './honeymoon';
import type { DocumentKind, Trip, TripDocument } from './honeymoon';

/** Filename words, in the order they are tested — the first match wins. */
const KIND_WORDS: { kind: DocumentKind; pattern: RegExp }[] = [
    { kind: 'passport', pattern: /passport/i },
    { kind: 'visa', pattern: /\bvisa\b|e-?visa|\beta\b|\besta\b/i },
    { kind: 'vaccination', pattern: /vaccin|yellow.?fever|immuni[sz]ation|covid/i },
    { kind: 'insurance', pattern: /insurance|policy|\bcover\b/i },
    { kind: 'ticket', pattern: /ticket|boarding|itinerary.?receipt|\bpnr\b|flight/i },
    { kind: 'reservation', pattern: /booking|reservation|confirmation|voucher|hotel/i },
];

/**
 * What a file probably is, from its name.
 *
 * Only a first guess — the kind is editable straight after — but "Boarding pass
 * SQ938.png" filed as a ticket without being asked is the difference between a
 * folder you keep tidy and one you give up on. A name that says nothing takes
 * the folder you dropped it into, and Other with no folder.
 */
export function guessDocumentKind(filename: string, fallback: DocumentKind = 'other'): DocumentKind {
    const name = filename.replace(/[_.-]+/g, ' ');
    for (const { kind, pattern } of KIND_WORDS) if (pattern.test(name)) return kind;
    return fallback;
}

export interface DocWarning {
    /** The document it is about, or null for something missing. */
    documentId: number | null;
    level: 'warn' | 'info';
    message: string;
}

/** Many countries refuse entry on a passport with less than this left after you leave. */
const PASSPORT_MARGIN_DAYS = 183;

/**
 * What is wrong with the documents for this trip.
 *
 * Three rules, each one a thing that stops you at a desk:
 * - anything (a passport, a visa, insurance) that runs out before or during the trip;
 * - a passport with under six months left after the last day — the rule many
 *   countries enforce at check-in;
 * - no passport on file at all, said once and gently.
 *
 * With no trip dates nothing about expiry is concluded: a warning computed
 * against a guessed date is a warning you learn to ignore.
 */
export function documentWarnings(
    docs: TripDocument[], trip: Pick<Trip, 'start_date' | 'end_date'>,
): DocWarning[] {
    const warnings: DocWarning[] = [];
    const start = trip.start_date;
    const end = trip.end_date ?? trip.start_date;
    if (start && end) {
        const margin = addDays(end, PASSPORT_MARGIN_DAYS);
        for (const doc of docs) {
            if (!doc.expires_on || !['passport', 'visa', 'insurance'].includes(doc.kind)) continue;
            const whose = doc.person ? `${doc.person}'s ` : '';
            const what = DOCUMENT_KINDS.find((k) => k.key === doc.kind)?.label.toLowerCase() ?? 'document';
            const on = formatDate(doc.expires_on);
            if (doc.expires_on < start) {
                warnings.push({ documentId: doc.id, level: 'warn', message: `${whose}${what} expires ${on}, before you leave.` });
            } else if (doc.expires_on <= end) {
                warnings.push({ documentId: doc.id, level: 'warn', message: `${whose}${what} expires ${on}, during the trip.` });
            } else if (doc.kind === 'passport' && doc.expires_on < margin) {
                warnings.push({
                    documentId: doc.id,
                    level: 'warn',
                    message: `${whose}passport expires ${on}, under six months after you come home — many countries refuse that.`,
                });
            }
        }
    }
    if (!docs.some((doc) => doc.kind === 'passport')) {
        warnings.push({ documentId: null, level: 'info', message: 'No passport on file yet.' });
    }
    return warnings;
}

export interface Folder {
    /** `kind:passport`, `person:Austin`, `person:` for nobody's. */
    key: string;
    label: string;
    icon: string;
    count: number;
}

/**
 * The folders down the side: one per kind that has files, in the kinds' own
 * order, then one per person, with the unassigned ones as Shared.
 */
export function documentFolders(docs: TripDocument[]): { kinds: Folder[]; people: Folder[] } {
    const kinds = DOCUMENT_KINDS
        .map((kind) => ({
            key: `kind:${kind.key}`,
            label: kind.label,
            icon: kind.icon,
            count: docs.filter((doc) => doc.kind === kind.key).length,
        }))
        .filter((folder) => folder.count > 0);

    const byPerson = new Map<string, number>();
    let shared = 0;
    for (const doc of docs) {
        const person = doc.person?.trim();
        if (person) byPerson.set(person, (byPerson.get(person) ?? 0) + 1);
        else shared += 1;
    }
    const people: Folder[] = [...byPerson.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([person, count]) => ({ key: `person:${person}`, label: person, icon: '👤', count }));
    if (shared) people.push({ key: 'person:', label: 'Shared', icon: '👥', count: shared });
    return { kinds, people };
}

/** The files in a folder, narrowed by a search over names and notes. */
export function filterDocuments(docs: TripDocument[], folder: string, query: string): TripDocument[] {
    const term = query.trim().toLowerCase();
    return docs.filter((doc) => {
        if (folder.startsWith('kind:') && doc.kind !== folder.slice(5)) return false;
        if (folder.startsWith('person:')) {
            const wanted = folder.slice(7);
            if ((doc.person?.trim() ?? '') !== wanted) return false;
        }
        if (!term) return true;
        return doc.name.toLowerCase().includes(term) || (doc.notes ?? '').toLowerCase().includes(term);
    });
}

/** Images open as images; everything else (a PDF) as a document. */
export function isImageFile(path: string): boolean {
    return /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(path);
}
