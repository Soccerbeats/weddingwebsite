'use client';

/**
 * One segmented control for the whole portal.
 *
 * Replaces the three hand-rolled versions (the itinerary's view switch, the
 * stays view switch, the Stacked/Clock pair) and the rows of filter pills that
 * did the same job. A real radio group under the hood: `aria-pressed` on each
 * button, and it scrolls sideways rather than wrapping when it runs out of room
 * on a phone.
 */
export interface SegmentedOption<T extends string> {
    key: T;
    label: React.ReactNode;
    count?: number;
    title?: string;
}

export function Segmented<T extends string>({
    value, onChange, options, ariaLabel, tone = 'accent', size = 'md',
}: {
    value: T;
    onChange: (next: T) => void;
    options: SegmentedOption<T>[];
    ariaLabel: string;
    tone?: 'accent' | 'dark';
    size?: 'sm' | 'md';
}) {
    const on = tone === 'dark' ? 'bg-gray-900 text-white' : 'bg-accent text-white';
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            data-segmented={ariaLabel}
            className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-full border
                border-gray-200 bg-white p-0.5 [scrollbar-width:none]"
        >
            {options.map((option) => {
                const active = option.key === value;
                return (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => onChange(option.key)}
                        aria-pressed={active}
                        title={option.title}
                        className={`shrink-0 whitespace-nowrap rounded-full font-medium transition
                            min-h-11 md:min-h-0
                            ${size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'}
                            ${active ? on : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        {option.label}
                        {option.count != null && (
                            <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>
                                {option.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
