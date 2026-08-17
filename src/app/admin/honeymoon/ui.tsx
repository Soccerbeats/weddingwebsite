'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * Native select chrome is a grey bevelled box that ignores border radius on most
 * platforms. appearance-none removes it; the chevron is drawn as a background
 * SVG so the control keeps the same rounded shape as every other field, while
 * staying a real <select> (native picker on mobile, keyboard support for free).
 */
const SELECT_CHROME = 'appearance-none bg-no-repeat pr-9 cursor-pointer';
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' \
fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2'%3E%3Cpath \
stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`;

const chevronStyle: React.CSSProperties = {
    backgroundImage: CHEVRON,
    backgroundPosition: 'right 0.6rem center',
    backgroundSize: '1rem',
};

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            style={{ ...chevronStyle, ...(props.style ?? {}) }}
            className={`${FIELD} ${SELECT_CHROME} ${props.className ?? ''}`}
        />
    );
}

/**
 * Small select that sizes to its content and matches Button exactly.
 *
 * SelectField is `w-full` by design — it lives in form grids — so a toolbar
 * needs its own. The padding, text size, border and radius here are Button's, so
 * a select sitting in a row of pills is the same height and shape rather than a
 * slightly smaller odd one out.
 */
export function MiniSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            style={{ ...chevronStyle, ...(props.style ?? {}) }}
            className={`w-auto bg-white border border-gray-200 rounded-full pl-4 pr-9 py-1.5
                text-sm font-medium text-gray-700 focus:outline-none focus:ring-2
                focus:ring-accent/30 focus:border-accent/40 transition
                ${SELECT_CHROME} ${props.className ?? ''}`}
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
const MANAGE = '__manage__';

/**
 * A select that can grow a new option.
 *
 * Choosing "＋ Custom…" swaps the control for a text box; committing adds the
 * value and selects it. The list keeps whatever is currently selected even if
 * it isn't one of the offered options, so an existing custom value never
 * silently reverts to the first item when the editor reopens.
 */
export function CustomisableSelect({
    value, options, onChange, onCreate, onManage, placeholder, label,
}: {
    value: string;
    options: { key: string; label: string }[];
    onChange: (next: string) => void;
    /** Returns the value to select; async so a region can be created first. */
    onCreate: (typed: string) => Promise<string | null> | string | null;
    /** Opens the rename/delete list, when the caller supports editing. */
    onManage?: () => void;
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
                if (e.target.value === MANAGE) { onManage?.(); return; }
                onChange(e.target.value);
            }}
        >
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            <option value={CUSTOM}>＋ Custom…</option>
            {onManage && <option value={MANAGE}>✎ Edit / remove…</option>}
        </SelectField>
    );
}

/** Category picker, including any custom categories already in use. */
export function CategorySelect({ value, places, onChange, onManage }: {
    value: string;
    places: { category: string }[];
    onChange: (next: string) => void;
    onManage?: () => void;
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
            onManage={onManage}
        />
    );
}

/**
 * Rename or remove the entries behind a dropdown.
 *
 * One component for categories and regions because the job is identical: a list,
 * an editable name, a delete that says what it will cost. `warn` is per-item so
 * the confirmation can name the actual consequence — "12 places move to Other"
 * rather than a generic are-you-sure.
 */
export function ManageListModal({ open, onClose, title, items, onRename, onDelete, hint }: {
    open: boolean;
    onClose: () => void;
    title: string;
    items: { id: number; label: string; detail?: string; warn?: string; locked?: string }[];
    onRename: (id: number, label: string) => void;
    onDelete: (id: number) => void;
    hint?: string;
}) {
    if (!open) return null;
    return (
        <Modal open onClose={onClose} title={title}>
            {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
            {items.length === 0 ? (
                <EmptyState title="Nothing to edit yet" />
            ) : (
                <ul className="divide-y divide-gray-100">
                    {items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 py-2">
                            <div className="flex-1 min-w-0">
                                <InlineText
                                    value={item.label}
                                    className="text-sm -ml-2"
                                    onCommit={(next) => {
                                        const clean = next.trim();
                                        if (clean && clean !== item.label) onRename(item.id, clean);
                                    }}
                                />
                                {item.detail && (
                                    <span className="block text-[11px] text-gray-400 px-2">
                                        {item.detail}
                                    </span>
                                )}
                            </div>
                            {item.locked ? (
                                <span className="text-[11px] text-gray-400 shrink-0" title={item.locked}>
                                    kept
                                </span>
                            ) : (
                                <Button
                                    tone="danger"
                                    className="!px-3 shrink-0"
                                    onClick={() => {
                                        if (confirm(item.warn ?? `Delete "${item.label}"?`)) {
                                            onDelete(item.id);
                                        }
                                    }}
                                >
                                    Delete
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex justify-end pt-3">
                <Button onClick={onClose}>Done</Button>
            </div>
        </Modal>
    );
}

export function StatusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <SelectField {...props}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </SelectField>
    );
}

/**
 * A filter with three states: off, then each side of a boolean.
 *
 * A two-state filter can only ever ask one of the two questions — "show me the
 * unreviewed" with no way to ask "show me what I've already done". Clicking
 * cycles off → on → inverted → off, and the label says which of the three you
 * are looking at rather than making you infer it from a colour.
 */
export type TriState = 'off' | 'on' | 'inverted';

export function nextTriState(current: TriState): TriState {
    return current === 'off' ? 'on' : current === 'on' ? 'inverted' : 'off';
}

export function TriToggle({ state, onChange, offLabel, onLabel, invertedLabel, tone = 'amber' }: {
    state: TriState;
    onChange: (next: TriState) => void;
    offLabel: string;
    onLabel: string;
    invertedLabel: string;
    tone?: 'amber' | 'sky';
}) {
    const palette = {
        amber: { on: 'bg-amber-50 border-amber-200 text-amber-800', inverted: 'bg-amber-500 border-amber-500 text-white' },
        sky: { on: 'bg-sky-50 border-sky-200 text-sky-800', inverted: 'bg-sky-600 border-sky-600 text-white' },
    }[tone];

    const className = state === 'off'
        ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
        : state === 'on' ? palette.on : palette.inverted;

    return (
        <button
            onClick={() => onChange(nextTriState(state))}
            title="Click to cycle: off → on → the opposite"
            className={`rounded-2xl px-3 py-2 text-sm font-medium border transition ${className}`}
        >
            {state === 'off' ? offLabel : state === 'on' ? onLabel : invertedLabel}
        </button>
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

/**
 * Backdrop-blurred modal, matching the rest of the admin panel.
 *
 * Closes on a backdrop *click*, and only when the press started on the backdrop
 * too. A `click` fires on the common ancestor of where the pointer went down and
 * up — so selecting text in a field and releasing past the edge of the dialog
 * lands that click on the backdrop and used to shut the whole thing, losing what
 * you were doing. Tracking where the press began fixes it: releasing outside is
 * not clicking outside.
 */
export function Modal({ open, onClose, title, children, wide = false, guard }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
    /**
     * Runs before any close the user asks for; false keeps the dialog open.
     *
     * This is how a half-typed form stops being thrown away by a stray Escape.
     * It is deliberately not consulted when the dialog closes *itself* after a
     * save — that path calls `onClose` directly.
     */
    guard?: () => boolean;
}) {
    const pressedBackdrop = useRef(false);

    // Escape closes, like every other dialog on the platform. Bound while open
    // only, so a page with five mounted-but-closed dialogs has one listener.
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // A native <select> popup swallows its own Escape; anything else
            // that wants to keep it must stop propagation itself.
            event.stopPropagation();
            if (!guard || guard()) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose, guard]);

    // A portal needs a document, which the server render doesn't have. No
    // mounted flag is needed to bridge that: every dialog in the portal starts
    // closed and is opened by a click, so `open` is always false on the server
    // and on the hydrating render — both sides agree on null.
    if (!open || typeof document === 'undefined') return null;

    /*
     * Rendered into <body>, not in place.
     *
     * The admin area lives inside AppShell's `position: fixed` container, and a
     * fixed element establishes a stacking context — so every z-index inside it,
     * however large, is capped at that container's own level. The site's fixed
     * nav sits outside it at z-index 50 and therefore painted straight over the
     * top of any dialog opened from an admin page, hiding its title bar and
     * close button. Escaping to <body> puts the dialog in the same stacking
     * context as the nav, where z-[60] actually means above it.
     *
     * Raising the z-index alone cannot fix this, and pushing the dialog down
     * below the nav would only trade a covered title for lost height.
     */
    return createPortal((
        <div
            className="fixed inset-0 z-[60] bg-gray-900/30 backdrop-blur-sm flex items-end md:items-center
                justify-center p-0 md:p-4"
            onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
            onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (!pressedBackdrop.current) return;
                pressedBackdrop.current = false;
                if (!guard || guard()) onClose();
            }}
        >
            <div
                className={`bg-white w-full ${wide ? 'md:max-w-3xl xl:max-w-5xl' : 'md:max-w-lg'} rounded-t-3xl md:rounded-3xl
                    shadow-xl max-h-[92vh] overflow-y-auto`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-white/95 backdrop-blur px-5 py-4 border-b border-gray-100
                    flex items-center justify-between rounded-t-3xl">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button
                        onClick={() => { if (!guard || guard()) onClose(); }}
                        className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-4 md:p-5">{children}</div>
            </div>
        </div>
    ), document.body);
}

/**
 * "Deleted X — Undo", bottom centre, for ten seconds.
 *
 * Ten seconds because it is roughly how long it takes to look at what you just
 * did and realise. The countdown is drawn as a draining bar rather than a
 * number: it says "this is going away" without asking you to read anything.
 *
 * Hovering pauses it — reaching for the mouse should not be a race.
 */
export function UndoToast({ label, onUndo, onDismiss, seconds = 10 }: {
    label: string;
    onUndo: () => void;
    onDismiss: () => void;
    seconds?: number;
}) {
    const [left, setLeft] = useState(seconds);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return;
        if (left <= 0) { onDismiss(); return; }
        const timer = setTimeout(() => setLeft((n) => n - 0.25), 250);
        return () => clearTimeout(timer);
    }, [left, paused, onDismiss]);

    if (typeof document === 'undefined') return null;

    return createPortal((
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] w-max max-w-[calc(100%-2rem)]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            role="status"
        >
            <div className="rounded-2xl bg-gray-900 text-white shadow-xl overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-2.5">
                    <span className="text-sm">{label}</span>
                    <button
                        onClick={onUndo}
                        className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1
                            text-sm font-semibold transition"
                    >
                        Undo
                    </button>
                    <button
                        onClick={onDismiss}
                        className="text-white/50 hover:text-white text-lg leading-none"
                        aria-label="Dismiss"
                    >
                        &times;
                    </button>
                </div>
                <div className="h-0.5 bg-white/10">
                    <div
                        className="h-full bg-white/50 transition-[width] duration-250 ease-linear"
                        style={{ width: `${Math.max(0, (left / seconds) * 100)}%` }}
                    />
                </div>
            </div>
        </div>
    ), document.body);
}

export interface BulkField {
    /** The column to write. */
    key: string;
    label: string;
    /** Values offered for it. `value` is sent to the API exactly as given. */
    options: { value: unknown; label: string; danger?: boolean }[];
}

/**
 * Change any one field across a selection, in two clicks.
 *
 * A toolbar can hold two or three of the most-used verbs before it stops being
 * readable, which left the rest of a place's fields editable only one row at a
 * time. This is the rest of them: pick the field, pick the value, done. Two
 * steps rather than one long flat list because a flat list would mix "Booked"
 * and "Ubud" and "Indonesia" with no clue which is which.
 */
export function BulkFieldMenu({ fields, onApply, label = 'Change…' }: {
    fields: BulkField[];
    onApply: (key: string, value: unknown) => void;
    label?: string;
}) {
    const [open, setOpen] = useState(false);
    const [field, setField] = useState<BulkField | null>(null);

    const close = () => { setOpen(false); setField(null); };
    if (!fields.length) return null;

    return (
        <div className="relative">
            <button
                onClick={() => (open ? close() : setOpen(true))}
                title={label}
                aria-label={label}
                aria-expanded={open}
                className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5
                    text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
                ⋯
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={close} />
                    {/* left-0, not right-0: this button sits mid-bar, and a menu
                        hung off its right edge would open back over the actions
                        it is meant to supplement. */}
                    <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-2xl shadow-lg
                        border border-gray-100 py-1 min-w-[12rem] max-h-[60vh] overflow-auto">
                        {field == null ? (
                            <>
                                <p className="px-4 py-1 text-[11px] uppercase tracking-wide
                                    text-gray-400 font-semibold">
                                    Change for all selected
                                </p>
                                {fields.map((f) => (
                                    <button
                                        key={f.key}
                                        onClick={() => setField(f)}
                                        className="flex w-full items-center justify-between gap-3 px-4 py-2
                                            text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        {f.label}
                                        <span className="text-gray-300">›</span>
                                    </button>
                                ))}
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setField(null)}
                                    className="flex w-full items-center gap-2 px-4 py-1 text-[11px]
                                        uppercase tracking-wide text-gray-400 font-semibold
                                        hover:text-gray-700"
                                >
                                    ‹ {field.label}
                                </button>
                                {field.options.map((opt) => (
                                    <button
                                        key={String(opt.value)}
                                        onClick={() => { close(); onApply(field.key, opt.value); }}
                                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50
                                            ${opt.danger ? 'text-rose-600' : 'text-gray-700'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                {!field.options.length && (
                                    <p className="px-4 py-2 text-sm text-gray-400">Nothing to pick yet.</p>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
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
