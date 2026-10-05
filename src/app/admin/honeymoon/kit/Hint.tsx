'use client';

import { Popover } from './Popover';

/**
 * ⓘ — help text you ask for, rather than help text in the way.
 *
 * The portal had a paragraph of explanation under half its controls. Kept, but
 * behind a tap: on a phone those paragraphs were wrapping into a one-word-wide
 * column beside the buttons they described.
 */
export function Hint({ children, label = 'What is this?' }: { children: React.ReactNode; label?: string }) {
    return (
        <Popover
            label={label}
            buttonClassName="inline-flex size-11 md:size-7 shrink-0 items-center justify-center rounded-full
                text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            buttonContent={() => (
                <span className="flex size-5 items-center justify-center rounded-full border border-current
                    text-[11px] font-semibold">
                    i
                </span>
            )}
        >
            {() => <div className="text-sm leading-relaxed text-gray-700">{children}</div>}
        </Popover>
    );
}
