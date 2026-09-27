'use client';

import {
    ALL_DIET_CODES, DIET_LABELS, dietNote, isOn, setNote, toggleRestriction,
    type DietCode, type DietaryEntry,
} from '@/lib/dietary';

/**
 * One person's dietary restrictions, as a row of pills.
 *
 * In the guest editor rather than on the RSVP itself, because the answers that
 * need typing in are the ones given in person — and those people often never
 * filled the form at all. Shared with the vendors tab, whose dietary answer is
 * the same shape and wants the same editor: a photographer's nut allergy reaches
 * the kitchen sheet by exactly the route a guest's does.
 */
export default function DietaryPills({ entry, onChange, codes = ALL_DIET_CODES }: {
    entry: DietaryEntry;
    onChange: (entry: DietaryEntry) => void;
    /**
     * Which answers to offer. Everything, by default. Vendors are given the
     * restrictions alone: a kids' meal for the DJ is nonsense, and "not eating"
     * is already their *Needs a meal* checkbox — two controls for one fact is
     * how the two come to disagree.
     */
    codes?: readonly DietCode[];
}) {
    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {codes.map(code => {
                const on = isOn(entry, code);
                return (
                    <button
                        key={code}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(toggleRestriction(entry, code))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            on
                                ? code === 'NOM' ? 'bg-slate-600 text-white' : 'bg-gray-900 text-white'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                    >
                        {DIET_LABELS[code]}
                    </button>
                );
            })}
            {isOn(entry, 'NOM') && (
                <span className="w-full text-[10px] text-gray-400 leading-snug">
                    Takes a chair, but no plate — they are left out of the meal counts.
                </span>
            )}
            {isOn(entry, 'OTH') && (
                <input
                    type="text"
                    value={dietNote(entry)}
                    onChange={e => onChange(setNote(entry, e.target.value))}
                    placeholder="What should the kitchen know?"
                    className="flex-1 min-w-[12rem] px-3 py-1.5 border border-gray-200 rounded-full bg-gray-50 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
                />
            )}
        </div>
    );
}
