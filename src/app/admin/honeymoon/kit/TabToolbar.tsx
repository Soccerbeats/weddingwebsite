'use client';

/**
 * The bar at the top of every tab: view switches on the left, the one primary
 * action and the ⋯ menu on the right.
 *
 * Sticky to the top of the shell's scroll container, so the controls of a long
 * page stay where your hand is. The itinerary's view switch scrolled away with
 * the first day card; this is the fix for every tab at once rather than one.
 * The negative margin lets the frosted background run edge to edge across the
 * page's own gutter.
 */
export function TabToolbar({ left, right, below, className = '', stickyOnPhone = false }: {
    left?: React.ReactNode;
    right?: React.ReactNode;
    /** A second line — active filter chips, a status note. */
    below?: React.ReactNode;
    className?: string;
    /**
     * Stay pinned on a phone too. Off by default: a toolbar that wraps to three
     * rows on a 390px screen would hold a third of it hostage. The itinerary
     * turns it on, because its day strip is the thing you navigate by.
     */
    stickyOnPhone?: boolean;
}) {
    return (
        <div
            data-tab-toolbar
            className={`${stickyOnPhone ? 'sticky' : 'relative md:sticky'} top-0 z-20 -mx-4 md:-mx-6 mb-3 border-b border-gray-200/70
                bg-gray-50/90 px-4 md:px-6 py-2 backdrop-blur ${className}`}
        >
            <div className="flex flex-wrap items-center gap-2">
                {left && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{left}</div>}
                <div className="hidden md:block md:flex-1" />
                {right && (
                    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">{right}</div>
                )}
            </div>
            {below && <div className="mt-2">{below}</div>}
        </div>
    );
}
