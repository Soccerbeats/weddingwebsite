'use client';

import { useEffect, useRef, useState } from 'react';
import {
    STATUSES, categoriesOf, categoryMeta, normalizeCategoryKey,
    type CategoryMeta, type PlaceStatus,
} from '@/lib/honeymoon';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>
            {children}
        </div>
    );
}

// text-base on mobile: iOS Safari zooms the viewport when focusing an input
// under 16px, which makes every edit a pinch-to-recover.
const FIELD = 'w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-base md:text-sm '
    + 'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition';

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

/**
 * Small select that sizes to its content.
 *
 * SelectField is `w-full` by design — it lives in form grids. Reusing it inside
 * a floating toolbar produced a control four times wider than its longest
 * option, which then forced the whole bar to scroll sideways.
 */
export function MiniSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={`w-auto bg-gray-50 border border-gray-200 rounded-xl pl-2 pr-1 py-1
                text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent/30
                focus:border-accent/40 transition ${props.className ?? ''}`}
        />
    );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={`${FIELD} leading-relaxed ${props.className ?? ''}`} />;
}

export function Button({ tone = 'default', className = '', ...props }:
React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost' }) {
    const tones = {
        default: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
        primary: 'bg-accent text-white hover:opacity-90 border border-transparent',
        danger: 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50',
        ghost: 'bg-transparent border border-transparent text-gray-400 hover:text-gray-700',
    }[tone];
    return (
        <button
            {...props}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition
                disabled:opacity-40 disabled:cursor-not-allowed ${tones} ${className}`}
        />
    );
}

/**
 * Text input that commits on blur or Enter and reverts on Escape — the same
 * spreadsheet feel the finance suite uses, and one PATCH per edit rather than
 * one per keystroke.
 */
export function InlineText({ value, onCommit, placeholder, className = '', multiline = false }: {
    value: string;
    onCommit: (next: string) => void;
    placeholder?: string;
    className?: string;
    multiline?: boolean;
}) {
    const [draft, setDraft] = useState(value);
    const [seen, setSeen] = useState(value);
    if (value !== seen) { setSeen(value); setDraft(value); }

    const commit = () => { if (draft !== value) onCommit(draft); };
    const shared = `bg-transparent rounded-lg px-2 py-2 md:py-1 text-base md:text-sm w-full
        hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
        focus:ring-accent/30 transition ${className}`;

    if (multiline) {
        return (
            <AutoTextArea
                value={draft}
                placeholder={placeholder}
                onChange={setDraft}
                onCommit={commit}
                onRevert={() => setDraft(value)}
                className={`${shared} leading-relaxed resize-y`}
            />
        );
    }

    return (
        <input
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); }
            }}
            className={shared}
        />
    );
}

/**
 * Textarea that grows to fit its content.
 *
 * Measures its own scrollHeight rather than estimating characters-per-line. The
 * estimate was fine in one wide column and wrong the moment the Guide tab moved
 * to narrow columns — the same text wraps to far more lines, and a note would
 * end mid-sentence inside a scrollbox. A ResizeObserver re-measures when the
 * column width changes.
 */
function AutoTextArea({ value, placeholder, onChange, onCommit, onRevert, className }: {
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
    onCommit: () => void;
    onRevert: () => void;
    className: string;
}) {
    const ref = useRef<HTMLTextAreaElement | null>(null);

    const fit = () => {
        const el = ref.current;
        if (!el) return;
        // Collapse first: without this it can only ever grow, never shrink.
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(fit, [value]);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <textarea
            ref={ref}
            value={value}
            placeholder={placeholder}
            rows={2}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => { if (e.key === 'Escape') { onRevert(); e.currentTarget.blur(); } }}
            className={`${className} overflow-hidden`}
        />
    );
}

export function CategoryChip({ category }: { category: string }) {
    const meta = categoryMeta(category);
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
        >
            <span aria-hidden>{meta.icon}</span>{meta.label}
        </span>
    );
}

export function StatusChip({ status }: { status: PlaceStatus }) {
    const meta = STATUSES.find((s) => s.key === status) ?? STATUSES[0];
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
        >
            {meta.label}
        </span>
    );
}

const CUSTOM = '__custom__';

/**
 * A select that can grow a new option.
 *
 * Choosing "＋ Custom…" swaps the control for a text box; committing adds the
 * value and selects it. The list keeps whatever is currently selected even if
 * it isn't one of the offered options, so an existing custom value never
 * silently reverts to the first item when the editor reopens.
 */
export function CustomisableSelect({ value, options, onChange, onCreate, placeholder, label }: {
    value: string;
    options: { key: string; label: string }[];
    onChange: (next: string) => void;
    /** Returns the value to select; async so a region can be created first. */
    onCreate: (typed: string) => Promise<string | null> | string | null;
    placeholder: string;
    label: string;
}) {
    const [typing, setTyping] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);

    const commit = async () => {
        const typed = draft.trim();
        if (!typed) { setTyping(false); setDraft(''); return; }
        setBusy(true);
        try {
            const next = await onCreate(typed);
            if (next) onChange(next);
        } finally {
            setBusy(false);
            setTyping(false);
            setDraft('');
        }
    };

    if (typing) {
        return (
            <div className="flex gap-1.5">
                <TextField
                    autoFocus
                    value={draft}
                    placeholder={placeholder}
                    aria-label={label}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        if (e.key === 'Escape') { setTyping(false); setDraft(''); }
                    }}
                />
                <Button tone="primary" className="!px-3 shrink-0" onClick={commit} disabled={busy}>
                    {busy ? '…' : 'Add'}
                </Button>
            </div>
        );
    }

    return (
        <SelectField
            value={value}
            aria-label={label}
            onChange={(e) => {
                if (e.target.value === CUSTOM) { setTyping(true); return; }
                onChange(e.target.value);
            }}
        >
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            <option value={CUSTOM}>＋ Custom…</option>
        </SelectField>
    );
}

/** Category picker, including any custom categories already in use. */
export function CategorySelect({ value, places, onChange }: {
    value: string;
    places: { category: string }[];
    onChange: (next: string) => void;
}) {
    const options: CategoryMeta[] = categoriesOf(places);
    // The current value may be a custom category that nothing else uses yet.
    const known = options.some((o) => o.key === value);
    const all = known ? options : [...options, categoryMeta(value)];

    return (
        <CustomisableSelect
            label="Category"
            value={value}
            placeholder="Beach club, hot springs…"
            options={all.map((c) => ({ key: c.key, label: `${c.icon} ${c.label}` }))}
            onChange={onChange}
            onCreate={(typed) => normalizeCategoryKey(typed)}
        />
    );
}

export function StatusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <SelectField {...props}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </SelectField>
    );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="text-center py-10 px-4">
            <p className="text-sm font-medium text-gray-500">{title}</p>
            {hint && <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">{hint}</p>}
        </div>
    );
}

/** Backdrop-blurred modal, matching the rest of the admin panel. */
export function Modal({ open, onClose, title, children, wide = false }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 bg-gray-900/30 backdrop-blur-sm flex items-end md:items-center
                justify-center p-0 md:p-4"
            onClick={onClose}
        >
            <div
                className={`bg-white w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'} rounded-t-3xl md:rounded-3xl
                    shadow-xl max-h-[92vh] overflow-y-auto`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-white/95 backdrop-blur px-5 py-4 border-b border-gray-100
                    flex items-center justify-between rounded-t-3xl">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

/**
 * Only primary and destructive actions sit on the bar; everything else lives
 * behind the ⋯ menu.
 */
export function OverflowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
    const [open, setOpen] = useState(false);
    if (!items.length) return null;
    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-full hover:bg-gray-50"
                aria-label="More actions"
            >
                ⋯
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-2xl shadow-lg
                        border border-gray-100 py-1 min-w-[10rem]">
                        {items.map((item) => (
                            <button
                                key={item.label}
                                onClick={() => { setOpen(false); item.onClick(); }}
                                className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50
                                    ${item.danger ? 'text-rose-600' : 'text-gray-700'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
