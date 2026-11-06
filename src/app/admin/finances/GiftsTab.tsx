'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FundItem } from '@/lib/config';
import { toCsv } from '@/lib/mailing';
import { Drawer } from '@/components/admin/Drawer';
import { Toggle } from './ui';

/*
 * Gifts — every present, card and digital payment the couple receive, and
 * whether each has had its thank-you note.
 *
 * Lived on the RSVPs page as "Donations" until v0.10.35. It is the same
 * `donations` table (and the registry's "contribute" flow still writes to it);
 * what changed is where it lives and that a row now records *how* the money
 * came: digital, or a card holding cash or a check (`method`).
 *
 * Built for logging a stack of cards fast: Enter anywhere on the tab opens a
 * new gift with the cursor already in the name, Enter in the name picks the top
 * match and moves on, Enter in any other field saves, and "Save & add another"
 * keeps the event, so the next card from the same party is quick.
 */

export type GiftMethod = 'digital' | 'cash' | 'check';

interface Person { id: number | null; name: string }

interface Gift {
    id: number;
    guest_id: number | null;
    guest_name: string;
    amount: number;
    gift?: string | null;
    fund_item_id: string | null;
    fund_item_title: string | null;
    event: string | null;
    created_at: string;
    thank_you_sent?: boolean;
    thank_you_sent_at?: string | null;
    method?: GiftMethod | null;
    co_donors?: Person[];
}

interface GuestRow {
    id: number;
    guest_name: string;
    address?: string | null;
    plus_one_name?: string | null;
    party_members?: { name: string | null }[];
}

const EVENTS = ['Engagement Party', 'Bridal Shower', 'Wedding Day'] as const;

type ThanksFilter = 'all' | 'todo' | 'done';
type MethodFilter = 'all' | 'digital' | 'card' | 'cash' | 'check' | 'unset';
type KindFilter = 'all' | 'money' | 'item';
type SortKey = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'name' | 'method' | 'thanks';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'newest', label: 'Newest first' },
    { key: 'oldest', label: 'Oldest first' },
    { key: 'amount_desc', label: 'Amount: high to low' },
    { key: 'amount_asc', label: 'Amount: low to high' },
    { key: 'name', label: 'Name A–Z' },
    { key: 'method', label: 'How it came' },
    { key: 'thanks', label: 'Still to thank first' },
];

const METHOD_META: Record<GiftMethod | 'unset', { label: string; short: string; color: string; chip: string }> = {
    digital: { label: 'Digital', short: 'Digital', color: '#6366f1', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
    cash: { label: 'Card · Cash', short: 'Cash', color: '#10b981', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    check: { label: 'Card · Check', short: 'Check', color: '#f59e0b', chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
    unset: { label: 'Not recorded', short: 'Not recorded', color: '#d1d5db', chip: 'bg-gray-50 text-gray-500 ring-gray-100' },
};
const METHOD_ORDER: Record<GiftMethod | 'unset', number> = { digital: 0, cash: 1, check: 2, unset: 3 };

/** Whole dollars stay whole ($150), anything else shows its cents ($150.50). */
function money(n: number): string {
    return n.toLocaleString('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
    });
}

function givers(g: Gift): string {
    return [g.guest_name, ...(g.co_donors || []).map((c) => c.name)].join(', ');
}

function methodOf(g: Gift): GiftMethod | 'unset' {
    return g.method ?? 'unset';
}

function shortDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/* ------------------------------------------------------------------ icons */

type IconName = 'digital' | 'cash' | 'check' | 'gift' | 'search' | 'plus' | 'heart' | 'download' | 'pen' | 'x';
const ICONS: Record<IconName, React.ReactNode> = {
    digital: (<><rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" /><path d="M10.5 18h3" /></>),
    cash: (<><rect x="2.75" y="6" width="18.5" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>),
    check: (<><rect x="2.75" y="5.5" width="18.5" height="13" rx="2" /><path d="M6 10h7M6 14h4M15.5 14.5h3" /></>),
    gift: (<><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12" /><path d="M12 8.5S10.6 4 8.2 4a2.2 2.2 0 0 0 0 4.5H12ZM12 8.5S13.4 4 15.8 4a2.2 2.2 0 0 1 0 4.5H12Z" /></>),
    search: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>),
    plus: (<path d="M12 5v14M5 12h14" />),
    heart: (<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />),
    download: (<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" />),
    pen: (<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />),
    x: (<path d="M6 6l12 12M18 6 6 18" />),
};
function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
            strokeLinejoin="round" className={className} aria-hidden>
            {ICONS[name]}
        </svg>
    );
}

function MethodBadge({ method }: { method: GiftMethod | 'unset' }) {
    if (method === 'unset') return <span className="text-xs text-gray-300">—</span>;
    const meta = METHOD_META[method];
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs
            font-medium ring-1 ring-inset ${meta.chip}`}>
            <Icon name={method} className="size-3.5" />
            {meta.label}
        </span>
    );
}

/** The thank-you state as a button: one click flips it, no selection needed. */
function ThanksPill({ gift, onToggle }: { gift: Gift; onToggle: (g: Gift) => void }) {
    const sent = !!gift.thank_you_sent;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(gift); }}
            title={sent ? 'Click to mark as not sent' : 'Click once the note is in the mail'}
            className={`group inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs
                font-medium transition-all active:scale-95 md:h-7 ${sent
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-50'}`}
        >
            {sent ? (
                <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"
                        strokeLinejoin="round" className="size-3.5" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    Thanked{gift.thank_you_sent_at ? ` · ${shortDate(gift.thank_you_sent_at)}` : ''}
                </>
            ) : (
                <>
                    <span className="size-2 rounded-full bg-amber-400 transition group-hover:scale-125" />
                    To thank
                </>
            )}
        </button>
    );
}

/** A row of rounded options — the one shape every choice on this tab takes. */
function Chips<T extends string>({ value, options, onChange, size = 'sm', allowNone = false }: {
    value: T | null;
    options: { value: T; label: React.ReactNode; count?: number }[];
    onChange: (next: T | null) => void;
    size?: 'sm' | 'md';
    allowNone?: boolean;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
                const on = value === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(on && allowNone ? null : o.value)}
                        className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-all
                            active:scale-95 ${size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs md:h-7'}
                            ${on
                                ? 'bg-gray-900 text-white shadow-sm'
                                : 'bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 hover:text-gray-900'}`}
                    >
                        {o.label}
                        {o.count != null && (
                            <span className={`tabular-nums ${on ? 'text-white/60' : 'text-gray-400'}`}>{o.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

const FIELD = 'w-full rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-base md:text-sm ' +
    'transition placeholder:text-gray-400 focus:border-accent/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30';

function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</span>
            {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
        </div>
    );
}

/* -------------------------------------------------------------- the form */

interface Draft {
    id: number | null;
    donor: Person | null;
    coGivers: Person[];
    amount: string;
    kind: 'digital' | 'card' | null;
    card: 'cash' | 'check' | null;
    gift: string;
    fundId: string;
    event: string;
    otherEvent: string;
    thanked: boolean;
    /** What the row held before this edit, so the fund's progress can be reversed. */
    orig: { amount: number; fund_item_id: string | null } | null;
}

/** The bulk editor: 'keep' on a field means the selection keeps its own values. */
interface BulkDraft {
    thanked: 'keep' | 'yes' | 'no';
    method: 'keep' | GiftMethod | 'clear';
    event: string;
    otherEvent: string;
    /** 'keep', '' for no fund, or a fund id. */
    fund: string;
}

/** A new gift. The event carries over from the last one saved — a stack of cards is all one event. */
function blankDraft(sticky?: Pick<Draft, 'event' | 'otherEvent'>): Draft {
    return {
        id: null, donor: null, coGivers: [], amount: '', gift: '', fundId: '', thanked: false, orig: null,
        kind: null, card: null,
        event: sticky?.event ?? 'Wedding Day', otherEvent: sticky?.otherEvent ?? '',
    };
}

function draftFrom(g: Gift): Draft {
    const m = g.method ?? null;
    const preset = (EVENTS as readonly string[]).includes(g.event || '');
    return {
        id: g.id,
        donor: { id: g.guest_id, name: g.guest_name },
        coGivers: Array.isArray(g.co_donors) ? g.co_donors : [],
        amount: g.amount ? String(g.amount) : '',
        kind: m === 'digital' ? 'digital' : m ? 'card' : null,
        card: m === 'cash' || m === 'check' ? m : null,
        gift: g.gift || '',
        fundId: g.fund_item_id || '',
        event: g.event ? (preset ? g.event : 'Other') : 'Wedding Day',
        otherEvent: g.event && !preset ? g.event : '',
        thanked: !!g.thank_you_sent,
        orig: { amount: g.amount || 0, fund_item_id: g.fund_item_id },
    };
}

/**
 * Name search with the keyboard in charge: type, arrows to move, Enter to take
 * the highlighted name — or, when nobody matches, the name exactly as typed (a
 * coworker who is not on the guest list is still a giver).
 */
function PersonPicker({ people, value, onPick, onClear, inputRef, placeholder, giftCounts }: {
    people: (Person & { key: string })[];
    value: Person | null;
    onPick: (p: Person) => void;
    onClear: () => void;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    placeholder: string;
    giftCounts?: Map<string, number>;
}) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const listId = useId();
    const q = query.trim().toLowerCase();
    const matches = useMemo(() => {
        if (!q) return [];
        const starts = people.filter((p) => p.name.toLowerCase().startsWith(q));
        const rest = people.filter((p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q));
        return [...starts, ...rest].slice(0, 6);
    }, [people, q]);
    const exact = matches.some((m) => m.name.toLowerCase() === q);
    const options: (Person & { key: string; free?: boolean })[] = [
        ...matches,
        ...(q && !exact ? [{ id: null, name: query.trim(), key: '__free', free: true }] : []),
    ];

    const pick = (p: Person) => { onPick({ id: p.id, name: p.name }); setQuery(''); setActive(0); };

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-3.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                        {value.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900">{value.name}</span>
                </span>
                <button type="button" onClick={onClear} aria-label="Change who gave it"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700">
                    <Icon name="x" />
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Icon name="search" />
            </span>
            <input
                ref={inputRef}
                type="text"
                value={query}
                autoComplete="off"
                role="combobox"
                aria-controls={listId}
                aria-expanded={options.length > 0}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                    else if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (options[active]) pick(options[active]);
                    }
                }}
                placeholder={placeholder}
                className={`${FIELD} pl-10`}
            />
            {options.length > 0 && (
                <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1 shadow-xl shadow-gray-900/10">
                    {options.map((p, i) => {
                        const count = giftCounts?.get(p.name.toLowerCase()) ?? 0;
                        return (
                            <button
                                key={p.key}
                                type="button"
                                onMouseEnter={() => setActive(i)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pick(p)}
                                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm
                                    ${i === active ? 'bg-gray-50' : ''}`}
                            >
                                <span className="truncate">
                                    {p.free ? <>Use “<span className="font-medium">{p.name}</span>”</> : p.name}
                                </span>
                                <span className="shrink-0 text-[11px] text-gray-400">
                                    {p.free ? 'not on guest list' : count > 0 ? `${count} logged` : i === active ? '↵' : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* --------------------------------------------------------------- the tab */

export default function GiftsTab() {
    const [gifts, setGifts] = useState<Gift[]>([]);
    const [guests, setGuests] = useState<GuestRow[]>([]);
    const [funds, setFunds] = useState<FundItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');

    const [query, setQuery] = useState('');
    const [thanks, setThanks] = useState<ThanksFilter>('all');
    const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
    const [kind, setKind] = useState<KindFilter>('all');
    const [eventFilter, setEventFilter] = useState('all');
    const [fundFilter, setFundFilter] = useState('all');
    const [sort, setSort] = useState<SortKey>('newest');
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleting, setDeleting] = useState<Gift | null>(null);
    const [bulk, setBulk] = useState<BulkDraft | null>(null);
    const [flash, setFlash] = useState('');

    const personRef = useRef<HTMLInputElement>(null);
    const amountRef = useRef<HTMLInputElement>(null);

    const loadGifts = useCallback(async () => {
        const res = await fetch('/api/admin/donations');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Could not load gifts');
        setGifts(Array.isArray(data) ? data : []);
    }, []);
    const loadFunds = useCallback(async () => {
        const res = await fetch('/api/admin/site-config');
        const data = await res.json();
        setFunds(data?.registry?.items || []);
    }, []);

    useEffect(() => {
        // Everything here lands after a fetch, not during the effect.
        Promise.all([
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadGifts(),
            loadFunds(),
            fetch('/api/admin/guest-list').then((r) => r.json()).then((d) => setGuests(Array.isArray(d) ? d : [])),
        ])
            .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load gifts'))
            .finally(() => setLoaded(true));
    }, [loadGifts, loadFunds]);

    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash(''), 2600);
        return () => clearTimeout(t);
    }, [flash]);

    /* ---- people: every guest, plus the plus-ones and party members nested on a row */
    const people = useMemo(() => guests.flatMap((g) => {
        const out: (Person & { key: string })[] = [{ id: g.id, name: g.guest_name, key: `g-${g.id}` }];
        const seen = new Set([g.guest_name.trim().toLowerCase()]);
        const add = (raw: string | null | undefined, suffix: string) => {
            const name = (raw || '').trim();
            if (!name || seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            out.push({ id: null, name, key: `g-${g.id}-${suffix}` });
        };
        (g.party_members || []).forEach((m, i) => add(m.name, `m${i}`));
        add(g.plus_one_name, 'plus');
        return out;
    }), [guests]);

    const giftCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const g of gifts) {
            for (const n of [g.guest_name, ...(g.co_donors || []).map((c) => c.name)]) {
                const k = n.toLowerCase();
                m.set(k, (m.get(k) ?? 0) + 1);
            }
        }
        return m;
    }, [gifts]);

    const addressFor = useCallback((g: Gift) => {
        if (g.guest_id == null) return '';
        return guests.find((x) => x.id === g.guest_id)?.address || '';
    }, [guests]);

    /* ---- the summary */
    const stats = useMemo(() => {
        const byMethod: Record<GiftMethod | 'unset', { total: number; count: number }> = {
            digital: { total: 0, count: 0 }, cash: { total: 0, count: 0 },
            check: { total: 0, count: 0 }, unset: { total: 0, count: 0 },
        };
        let total = 0;
        let items = 0;
        let thanked = 0;
        for (const g of gifts) {
            total += g.amount || 0;
            if (g.gift) items += 1;
            if (g.thank_you_sent) thanked += 1;
            if (g.amount) {
                byMethod[methodOf(g)].total += g.amount;
                byMethod[methodOf(g)].count += 1;
            }
        }
        const oldestUnthanked = gifts
            .filter((g) => !g.thank_you_sent)
            .reduce<string | null>((o, g) => (!o || g.created_at < o ? g.created_at : o), null);
        return { total, items, thanked, byMethod, oldestUnthanked, moneyCount: gifts.filter((g) => g.amount).length };
    }, [gifts]);

    const events = useMemo(
        () => Array.from(new Set([...EVENTS, ...gifts.map((g) => g.event).filter((e): e is string => !!e)])),
        [gifts],
    );

    /* ---- filter + sort */
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = gifts.filter((g) => {
            if (thanks === 'todo' && g.thank_you_sent) return false;
            if (thanks === 'done' && !g.thank_you_sent) return false;
            const m = methodOf(g);
            if (methodFilter === 'card' && m !== 'cash' && m !== 'check') return false;
            if (methodFilter === 'unset' && m !== 'unset') return false;
            if ((methodFilter === 'digital' || methodFilter === 'cash' || methodFilter === 'check') && m !== methodFilter) return false;
            if (kind === 'money' && !g.amount) return false;
            if (kind === 'item' && !g.gift) return false;
            if (eventFilter !== 'all' && (g.event || '') !== eventFilter) return false;
            if (fundFilter === 'none' && g.fund_item_id) return false;
            if (fundFilter !== 'all' && fundFilter !== 'none' && g.fund_item_id !== fundFilter) return false;
            if (q) {
                const hay = [givers(g), g.gift, g.event, g.fund_item_title, METHOD_META[m].label]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        const byDate = (a: Gift, b: Gift) => (b.created_at.localeCompare(a.created_at)) || b.id - a.id;
        const cmp: Record<SortKey, (a: Gift, b: Gift) => number> = {
            newest: byDate,
            oldest: (a, b) => -byDate(a, b),
            amount_desc: (a, b) => (b.amount || 0) - (a.amount || 0) || byDate(a, b),
            amount_asc: (a, b) => (a.amount || 0) - (b.amount || 0) || byDate(a, b),
            name: (a, b) => a.guest_name.localeCompare(b.guest_name, undefined, { sensitivity: 'base' }),
            method: (a, b) => METHOD_ORDER[methodOf(a)] - METHOD_ORDER[methodOf(b)] || byDate(a, b),
            // Oldest unthanked first: the person who has waited longest is next.
            thanks: (a, b) => Number(!!a.thank_you_sent) - Number(!!b.thank_you_sent)
                || (a.thank_you_sent ? byDate(a, b) : -byDate(a, b)),
        };
        return list.sort(cmp[sort]);
    }, [gifts, query, thanks, methodFilter, kind, eventFilter, fundFilter, sort]);

    const filtersOn = query || thanks !== 'all' || methodFilter !== 'all' || kind !== 'all'
        || eventFilter !== 'all' || fundFilter !== 'all';
    const clearFilters = () => {
        setQuery(''); setThanks('all'); setMethodFilter('all'); setKind('all'); setEventFilter('all'); setFundFilter('all');
    };
    const visibleTotal = visible.reduce((s, g) => s + (g.amount || 0), 0);

    /* ---- opening the form */
    const sticky = useRef<Pick<Draft, 'event' | 'otherEvent'> | undefined>(undefined);
    const openNew = useCallback(() => {
        setFormError('');
        setDraft(blankDraft(sticky.current));
    }, []);
    const openEdit = (g: Gift) => { setFormError(''); setDraft(draftFrom(g)); };

    // Straight to the name: the drawer is portalled and animates in, so wait a frame.
    const draftKey = draft ? (draft.id ?? 'new') : null;
    const draftHasDonor = !!draft?.donor;
    useEffect(() => {
        if (draftKey === null || draftHasDonor) return;
        const t = setTimeout(() => personRef.current?.focus(), 60);
        return () => clearTimeout(t);
    }, [draftKey, draftHasDonor]);

    // Enter anywhere on the tab logs a new gift. Typing into a field, pressing a
    // real button or a drawer already open keeps Enter's usual meaning; the
    // tab bar and this tab's filter chips are marked passive, because clicking
    // "Gifts" leaves focus on that button and Enter would only click it again.
    const formOpen = !!draft || !!deleting || !!bulk;
    useEffect(() => {
        if (formOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing) return;
            if (e.defaultPrevented) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
            if (t?.closest('button, a') && !t.closest('[data-enter-passive]')) return;
            e.preventDefault();
            openNew();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [formOpen, openNew]);

    /* ---- writes */
    const applyFundDeltas = async (delta: Record<string, number>) => {
        if (!Object.values(delta).some(Boolean)) return;
        const res = await fetch('/api/admin/site-config');
        const fresh = await res.json();
        const items: FundItem[] = (fresh.registry?.items || []).map((i: FundItem) => {
            const d = delta[i.id];
            return d ? { ...i, funded: Math.max(0, Math.min(i.price, i.funded + d)) } : i;
        });
        // Only the registry key, so nothing another tab saved is overwritten.
        await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registry: { ...(fresh.registry || {}), items } }),
        });
    };

    const draftProblem = (d: Draft): string => {
        const amount = d.amount.trim() ? Number(d.amount) : 0;
        if (!d.donor) return 'Who is it from?';
        if (isNaN(amount) || amount < 0) return 'That amount doesn’t look right.';
        if (!amount && !d.gift.trim()) return 'Add an amount, a gift, or both.';
        if (d.kind === 'card' && !d.card) return 'Cash or check?';
        return '';
    };

    const save = async (another = false) => {
        if (!draft || saving) return;
        const problem = draftProblem(draft);
        if (problem) { setFormError(problem); return; }
        const amount = draft.amount.trim() ? Number(draft.amount) : 0;
        const fund = amount && draft.fundId ? funds.find((f) => f.id === draft.fundId) ?? null : null;
        const method: GiftMethod | null = draft.kind === 'digital' ? 'digital' : draft.kind === 'card' ? draft.card : null;
        const event = draft.event === 'Other' ? (draft.otherEvent.trim() || 'Other') : draft.event;
        setSaving(true);
        setFormError('');
        try {
            const delta: Record<string, number> = {};
            if (draft.orig?.fund_item_id) delta[draft.orig.fund_item_id] = -draft.orig.amount;
            if (fund) delta[fund.id] = (delta[fund.id] || 0) + amount;
            const body = {
                guest_id: draft.donor!.id || null,
                guest_name: draft.donor!.name,
                amount,
                gift: draft.gift.trim() || null,
                fund_item_id: fund?.id ?? null,
                fund_item_title: fund?.title ?? null,
                event,
                co_donors: draft.coGivers,
                method,
                thank_you_sent: draft.thanked,
            };
            const res = await fetch('/api/admin/donations', {
                method: draft.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft.id ? { ...body, id: draft.id } : body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'Could not save');
            }
            await applyFundDeltas(delta);
            sticky.current = { event: draft.event, otherEvent: draft.otherEvent };
            const name = draft.donor!.name;
            const wasEdit = !!draft.id;
            await Promise.all([loadGifts(), loadFunds()]);
            setFlash(wasEdit ? `Updated ${name}` : `Logged ${name}’s gift`);
            if (another) setDraft(blankDraft(sticky.current));
            else setDraft(null);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const openBulk = () => setBulk({ thanked: 'keep', method: 'keep', event: 'keep', otherEvent: '', fund: 'keep' });

    const applyBulk = async () => {
        if (!bulk || saving) return;
        const ids = [...selected];
        const patch: Record<string, unknown> = { ids };
        if (bulk.thanked !== 'keep') patch.thank_you_sent = bulk.thanked === 'yes';
        if (bulk.method !== 'keep') patch.method = bulk.method === 'clear' ? null : bulk.method;
        if (bulk.event !== 'keep') patch.event = bulk.event === 'Other' ? (bulk.otherEvent.trim() || 'Other') : bulk.event;
        const fund = bulk.fund !== 'keep' && bulk.fund ? funds.find((f) => f.id === bulk.fund) ?? null : null;
        if (bulk.fund !== 'keep') { patch.fund_item_id = fund?.id ?? null; patch.fund_item_title = fund?.title ?? null; }
        if (Object.keys(patch).length === 1) { setBulk(null); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/donations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error();
            // Moving money between funds moves each fund's progress with it.
            if (bulk.fund !== 'keep') {
                const delta: Record<string, number> = {};
                for (const g of gifts) {
                    if (!selected.has(g.id) || !g.amount) continue;
                    if (g.fund_item_id) delta[g.fund_item_id] = (delta[g.fund_item_id] || 0) - g.amount;
                    if (fund) delta[fund.id] = (delta[fund.id] || 0) + g.amount;
                }
                await applyFundDeltas(delta);
            }
            await Promise.all([loadGifts(), loadFunds()]);
            setFlash(`Updated ${ids.length} gift${ids.length === 1 ? '' : 's'}`);
            setBulk(null);
            setSelected(new Set());
        } catch {
            setFlash('Couldn’t save that — try again');
        } finally {
            setSaving(false);
        }
    };

    const setThanked = async (ids: number[], sent: boolean) => {
        if (ids.length === 0) return;
        const now = new Date().toISOString();
        const before = gifts;
        setGifts((list) => list.map((g) => (ids.includes(g.id)
            ? { ...g, thank_you_sent: sent, thank_you_sent_at: sent ? (g.thank_you_sent_at || now) : null }
            : g)));
        try {
            const res = await fetch('/api/admin/donations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, thank_you_sent: sent }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setGifts(before);
            setFlash('Couldn’t save that — try again');
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/donations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deleting.id }),
            });
            if (!res.ok) throw new Error();
            if (deleting.fund_item_id && deleting.amount) {
                await applyFundDeltas({ [deleting.fund_item_id]: -deleting.amount });
            }
            setSelected((s) => { const n = new Set(s); n.delete(deleting.id); return n; });
            await Promise.all([loadGifts(), loadFunds()]);
            setFlash(`Deleted ${deleting.guest_name}’s gift`);
            setDeleting(null);
            setDraft(null);
        } catch {
            setFlash('Couldn’t delete that — try again');
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = () => {
        const rows = visible.map((g) => [
            givers(g), g.amount || '', g.method ? METHOD_META[g.method].label : '', g.gift || '',
            g.fund_item_title || '', g.event || '', new Date(g.created_at).toLocaleDateString(),
            g.thank_you_sent ? 'Yes' : 'No',
            g.thank_you_sent_at ? new Date(g.thank_you_sent_at).toLocaleDateString() : '', addressFor(g),
        ]);
        const csv = toCsv(
            ['From', 'Amount', 'How it came', 'Gift', 'Fund', 'Event', 'Logged', 'Thank-you sent', 'Thanked on', 'Address'],
            rows,
        );
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `gifts-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    /* ---- selection */
    const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.id));
    // Shift-click selects (or clears) everything between the last box you
    // clicked and this one, in the order on screen — the clicked box decides
    // which, so a shift-click can narrow a selection as well as widen it.
    const anchor = useRef<number | null>(null);
    const clickBox = (id: number, shift: boolean) => {
        const at = visible.findIndex((g) => g.id === id);
        const from = anchor.current == null ? -1 : visible.findIndex((g) => g.id === anchor.current);
        setSelected((s) => {
            const n = new Set(s);
            const on = !s.has(id);
            const [lo, hi] = shift && from >= 0 && at >= 0 ? [Math.min(from, at), Math.max(from, at)] : [at, at];
            for (let i = lo; i <= hi; i++) {
                const gid = visible[i]?.id ?? id;
                if (on) n.add(gid); else n.delete(gid);
            }
            return n;
        });
        anchor.current = id;
    };
    // A shift-click would otherwise highlight the text of every row it crosses.
    const noTextSelect = (e: React.MouseEvent) => { if (e.shiftKey) e.preventDefault(); };
    const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((g) => g.id)));
    const headerSort = (asc: SortKey, desc: SortKey) => setSort(sort === desc ? asc : desc);
    const sortArrow = (asc: SortKey, desc: SortKey) => (sort === asc ? ' ↑' : sort === desc ? ' ↓' : '');

    if (!loaded) {
        return (
            <div className="animate-pulse space-y-3">
                <div className="grid gap-3 md:grid-cols-3"><div className="h-36 rounded-3xl bg-gray-100 md:col-span-2" /><div className="h-36 rounded-3xl bg-gray-100" /></div>
                <div className="h-12 rounded-full bg-gray-100" />
                <div className="h-72 rounded-3xl bg-gray-100" />
            </div>
        );
    }

    const pct = gifts.length ? Math.round((stats.thanked / gifts.length) * 100) : 0;
    const toThank = gifts.length - stats.thanked;
    const ring = 2 * Math.PI * 42;

    return (
        <div className="space-y-4 pb-24 md:pb-6" data-gifts-tab>
            {loadError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{loadError}</div>
            )}

            {/* ------------------------------------------------ summary */}
            <div className="grid gap-3 md:grid-cols-3">
                <section className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
                    <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-accent/10 blur-2xl" />
                    <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Received in gifts</div>
                            <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 md:text-4xl">
                                {money(stats.total)}
                            </div>
                        </div>
                        <div className="pb-1 text-sm text-gray-500">
                            {gifts.length} gift{gifts.length === 1 ? '' : 's'} logged
                            {stats.items > 0 && <> · {stats.items} present{stats.items === 1 ? '' : 's'}</>}
                        </div>
                    </div>

                    {/* How it came in: one bar, each slice a way of giving. */}
                    <div className="relative mt-5 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                        {stats.total > 0 && (['digital', 'cash', 'check', 'unset'] as const).map((m) => (
                            stats.byMethod[m].total > 0 && (
                                <div key={m} className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                                    style={{ width: `${(stats.byMethod[m].total / stats.total) * 100}%`, backgroundColor: METHOD_META[m].color }} />
                            )
                        ))}
                    </div>
                    <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['digital', 'cash', 'check', 'unset'] as const).map((m) => {
                            if (m === 'unset' && stats.byMethod.unset.count === 0) return null;
                            const on = methodFilter === m;
                            return (
                                <button key={m} type="button" data-enter-passive
                                    onClick={() => setMethodFilter(on ? 'all' : m)}
                                    className={`rounded-2xl px-3 py-2 text-left transition hover:bg-gray-50 ${on ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <span className="size-2 rounded-full" style={{ backgroundColor: METHOD_META[m].color }} />
                                        {METHOD_META[m].short}
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{money(stats.byMethod[m].total)}</div>
                                    <div className="text-[11px] text-gray-400">{stats.byMethod[m].count} gift{stats.byMethod[m].count === 1 ? '' : 's'}</div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="flex items-center gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="relative size-24 shrink-0">
                        <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="9" />
                            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
                                strokeDasharray={ring} strokeDashoffset={ring * (1 - pct / 100)}
                                className="transition-[stroke-dashoffset] duration-700" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-semibold tabular-nums text-gray-900">{pct}%</span>
                            <span className="text-[10px] text-gray-400">thanked</span>
                        </div>
                    </div>
                    <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Thank-you notes</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">
                            {gifts.length === 0 ? 'Nothing yet' : toThank === 0 ? 'All caught up ♡' : `${toThank} to write`}
                        </div>
                        <div className="text-xs text-gray-500">
                            {stats.thanked} of {gifts.length} sent
                            {stats.oldestUnthanked && toThank > 0 && <> · waiting since {shortDate(stats.oldestUnthanked)}</>}
                        </div>
                        {toThank > 0 && (
                            <button type="button" data-enter-passive
                                onClick={() => { setThanks('todo'); setSort('thanks'); }}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-dark hover:underline">
                                Show who to thank →
                            </button>
                        )}
                    </div>
                </section>
            </div>

            {/* ------------------------------------------------ toolbar */}
            <div className="space-y-2.5" data-enter-passive>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1 basis-56">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Icon name="search" /></span>
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                            placeholder="Search names, gifts, events…"
                            className="h-10 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-base shadow-sm
                                transition focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-sm"
                        />
                    </div>
                    <div className="flex rounded-full bg-gray-100 p-1">
                        {([['all', 'All'], ['todo', 'To thank'], ['done', 'Thanked']] as const).map(([k, l]) => (
                            <button key={k} type="button" onClick={() => setThanks(k)} aria-pressed={thanks === k}
                                className={`h-8 rounded-full px-3.5 text-xs font-medium transition-all md:text-sm
                                    ${thanks === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                                {l}
                                {k === 'todo' && toThank > 0 && <span className="ml-1 tabular-nums text-amber-600">{toThank}</span>}
                            </button>
                        ))}
                    </div>
                    <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort"
                        className="h-10 rounded-full border border-gray-200 bg-white px-4 text-base text-gray-700 shadow-sm
                            focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-sm">
                        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button type="button" onClick={openNew}
                        className="hidden h-10 items-center gap-2 rounded-full bg-accent pl-4 pr-3 text-sm font-medium text-white
                            shadow-sm shadow-accent/30 transition hover:opacity-90 active:scale-95 md:inline-flex">
                        <Icon name="plus" /> Log a gift
                        <kbd className="rounded-md bg-white/20 px-1.5 py-0.5 font-sans text-[11px]">↵</kbd>
                    </button>
                </div>

                <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
                    <div className="flex shrink-0 gap-1.5">
                        <Chips<MethodFilter>
                            value={methodFilter === 'cash' || methodFilter === 'check' ? 'card' : methodFilter}
                            onChange={(v) => setMethodFilter(v ?? 'all')}
                            options={[
                                { value: 'all', label: 'Any way' },
                                { value: 'digital', label: <><Icon name="digital" className="size-3.5" />Digital</>, count: stats.byMethod.digital.count },
                                { value: 'card', label: <><Icon name="cash" className="size-3.5" />Card</>, count: stats.byMethod.cash.count + stats.byMethod.check.count },
                                ...(stats.byMethod.unset.count > 0 ? [{ value: 'unset' as const, label: 'Not recorded' }] : []),
                            ]}
                        />
                    </div>
                    {(methodFilter === 'card' || methodFilter === 'cash' || methodFilter === 'check') && (
                        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 p-1">
                            {([['card', 'Both'], ['cash', 'Cash'], ['check', 'Check']] as const).map(([k, l]) => (
                                <button key={k} type="button" onClick={() => setMethodFilter(k)} aria-pressed={methodFilter === k}
                                    className={`h-6 rounded-full px-2.5 text-xs font-medium transition
                                        ${methodFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                    )}
                    <span className="h-5 w-px shrink-0 bg-gray-200" />
                    <div className="flex shrink-0">
                        <Chips<KindFilter>
                            value={kind}
                            onChange={(v) => setKind(v ?? 'all')}
                            options={[
                                { value: 'all', label: 'Everything' },
                                { value: 'money', label: 'Money', count: stats.moneyCount },
                                { value: 'item', label: <><Icon name="gift" className="size-3.5" />Presents</>, count: stats.items },
                            ]}
                        />
                    </div>
                    <span className="h-5 w-px shrink-0 bg-gray-200" />
                    <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Event"
                        className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/30 md:h-7
                            ${eventFilter !== 'all' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                        <option value="all">Any event</option>
                        {events.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    {funds.length > 0 && (
                        <select value={fundFilter} onChange={(e) => setFundFilter(e.target.value)} aria-label="Fund"
                            className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/30 md:h-7
                                ${fundFilter !== 'all' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                            <option value="all">Any fund</option>
                            <option value="none">No fund</option>
                            {funds.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                        </select>
                    )}
                    {filtersOn && (
                        <button type="button" onClick={clearFilters}
                            className="h-8 shrink-0 rounded-full px-3 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 md:h-7">
                            Clear filters
                        </button>
                    )}
                    <button type="button" onClick={exportCsv} title="Download what is shown, with addresses for the notes"
                        className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-gray-500
                            hover:bg-gray-100 hover:text-gray-800 md:h-7">
                        <Icon name="download" className="size-3.5" /> CSV
                    </button>
                </div>
            </div>

            {/* ------------------------------------------------ list */}
            <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                {gifts.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-16 text-center">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent-dark"><Icon name="gift" className="size-7" /></div>
                        <h3 className="mt-4 text-base font-semibold text-gray-900">No gifts logged yet</h3>
                        <p className="mt-1 max-w-xs text-sm text-gray-500">
                            Every card, check and Venmo in one place — and who still needs a thank-you.
                        </p>
                        <button type="button" onClick={openNew}
                            className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white shadow-sm hover:opacity-90">
                            <Icon name="plus" /> Log the first one
                        </button>
                        <p className="mt-3 hidden text-xs text-gray-400 md:block">or press <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 font-sans">Enter</kbd></p>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <p className="text-sm text-gray-500">Nothing matches those filters.</p>
                        <button type="button" onClick={clearFilters} className="mt-2 text-sm font-medium text-accent-dark hover:underline">Clear filters</button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500 md:px-5">
                            <span>
                                {filtersOn ? `${visible.length} of ${gifts.length}` : `${visible.length}`} gift{visible.length === 1 ? '' : 's'}
                                {visibleTotal > 0 && <> · <span className="font-medium tabular-nums text-gray-700">{money(visibleTotal)}</span></>}
                            </span>
                            <label className="flex items-center gap-2 md:hidden">
                                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                                    className="size-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                Select all
                            </label>
                        </div>

                        {/* Desktop: a table you can sort from its headings. */}
                        <table className="hidden w-full md:table">
                            <thead>
                                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    <th className="w-10 py-2.5 pl-5">
                                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all"
                                            className="size-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    </th>
                                    <th className="px-3 py-2.5"><button type="button" className="uppercase hover:text-gray-700" onClick={() => setSort('name')}>From{sort === 'name' ? ' ↑' : ''}</button></th>
                                    <th className="px-3 py-2.5 text-right"><button type="button" className="uppercase hover:text-gray-700" onClick={() => headerSort('amount_asc', 'amount_desc')}>Amount{sortArrow('amount_asc', 'amount_desc')}</button></th>
                                    <th className="px-3 py-2.5"><button type="button" className="uppercase hover:text-gray-700" onClick={() => setSort('method')}>How{sort === 'method' ? ' ↑' : ''}</button></th>
                                    <th className="px-3 py-2.5">Present / fund</th>
                                    <th className="px-3 py-2.5"><button type="button" className="uppercase hover:text-gray-700" onClick={() => headerSort('oldest', 'newest')}>Event · date{sortArrow('oldest', 'newest')}</button></th>
                                    <th className="py-2.5 pl-3 pr-5"><button type="button" className="uppercase hover:text-gray-700" onClick={() => setSort('thanks')}>Thank-you{sort === 'thanks' ? ' ↑' : ''}</button></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {visible.map((g) => {
                                    const isSel = selected.has(g.id);
                                    return (
                                        <tr key={g.id} onClick={() => openEdit(g)}
                                            className={`group cursor-pointer text-sm transition-colors ${isSel ? 'bg-accent/5' : 'hover:bg-gray-50/80'}`}>
                                            <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={isSel} readOnly onMouseDown={noTextSelect}
                                                    onClick={(e) => clickBox(g.id, e.shiftKey)} aria-label={`Select ${g.guest_name}`}
                                                    className="size-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                            </td>
                                            <td className="max-w-[16rem] px-3 py-3">
                                                <div className="truncate font-medium text-gray-900">{g.guest_name}</div>
                                                {(g.co_donors || []).length > 0 && (
                                                    <div className="truncate text-xs text-gray-400">with {(g.co_donors || []).map((c) => c.name).join(', ')}</div>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                                                {g.amount ? money(g.amount) : <span className="font-normal text-gray-300">—</span>}
                                            </td>
                                            <td className="px-3 py-3"><MethodBadge method={methodOf(g)} /></td>
                                            <td className="max-w-[14rem] px-3 py-3">
                                                {g.gift && (
                                                    <div className="flex items-center gap-1.5 truncate text-gray-700" title={g.gift}>
                                                        <Icon name="gift" className="size-3.5 shrink-0 text-gray-400" />
                                                        <span className="truncate">{g.gift}</span>
                                                    </div>
                                                )}
                                                {g.fund_item_title && <div className="truncate text-xs text-gray-400">→ {g.fund_item_title}</div>}
                                                {!g.gift && !g.fund_item_title && <span className="text-xs text-gray-300">—</span>}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-3">
                                                <div className="text-gray-700">{g.event || '—'}</div>
                                                <div className="text-xs text-gray-400">{shortDate(g.created_at)}</div>
                                            </td>
                                            <td className="py-3 pl-3 pr-5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <ThanksPill gift={g} onToggle={(x) => setThanked([x.id], !x.thank_you_sent)} />
                                                    <span className="text-gray-300 opacity-0 transition group-hover:opacity-100"><Icon name="pen" /></span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Phone: one card per gift. */}
                        <ul className="divide-y divide-gray-50 md:hidden">
                            {visible.map((g) => {
                                const isSel = selected.has(g.id);
                                return (
                                    <li key={g.id} className={`flex gap-3 px-4 py-3.5 ${isSel ? 'bg-accent/5' : ''}`}>
                                        <input type="checkbox" checked={isSel} readOnly onMouseDown={noTextSelect}
                                            onClick={(e) => clickBox(g.id, e.shiftKey)} aria-label={`Select ${g.guest_name}`}
                                            className="mt-1 size-5 shrink-0 rounded border-gray-300 text-accent focus:ring-accent" />
                                        <button type="button" onClick={() => openEdit(g)} className="min-w-0 flex-1 text-left">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="truncate font-medium text-gray-900">{givers(g)}</span>
                                                <span className="shrink-0 font-semibold tabular-nums text-gray-900">{g.amount ? money(g.amount) : ''}</span>
                                            </div>
                                            {g.gift && <div className="mt-0.5 truncate text-sm text-gray-600">🎁 {g.gift}</div>}
                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                                                <MethodBadge method={methodOf(g)} />
                                                <span>{[g.event, shortDate(g.created_at)].filter(Boolean).join(' · ')}</span>
                                            </div>
                                        </button>
                                        <div className="shrink-0 self-center">
                                            <ThanksPill gift={g} onToggle={(x) => setThanked([x.id], !x.thank_you_sent)} />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </section>

            {gifts.length > 0 && (
                <p className="hidden text-center text-xs text-gray-400 md:block">
                    Press <kbd className="rounded border border-gray-200 bg-white px-1.5 font-sans">Enter</kbd> anywhere to log a gift · click a row to edit · click a thank-you to flip it
                </p>
            )}

            {/* ------------------------------------------------ bulk bar */}
            {selected.size > 0 && (
                <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-gray-900/90 p-1.5 pl-4 text-sm text-white shadow-2xl backdrop-blur-md">
                        <span className="mr-1 tabular-nums">{selected.size} selected</span>
                        <button type="button" onClick={openBulk}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
                            <Icon name="pen" className="size-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => { setThanked([...selected], true); setSelected(new Set()); }}
                            className="h-9 whitespace-nowrap rounded-full bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-100">
                            Mark thanked
                        </button>
                        <button type="button" onClick={() => { setThanked([...selected], false); setSelected(new Set()); }}
                            className="h-9 rounded-full px-3 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                            Not yet
                        </button>
                        <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection"
                            className="flex size-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                            <Icon name="x" />
                        </button>
                    </div>
                </div>
            )}

            {/* Phone: the primary action floats. */}
            {selected.size === 0 && (
                <button type="button" onClick={openNew} aria-label="Log a gift"
                    className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex size-14 items-center justify-center
                        rounded-full bg-accent text-white shadow-lg shadow-accent/40 transition active:scale-95 md:hidden">
                    <Icon name="plus" className="size-6" />
                </button>
            )}

            {/* ------------------------------------------------ toast */}
            <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 top-5 z-[60] flex justify-center px-4 transition-all duration-300
                ${flash ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
                <div className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-xl">{flash}</div>
            </div>

            {/* ------------------------------------------------ the form */}
            <Drawer
                open={!!draft}
                onClose={() => setDraft(null)}
                startTall
                title={
                    <div>
                        <h2 className="pt-1.5 text-lg font-semibold text-gray-900">{draft?.id ? 'Edit gift' : 'Log a gift'}</h2>
                        {!draft?.id && <p className="hidden text-xs text-gray-400 md:block">Enter to save · ⌘↵ to save from anywhere</p>}
                    </div>
                }
            >
                {draft && (
                    <form
                        onSubmit={(e) => { e.preventDefault(); save(false); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(e.shiftKey); }
                        }}
                        className="space-y-5"
                    >
                        <div>
                            <Label>From</Label>
                            <PersonPicker
                                people={people}
                                value={draft.donor}
                                inputRef={personRef}
                                giftCounts={giftCounts}
                                placeholder="Start typing a name…"
                                onPick={(p) => {
                                    setDraft((d) => d && { ...d, donor: p });
                                    setFormError('');
                                    setTimeout(() => amountRef.current?.focus(), 30);
                                }}
                                onClear={() => {
                                    setDraft((d) => d && { ...d, donor: null });
                                    setTimeout(() => personRef.current?.focus(), 30);
                                }}
                            />
                            <div className="mt-2">
                                {draft.coGivers.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {draft.coGivers.map((c) => (
                                            <span key={c.name} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-xs text-gray-700">
                                                {c.name}
                                                <button type="button" aria-label={`Remove ${c.name}`}
                                                    onClick={() => setDraft((d) => d && { ...d, coGivers: d.coGivers.filter((x) => x.name !== c.name) })}
                                                    className="flex size-5 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700">
                                                    <Icon name="x" className="size-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <PersonPicker
                                    people={people.filter((p) => p.name !== draft.donor?.name && !draft.coGivers.some((c) => c.name === p.name))}
                                    value={null}
                                    placeholder="+ Also from… (optional)"
                                    onPick={(p) => setDraft((d) => d && (d.coGivers.some((c) => c.name.toLowerCase() === p.name.toLowerCase())
                                        ? d : { ...d, coGivers: [...d.coGivers, p] }))}
                                    onClear={() => undefined}
                                />
                            </div>
                        </div>

                        <div>
                            <Label hint="leave blank for a present only">Amount</Label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-gray-400">$</span>
                                <input
                                    ref={amountRef}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={draft.amount}
                                    onChange={(e) => setDraft((d) => d && { ...d, amount: e.target.value })}
                                    placeholder="0"
                                    className={`${FIELD} h-14 pl-9 text-2xl font-semibold tabular-nums md:text-2xl`}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>How did it come?</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {([['digital', 'Digital', 'Venmo, Zelle, online'], ['card', 'In a card', 'Cash or a check']] as const).map(([k, l, sub]) => {
                                    const on = draft.kind === k;
                                    return (
                                        <button key={k} type="button" aria-pressed={on}
                                            onClick={() => setDraft((d) => d && { ...d, kind: on ? null : k, card: k === 'card' ? d.card : null })}
                                            className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98]
                                                ${on ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl
                                                ${on ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                <Icon name={k === 'digital' ? 'digital' : 'cash'} className="size-5" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-gray-900">{l}</span>
                                                <span className="block truncate text-[11px] text-gray-400">{sub}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {draft.kind === 'card' && (
                                <div className="mt-2 flex items-center gap-3 rounded-2xl bg-gray-50 p-2 pl-3.5">
                                    <span className="text-xs text-gray-500">Inside the card:</span>
                                    <div className="flex flex-1 gap-1.5">
                                        {(['cash', 'check'] as const).map((c) => {
                                            const on = draft.card === c;
                                            return (
                                                <button key={c} type="button" aria-pressed={on}
                                                    onClick={() => { setDraft((d) => d && { ...d, card: c }); setFormError(''); }}
                                                    className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-all active:scale-95
                                                        ${on ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:text-gray-900'}`}>
                                                    <Icon name={c} className="size-4" />
                                                    {c === 'cash' ? 'Cash' : 'Check'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <Label>Present</Label>
                            <input
                                type="text"
                                value={draft.gift}
                                onChange={(e) => setDraft((d) => d && { ...d, gift: e.target.value })}
                                placeholder="e.g. Stand mixer, hand-made quilt"
                                className={FIELD}
                            />
                        </div>

                        {funds.length > 0 && (
                            <div>
                                <Label hint="counts toward the registry fund’s progress">Toward a fund</Label>
                                <select
                                    value={draft.fundId}
                                    disabled={!draft.amount.trim()}
                                    onChange={(e) => setDraft((d) => d && { ...d, fundId: e.target.value })}
                                    className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    <option value="">Not toward a fund</option>
                                    {funds.map((f) => <option key={f.id} value={f.id}>{f.emoji ? `${f.emoji} ` : ''}{f.title}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <Label>Event</Label>
                            <Chips<string>
                                value={draft.event}
                                onChange={(v) => setDraft((d) => d && { ...d, event: v ?? 'Wedding Day' })}
                                options={[...EVENTS, 'Other'].map((e) => ({ value: e, label: e }))}
                            />
                            {draft.event === 'Other' && (
                                <input
                                    type="text"
                                    value={draft.otherEvent}
                                    onChange={(e) => setDraft((d) => d && { ...d, otherEvent: e.target.value })}
                                    placeholder="Name the event"
                                    className={`${FIELD} mt-2`}
                                />
                            )}
                        </div>

                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                            <span className="flex items-center gap-2.5">
                                <span className={`flex size-8 items-center justify-center rounded-xl ${draft.thanked ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-gray-400'}`}>
                                    <Icon name="heart" />
                                </span>
                                <span>
                                    <span className="block text-sm font-medium text-gray-900">Thank-you note sent</span>
                                    <span className="block text-[11px] text-gray-400">
                                        {draft.thanked ? 'All done with this one' : 'Flip it once it’s in the mail'}
                                    </span>
                                </span>
                            </span>
                            <Toggle checked={draft.thanked} onChange={(v) => setDraft((d) => d && { ...d, thanked: v })} label="Thank-you note sent" />
                        </label>

                        {formError && (
                            <p className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{formError}</p>
                        )}

                        <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-gray-100 bg-white/90 px-4 pb-1 pt-3 backdrop-blur md:-mx-5 md:px-5">
                            {draft.id ? (
                                <button type="button" onClick={() => setDeleting(gifts.find((g) => g.id === draft.id) ?? null)}
                                    className="h-10 rounded-full px-3 text-sm font-medium text-rose-600 hover:bg-rose-50">
                                    Delete
                                </button>
                            ) : (
                                <button type="button" onClick={() => save(true)} disabled={saving}
                                    className="h-10 rounded-full px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                                    Save &amp; add another
                                </button>
                            )}
                            <div className="flex-1" />
                            <button type="button" onClick={() => setDraft(null)}
                                className="h-10 rounded-full px-4 text-sm text-gray-500 hover:bg-gray-100">
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                className="h-10 rounded-full bg-accent px-6 text-sm font-medium text-white shadow-sm shadow-accent/30 transition hover:opacity-90 active:scale-95 disabled:opacity-40">
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </form>
                )}
            </Drawer>

            {/* ------------------------------------------------ bulk edit */}
            <Drawer
                open={!!bulk}
                onClose={() => setBulk(null)}
                title={
                    <div>
                        <h2 className="pt-1.5 text-lg font-semibold text-gray-900">Edit {selected.size} gift{selected.size === 1 ? '' : 's'}</h2>
                        <p className="text-xs text-gray-400">Only what you change is changed — everything else stays as it is.</p>
                    </div>
                }
            >
                {bulk && (() => {
                    const sel = gifts.filter((g) => selected.has(g.id));
                    const same = <T,>(f: (g: Gift) => T) => (sel.length && sel.every((g) => f(g) === f(sel[0])) ? f(sel[0]) : undefined);
                    const now = (v: string | undefined) => (v === undefined ? 'mixed now' : `all ${v} now`);
                    const noMoney = sel.filter((g) => !g.amount).length;
                    const methodNow = same((g) => methodOf(g));
                    const eventNow = same((g) => g.event || '—');
                    const fundNow = same((g) => g.fund_item_title || 'no fund');
                    const thankedNow = same((g) => (g.thank_you_sent ? 'thanked' : 'to thank'));
                    return (
                        <form onSubmit={(e) => { e.preventDefault(); applyBulk(); }} className="space-y-5">
                            <div>
                                <Label hint={now(methodNow === undefined ? undefined : METHOD_META[methodNow].label.toLowerCase())}>How it came</Label>
                                <Chips<BulkDraft['method']>
                                    value={bulk.method}
                                    onChange={(v) => setBulk((b) => b && { ...b, method: v ?? 'keep' })}
                                    options={[
                                        { value: 'keep', label: 'Leave as is' },
                                        { value: 'digital', label: <><Icon name="digital" className="size-3.5" />Digital</> },
                                        { value: 'cash', label: <><Icon name="cash" className="size-3.5" />Card · Cash</> },
                                        { value: 'check', label: <><Icon name="check" className="size-3.5" />Card · Check</> },
                                        { value: 'clear', label: 'Not recorded' },
                                    ]}
                                />
                                {noMoney > 0 && bulk.method !== 'keep' && (
                                    <p className="mt-1.5 text-[11px] text-gray-400">
                                        {noMoney} present{noMoney === 1 ? '' : 's'} with no money keep{noMoney === 1 ? 's' : ''} {noMoney === 1 ? 'its' : 'their'} own.
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label hint={now(eventNow)}>Event</Label>
                                <Chips<string>
                                    value={bulk.event}
                                    onChange={(v) => setBulk((b) => b && { ...b, event: v ?? 'keep' })}
                                    options={['keep', ...EVENTS, 'Other'].map((e) => ({ value: e, label: e === 'keep' ? 'Leave as is' : e }))}
                                />
                                {bulk.event === 'Other' && (
                                    <input type="text" value={bulk.otherEvent} placeholder="Name the event"
                                        onChange={(e) => setBulk((b) => b && { ...b, otherEvent: e.target.value })}
                                        className={`${FIELD} mt-2`} />
                                )}
                            </div>

                            {funds.length > 0 && (
                                <div>
                                    <Label hint={now(fundNow)}>Toward a fund</Label>
                                    <select value={bulk.fund} onChange={(e) => setBulk((b) => b && { ...b, fund: e.target.value })} className={FIELD}>
                                        <option value="keep">Leave as is</option>
                                        <option value="">Not toward a fund</option>
                                        {funds.map((f) => <option key={f.id} value={f.id}>{f.emoji ? `${f.emoji} ` : ''}{f.title}</option>)}
                                    </select>
                                    {bulk.fund !== 'keep' && (
                                        <p className="mt-1.5 text-[11px] text-gray-400">Each fund’s progress moves with the money.</p>
                                    )}
                                </div>
                            )}

                            <div>
                                <Label hint={now(thankedNow)}>Thank-you note</Label>
                                <Chips<BulkDraft['thanked']>
                                    value={bulk.thanked}
                                    onChange={(v) => setBulk((b) => b && { ...b, thanked: v ?? 'keep' })}
                                    options={[
                                        { value: 'keep', label: 'Leave as is' },
                                        { value: 'yes', label: 'Sent' },
                                        { value: 'no', label: 'Not sent yet' },
                                    ]}
                                />
                            </div>

                            <div className="rounded-2xl bg-gray-50 px-4 py-3">
                                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Editing</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {sel.slice(0, 12).map((g) => (
                                        <span key={g.id} className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-inset ring-gray-200">
                                            {g.guest_name}{g.amount ? ` · ${money(g.amount)}` : ''}
                                        </span>
                                    ))}
                                    {sel.length > 12 && <span className="px-1 py-1 text-xs text-gray-400">+{sel.length - 12} more</span>}
                                </div>
                            </div>

                            <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-gray-100 bg-white/90 px-4 pb-1 pt-3 backdrop-blur md:-mx-5 md:px-5">
                                <button type="button" onClick={() => setBulk(null)}
                                    className="h-10 rounded-full px-4 text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
                                <button type="submit" disabled={saving}
                                    className="h-10 rounded-full bg-accent px-6 text-sm font-medium text-white shadow-sm shadow-accent/30 transition hover:opacity-90 active:scale-95 disabled:opacity-40">
                                    {saving ? 'Saving…' : `Apply to ${sel.length}`}
                                </button>
                            </div>
                        </form>
                    );
                })()}
            </Drawer>

            {/* Delete confirmations stay pop-ups (AGENTS.md, convention 8). */}
            {deleting && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleting(null)} />
                    <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="mb-2 text-lg font-semibold text-gray-900">Delete this gift?</h2>
                        <p className="mb-5 text-sm text-gray-500">
                            {givers(deleting)} — {[
                                deleting.amount ? money(deleting.amount) : null,
                                deleting.gift || null,
                            ].filter(Boolean).join(' · ')}.
                            {deleting.fund_item_id && deleting.amount ? ` It also comes off ${deleting.fund_item_title || 'the fund'}’s progress.` : ''} This can’t be undone.
                        </p>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setDeleting(null)}
                                className="h-10 flex-1 rounded-full bg-gray-100 text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
                            <button type="button" onClick={confirmDelete} disabled={saving}
                                className="h-10 flex-1 rounded-full bg-rose-600 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40">
                                {saving ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
