'use client';

import { RATINGS, type PlaceRating } from '@/lib/honeymoon';

/**
 * 👍 😐 👎 — the shared verdict on a place.
 *
 * Built four times before (Places, Stays, Excursions, the map) with four sets
 * of padding. Clicking the one that is on clears it.
 */
export function RatingPills({ value, onChange, size = 'sm', labels = true }: {
    value: PlaceRating;
    onChange: (next: PlaceRating) => void;
    size?: 'sm' | 'md';
    /** Icons only, for a tight row. */
    labels?: boolean;
}) {
    return (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rating">
            {RATINGS.map((rating) => {
                const on = value === rating.key;
                return (
                    <button
                        key={rating.key}
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onChange(on ? null : rating.key); }}
                        aria-pressed={on}
                        title={rating.label}
                        className={`min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-full border font-medium transition active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                            ${size === 'md' ? 'px-3.5 py-1.5 text-sm' : 'px-3 py-1 text-xs'}
                            ${on ? 'border-transparent text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                        style={on ? { backgroundColor: rating.color } : undefined}
                    >
                        {rating.icon}{labels && <> {rating.label}</>}
                    </button>
                );
            })}
        </div>
    );
}
