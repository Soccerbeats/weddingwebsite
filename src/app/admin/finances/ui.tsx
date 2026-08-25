'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/finance';

export { formatMoney };

/** Today as YYYY-MM-DD in the browser's own time zone — toISOString() would date an evening entry tomorrow. */
export function todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Cents-accurate display that dims true zeroes so real numbers stand out. */
export function Money({ value, className = '' }: { value: number; className?: string }) {
    const negative = value < 0;
    return (
        <span className={`tabular-nums ${negative ? 'text-rose-600' : ''} ${value === 0 ? 'text-gray-300' : ''} ${className}`}>
            {formatMoney(value)}
        </span>
    );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>
            {children}
        </div>
    );
}

export function StatTile({ label, value, hint, tone = 'default' }: {
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
    const toneClass = {
        default: 'text-gray-900',
        good: 'text-emerald-600',
        warn: 'text-amber-600',
        bad: 'text-rose-600',
    }[tone];
    // Compact on mobile: a stack of five full-size tiles pushed the actual data
    // most of a screen down on every tab.
    return (
        <Card className="px-3 py-2.5 md:px-4 md:py-3">
            <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {label}
            </div>
            <div className={`mt-0.5 text-base font-semibold tabular-nums md:text-xl ${toneClass}`}>
                {value}
            </div>
            {hint && <div className="mt-0.5 truncate text-[11px] text-gray-400" title={hint}>{hint}</div>}
        </Card>
    );
}

// text-base on mobile: iOS Safari zooms the viewport when focusing an input
// under 16px, which makes every edit a pinch-to-recover.
const FIELD = 'w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-base md:text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition';

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

/**
 * Text input that commits on blur or Enter and reverts on Escape.
 *
 * Committing on blur rather than per-keystroke is what makes the whole suite
 * feel like a spreadsheet: type, tab away, the totals move. It also means one
 * PATCH per edit instead of one per character.
 */
export function InlineText({ value, onCommit, placeholder, className = '', align = 'left' }: {
    value: string;
    onCommit: (next: string) => void;
    placeholder?: string;
    className?: string;
    align?: 'left' | 'right';
}) {
    // Re-sync the draft when the committed value changes underneath us (a refetch
    // after saving, or an edit elsewhere). Adjusting state during render is
    // React's recommended alternative to a setState-in-effect here.
    const [draft, setDraft] = useState(value);
    const [seen, setSeen] = useState(value);
    if (value !== seen) { setSeen(value); setDraft(value); }

    const commit = () => { if (draft !== value) onCommit(draft); };

    /*
     * Escape has to tell the blur handler to stand down.
     *
     * It cannot just reset the draft and blur: `setDraft` is asynchronous, so
     * the `commit()` that the blur fires still sees the abandoned text and saves
     * it — pressing Escape wrote the value it was meant to discard. A ref is
     * read synchronously, so the blur that follows knows to skip.
     */
    const abandon = useRef(false);

    return (
        <input
            value={draft}
            placeholder={placeholder}
            // A long name truncates in a table cell; the tooltip is how you read
            // the rest of it without widening the column for every other row.
            title={draft || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (abandon.current) { abandon.current = false; setDraft(value); return; }
                commit();
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); }
                if (e.key === 'Escape') { abandon.current = true; e.currentTarget.blur(); }
            }}
            className={`bg-transparent rounded-lg px-2 py-2 md:py-1 text-base md:text-sm w-full
                hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
                focus:ring-accent/30 transition
                ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
        />
    );
}

/** Same commit-on-blur behaviour, but tolerant of "$1,200.50" style input. */
export function InlineNumber({ value, onCommit, placeholder, prefix, className = '' }: {
    value: number;
    onCommit: (next: number) => void;
    placeholder?: string;
    prefix?: string;
    className?: string;
}) {
    const [draft, setDraft] = useState(String(value ?? 0));
    const [editing, setEditing] = useState(false);
    const [seen, setSeen] = useState(value);
    if (value !== seen) { setSeen(value); setDraft(String(value ?? 0)); }
    // See InlineText: Escape must be able to stop the blur from committing.
    const abandon = useRef(false);

    const commit = () => {
        const cleaned = draft.replace(/[$,\s]/g, '');
        const parsed = cleaned === '' ? 0 : Number(cleaned);
        const next = Number.isFinite(parsed) ? parsed : value;
        if (next !== value) onCommit(next);
        setDraft(String(next));
    };

    // Idle cells show the formatted value; the raw number appears on focus.
    // `prefix` now only says "this is money" — where the symbol goes is the
    // formatter's business, so it can sit against the digits.
    const pretty = prefix
        ? formatMoney(value)
        : (value === 0 ? (placeholder ? '' : '0') : String(value));

    return (
        <input
            value={editing ? draft : pretty}
            placeholder={placeholder}
            inputMode="decimal"
            onFocus={(e) => {
                setEditing(true);
                setDraft(value ? String(value) : '');
                // Select on entry: the common edit is replacing the number, not
                // appending a digit to it.
                requestAnimationFrame(() => e.target.select?.());
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (abandon.current) { abandon.current = false; setDraft(String(value)); setEditing(false); return; }
                commit();
                setEditing(false);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); }
                if (e.key === 'Escape') { abandon.current = true; e.currentTarget.blur(); }
            }}
            className={`w-full rounded-lg bg-transparent px-2 py-2 text-right text-base tabular-nums
                transition hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
                focus:ring-accent/30 md:py-1 md:text-sm
                ${value === 0 && !editing ? 'text-gray-400' : ''} ${className}`}
        />
    );
}

export function Toggle({ checked, onChange, label }: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            aria-label={label}
            aria-pressed={checked}
            className={`relative inline-flex h-7 w-12 md:h-6 md:w-11 shrink-0 items-center
                rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-gray-300'}`}
        >
            <span className={`inline-block h-5 w-5 md:h-4 md:w-4 transform rounded-full bg-white
                shadow-sm transition-transform
                ${checked ? 'translate-x-6 md:translate-x-6' : 'translate-x-1'}`} />
        </button>
    );
}

export function PillButton({ children, onClick, tone = 'default', type = 'button', disabled }: {
    children: React.ReactNode;
    onClick?: () => void;
    tone?: 'default' | 'accent' | 'danger' | 'ghost';
    type?: 'button' | 'submit';
    disabled?: boolean;
}) {
    const tones = {
        default: 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100',
        accent: 'bg-accent text-white hover:opacity-90 border border-transparent',
        danger: 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100',
        ghost: 'bg-transparent text-gray-400 border border-transparent hover:text-gray-600 hover:bg-gray-50',
    }[tone];
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed ${tones}`}
        >
            {children}
        </button>
    );
}

/**
 * One cell of an editable row.
 *
 * Below `md` the grid collapses to a single column, so each cell becomes its own
 * full-width line and needs its own label — the desktop header row is hidden
 * there, and an unlabelled "839.3" next to an unlabelled "1" is unreadable.
 */
export function RowField({ label, children, className = '' }: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 md:justify-start md:gap-0 ${className}`}>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 font-semibold md:hidden">
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

/**
 * Delete control: a comfortable labelled button on touch, a bare × on desktop.
 * The old version was a 21x24px target — far under the 44px touch guidance, and
 * sized so a mistap was as likely as a hit.
 */
export function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="inline-flex h-9 items-center justify-center gap-1 justify-self-start rounded-full
                border border-rose-100 px-4 text-xs font-medium text-rose-500 transition-colors
                hover:bg-rose-50 md:h-auto md:justify-self-auto md:rounded-none md:border-0 md:px-0
                md:text-lg md:leading-none md:text-gray-300 md:hover:bg-transparent
                md:hover:text-rose-500"
        >
            <span className="md:hidden">Delete</span>
            <span aria-hidden className="hidden md:inline">&times;</span>
        </button>
    );
}

/** Small glyph button with a touch-sized hit area that doesn't disturb layout. */
export function GlyphButton({ onClick, label, children, className = '' }: {
    onClick: () => void;
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={`-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-300
                transition-colors hover:text-gray-600 md:-m-1 md:h-6 md:w-6 ${className}`}
        >
            {children}
        </button>
    );
}

/** Native select sized so iOS doesn't zoom when it opens. */
export function RowSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    const { className = '', ...rest } = props;
    return (
        <select
            {...rest}
            className={`w-full rounded-lg bg-transparent px-1 py-2 text-base text-gray-600
                hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30
                md:py-1 md:text-xs ${className}`}
        />
    );
}

/** Native date input sized so iOS doesn't zoom when it opens. */
export function RowDate(props: React.InputHTMLAttributes<HTMLInputElement>) {
    const { className = '', ...rest } = props;
    return (
        <input
            {...rest}
            type="date"
            className={`w-full rounded-lg bg-transparent px-1 py-2 text-base text-gray-500
                hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30
                md:py-1 md:text-xs ${className}`}
        />
    );
}

export function Modal({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} aria-label="Close"
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** Low-emphasis "+ add" action, sized as a real touch target on mobile. */
export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-10 items-center rounded-xl px-3 -mx-3 text-xs font-medium text-gray-500
                transition-colors hover:text-gray-800 active:bg-gray-100 md:h-auto md:px-0 md:mx-0
                md:active:bg-transparent"
        >
            {children}
        </button>
    );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-center text-sm text-gray-400 py-8">{children}</div>
    );
}

/** Horizontal share-of-total bar used in the category breakdown. */
export function Bar({ pct, tone = 'accent' }: { pct: number; tone?: 'accent' | 'rose' }) {
    return (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all"
                style={{
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    backgroundColor: tone === 'rose' ? '#e11d48' : 'var(--accent)',
                }}
            />
        </div>
    );
}
