'use client';

import { useState } from 'react';
import { CATEGORIES, STATUSES, categoryMeta, type PlaceStatus } from '@/lib/honeymoon';

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
        // Grow to fit rather than trapping a multi-line note (a suggested route,
        // a region write-up) inside a three-row scrollbox. Counts wrapped lines
        // roughly as well as hard ones, and stays draggable beyond the cap.
        const lines = draft.split('\n').reduce(
            (total, line) => total + Math.max(1, Math.ceil(line.length / 60)), 0,
        );
        return (
            <textarea
                value={draft}
                placeholder={placeholder}
                rows={Math.min(24, Math.max(3, lines + 1))}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); } }}
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

export function CategorySelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <SelectField {...props}>
            {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
            ))}
        </SelectField>
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
