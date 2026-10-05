'use client';

import { Popover } from './Popover';

/** One filter that is switched on, and how to switch it off. */
export interface ActiveFilter {
    key: string;
    label: string;
    clear: () => void;
}

/**
 * "Filters (3)" — every narrowing control behind one button.
 *
 * Places had two rows of full-width selects, the map a card of ten controls,
 * the stays tab a third arrangement. They all become this: the button carries
 * the count, the panel holds the controls, and what is switched on is shown as
 * chips you can knock off one at a time (`FilterChips`). A popover on a laptop,
 * a bottom sheet on a phone.
 */
export function FilterButton({ active, onReset, children, title = 'Filters' }: {
    active: ActiveFilter[];
    onReset: () => void;
    children: React.ReactNode;
    title?: string;
}) {
    const count = active.length;
    return (
        <Popover
            label={title}
            sheetOnPhone
            buttonData="filters"
            buttonClassName={`inline-flex min-h-11 md:min-h-0 shrink-0 items-center gap-1.5 rounded-full border
                px-4 py-1.5 text-sm font-medium transition
                ${count ? 'border-accent/40 bg-accent/10 text-gray-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            buttonContent={() => (
                <>
                    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M3 5h14M6 10h8M8.5 15h3" strokeLinecap="round" />
                    </svg>
                    {title}
                    {count > 0 && (
                        <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular-nums">
                            {count}
                        </span>
                    )}
                </>
            )}
        >
            {(close) => (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2">{children}</div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                        <button
                            type="button"
                            onClick={onReset}
                            disabled={!count}
                            className="min-h-11 md:min-h-0 rounded-full px-3 py-1.5 text-sm text-gray-500
                                hover:text-gray-800 disabled:opacity-40"
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={close}
                            className="min-h-11 md:min-h-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </Popover>
    );
}

/** What is switched on, as chips. Nothing at all when nothing is. */
export function FilterChips({ active }: { active: ActiveFilter[] }) {
    if (!active.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {active.map((filter) => (
                <button
                    key={filter.key}
                    type="button"
                    onClick={filter.clear}
                    title={`Remove: ${filter.label}`}
                    className="inline-flex min-h-9 md:min-h-0 items-center gap-1 rounded-full bg-white border
                        border-gray-200 px-2.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                    {filter.label}
                    <span aria-hidden className="text-gray-400">×</span>
                </button>
            ))}
        </div>
    );
}

/** A labelled control inside a filter panel. */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {label}
            </span>
            {children}
        </label>
    );
}
