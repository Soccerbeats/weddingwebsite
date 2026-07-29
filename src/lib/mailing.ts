// Helpers for turning guest-list rows into a mail-merge friendly CSV:
// an envelope-ready "mail name" plus the free-text address split into
// street / city / state / zip lines.
//
// Both names and addresses are hand-entered free text, so everything here is
// defensive about the shapes that actually show up in the guest list —
// "(Collin's Date)" as a plus-one, "Nick Lucas Jr.", an apartment that got
// glued onto the city, a missing state.

export interface MailGuest {
    guest_name: string;
    party_size: number;
    party_members?: { name: string | null }[];
    plus_one_name?: string | null;
    address?: string;
}

// Suffixes that aren't the surname — "Nick Lucas Jr." is a Lucas.
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'md', 'phd']);

/**
 * Clean a hand-entered name: drop parenthetical notes like
 * "Natalie Williams (Zack's Girlfriend)". Returns '' for a name that was
 * nothing but an annotation, e.g. "(Collin's Date)".
 */
export function cleanName(raw: string | null | undefined): string {
    return (raw || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Name split into given name(s) and surname, with any suffix dropped. */
function splitName(fullName: string): { given: string; last: string } {
    const parts = cleanName(fullName).split(/\s+/).filter(Boolean);
    while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
    if (parts.length === 0) return { given: '', last: '' };
    if (parts.length === 1) return { given: parts[0], last: '' };
    return { given: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/** Every named person in the party, primary guest first, cleaned and de-duplicated. */
export function partyNames(guest: MailGuest): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | null | undefined) => {
        const name = cleanName(raw);
        if (!name || seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase());
        names.push(name);
    };
    add(guest.guest_name);
    (guest.party_members || []).forEach(m => add(m.name));
    add(guest.plus_one_name);
    return names;
}

/**
 * Envelope name for a household:
 *  - 1 person                      -> "John Smith"
 *  - 2 people, same surname        -> "John & Jane Smith"
 *  - 2 people, different surnames  -> "John & Jane"
 *  - 2 people, second name unknown -> "John Smith & Guest"
 *  - 3+ people                     -> "Smith Family", using the most common
 *    surname in the party (ties go to the primary guest) so a mixed household
 *    still gets the name the mail belongs to.
 */
export function mailName(guest: MailGuest): string {
    const names = partyNames(guest);
    const primary = names[0] || '';
    if (!primary) return '';

    // party_size is the source of truth for household size — the name list can be
    // both shorter (an unnamed plus-one is stored as { name: null }) and longer
    // (plus_one_name sometimes repeats a party member under a different surname,
    // e.g. member "Sallianne Ballard" vs plus-one "Sallianne Roher").
    const size = guest.party_size && guest.party_size > 0 ? guest.party_size : names.length || 1;

    if (size <= 1) return primary;

    if (size === 2) {
        const second = names[1];
        if (!second) return `${primary} & Guest`;
        const a = splitName(primary);
        const b = splitName(second);
        if (a.last && b.last && a.last.toLowerCase() === b.last.toLowerCase()) {
            return `${a.given} & ${b.given} ${a.last}`;
        }
        return `${a.given} & ${b.given}`;
    }

    const counts = new Map<string, number>();
    names.slice(0, size).forEach(n => {
        const { last } = splitName(n);
        if (last) counts.set(last, (counts.get(last) || 0) + 1);
    });
    const primaryLast = splitName(primary).last;
    let best = primaryLast;
    let bestCount = counts.get(primaryLast) || 0;
    counts.forEach((count, last) => {
        if (count > bestCount) {
            best = last;
            bestCount = count;
        }
    });
    return best ? `${best} Family` : primary;
}

export interface ParsedAddress {
    street: string;
    city: string;
    state: string;
    zip: string;
    /** "City, ST 12345" — the second line of a mailing label. */
    cityStateZip: string;
    /** Empty when the address parsed cleanly, otherwise what looked wrong. */
    warning: string;
}

const STATE_ZIP = /^([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/;
const ZIP_ONLY = /^\d{5}(?:-\d{4})?$/;
const STATE_ONLY = /^([A-Za-z]{2})\.?$/;
// "Apt. 5 Pewaukee" / "Unit 2 Chippewa Falls" — a secondary-unit designator that
// was never comma-separated from the city.
const UNIT_THEN_CITY = /^((?:apt|apartment|unit|ste|suite|rm|room|fl|floor|no|#)\.?\s*#?\s*[\w-]+)\s+(.+)$/i;

const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
    'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA',
    'VI', 'WA', 'WV', 'WI', 'WY',
]);

/** Split a free-text address into mailing-label lines. */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
    const blank: ParsedAddress = { street: '', city: '', state: '', zip: '', cityStateZip: '', warning: '' };
    if (!(raw || '').trim()) return { ...blank, warning: 'No address' };

    const parts = (raw as string)
        // Line breaks act as separators, including a literal "\n" from a paste.
        .split(/(?:\r?\n|\\n|,)+/)
        .map(p => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    if (parts.length === 1) {
        return { ...blank, street: parts[0], warning: 'Could not split city / state / zip' };
    }

    let state = '';
    let zip = '';
    const tail = parts[parts.length - 1];
    const stateZip = tail.match(STATE_ZIP);
    if (stateZip) {
        state = stateZip[1].toUpperCase();
        zip = stateZip[2];
        parts.pop();
    } else if (ZIP_ONLY.test(tail)) {
        zip = tail;
        parts.pop();
        // "…, City, WI, 53406" — state comma-separated onto its own segment.
        const maybeState = parts[parts.length - 1];
        if (parts.length > 2 && maybeState && STATE_ONLY.test(maybeState)) {
            state = maybeState.replace('.', '').toUpperCase();
            parts.pop();
        }
    } else if (STATE_ONLY.test(tail) && US_STATES.has(tail.replace('.', '').toUpperCase())) {
        state = tail.replace('.', '').toUpperCase();
        parts.pop();
    }

    let city = parts.length > 1 ? (parts.pop() as string) : '';

    // "Muskego WI, 53150" — the state rode along on the city segment.
    if (!state && city) {
        const trailing = city.match(/^(.+)\s+([A-Za-z]{2})\.?$/);
        if (trailing && US_STATES.has(trailing[2].toUpperCase())) {
            city = trailing[1].trim();
            state = trailing[2].toUpperCase();
        }
    }

    // "Apt. 5 Pewaukee" — move the unit back onto the street line.
    if (city) {
        const unit = city.match(UNIT_THEN_CITY);
        if (unit) {
            parts.push(unit[1].trim());
            city = unit[2].trim();
        }
    }

    const street = parts.join(', ');

    const missing = [!city && 'city', !state && 'state', !zip && 'zip'].filter(Boolean);

    return {
        street,
        city,
        state,
        zip,
        cityStateZip: [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        warning: missing.length ? `missing ${missing.join(', ')}` : '',
    };
}

/** Loose key for spotting two guests at the same address. */
function addressKey(raw: string | null | undefined): string {
    return (raw || '')
        .toLowerCase()
        .replace(/[.,#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Quote a value for CSV. */
function csvCell(value: unknown): string {
    const s = value === null || value === undefined ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(r => lines.push(r.map(csvCell).join(',')));
    // BOM so Excel opens UTF-8 names (accents, curly apostrophes) correctly.
    return '﻿' + lines.join('\r\n') + '\r\n';
}

export const MAILING_HEADERS = [
    'Mail Name',
    'Street',
    'City State Zip',
    'City',
    'State',
    'Zip',
    'Address Issue',
    'Shares Address With',
    'Full Address',
    'Party Size',
    'Guest Name',
    'Party Members',
    'Email',
    'Phone',
    'Side',
    'Relationship',
    'Invited',
    'RSVP Status',
    'Flag',
    'Notes',
];

const RSVP_LABELS: Record<string, string> = {
    attending: 'Attending',
    declined: 'Declined',
    likely_not_coming: 'Likely Not Coming',
};

export interface ExportGuest extends MailGuest {
    email?: string;
    phone?: string;
    side?: string;
    notes?: string;
    invited?: boolean;
    rsvp_status?: string;
    flag?: string | null;
    relationship?: string;
}

/**
 * One CSV row per household, in the order given. "Shares Address With" is
 * cross-referenced across the whole batch so duplicate mailings to the same
 * house are easy to spot before labels get printed.
 */
export function mailingRows(guests: ExportGuest[]): unknown[][] {
    const byAddress = new Map<string, string[]>();
    guests.forEach(g => {
        const key = addressKey(g.address);
        if (!key) return;
        byAddress.set(key, [...(byAddress.get(key) || []), g.guest_name]);
    });

    return guests.map(guest => {
        const addr = parseAddress(guest.address);
        const size = guest.party_size || 1;
        // Cap at the household size — see mailName() on names outnumbering party_size.
        const members = partyNames(guest).slice(1, size);
        const unnamed = Math.max(0, size - 1 - members.length);
        const shared = (byAddress.get(addressKey(guest.address)) || [])
            .filter(n => n !== guest.guest_name)
            .join('; ');
        return [
            mailName(guest),
            addr.street,
            addr.cityStateZip,
            addr.city,
            addr.state,
            addr.zip,
            addr.warning,
            shared,
            (guest.address || '').replace(/\s*\n\s*/g, ', ').trim(),
            guest.party_size || 1,
            guest.guest_name,
            [...members, ...Array(unnamed).fill('Guest')].join('; '),
            guest.email || '',
            guest.phone || '',
            guest.side || '',
            guest.relationship || '',
            guest.invited ? 'Yes' : 'No',
            RSVP_LABELS[guest.rsvp_status || ''] || 'No Response',
            guest.flag || '',
            guest.notes || '',
        ];
    });
}
