'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchHoneymoon, type SearchHit } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import { Modal } from './ui';

const BASE = '/admin/honeymoon';

const KIND_LABEL: Record<SearchHit['kind'], string> = {
    place: 'Place',
    region: 'Region',
    note: 'Guide',
    todo: 'To do',
    day: 'Day',
};

const KIND_HREF: Record<SearchHit['kind'], string> = {
    place: `${BASE}/places`,
    region: `${BASE}/guide`,
    note: `${BASE}/guide`,
    todo: `${BASE}/checklist`,
    day: `${BASE}/itinerary`,
};

/**
 * Find anything, from anywhere.
 *
 * The Places tab has always had a search box and nothing else has, so a guide
 * note or a to-do could only be found by first remembering which tab it was on.
 * With a couple of hundred places and a dozen notes that stops being a
 * reasonable thing to ask of anyone.
 *
 * Opening a *place* opens its editor right here rather than routing to the
 * Places tab and leaving you to find the row — the point of a search result is
 * to be the destination.
 */
export default function SearchPalette({ api, open, onClose }: {
    api: HoneymoonApi;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [editingPlace, setEditingPlace] = useState<number | null>(null);

    const go = (hit: SearchHit) => {
        onClose();
        // A place opens where you are; everything else lives on a tab, and the
        // tab is where you can act on it.
        if (hit.kind === 'place') setEditingPlace(hit.id);
        else router.push(KIND_HREF[hit.kind]);
    };

    const place = editingPlace == null ? null : api.placeById.get(editingPlace) ?? null;

    return (
        <>
            <Modal open={open} onClose={onClose} title="Find anything">
                {/* The query lives in here, which only exists while the dialog is
                    open — so re-opening starts blank with no reset logic. */}
                <SearchBody api={api} onPick={go} />
            </Modal>

            <PlaceEditor
                api={api}
                place={place}
                open={place != null}
                onClose={() => setEditingPlace(null)}
            />
        </>
    );
}

function SearchBody({ api, onPick }: { api: HoneymoonApi; onPick: (hit: SearchHit) => void }) {
    const [term, setTerm] = useState('');
    const [cursor, setCursor] = useState(0);
    const listRef = useRef<HTMLUListElement | null>(null);

    const hits = useMemo(() => {
        if (!api.data) return [];
        return searchHoneymoon(term, {
            places: api.data.places,
            notes: api.data.notes,
            todos: api.data.todos,
            days: api.data.days,
            regions: api.data.regions,
        });
    }, [term, api.data]);

    // Clamped rather than trusted: results shrink as you type, and a stale
    // cursor past the end would make Enter open nothing.
    const active = hits.length ? Math.min(cursor, hits.length - 1) : 0;

    // Keep the highlighted row visible while arrowing down a long list.
    useEffect(() => {
        listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    return (
        <div
            onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCursor(Math.min(active + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCursor(Math.max(active - 1, 0));
                } else if (e.key === 'Enter' && hits[active]) {
                    e.preventDefault();
                    onPick(hits[active]);
                }
            }}
        >
            <input
                autoFocus
                value={term}
                onChange={(e) => { setTerm(e.target.value); setCursor(0); }}
                placeholder="Places, guide notes, to-dos, days…"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5
                    text-base focus:outline-none focus:ring-2 focus:ring-accent/30
                    focus:border-accent/40"
            />

            {term.trim().length < 2 ? (
                <p className="text-xs text-gray-400 mt-3 px-1">
                    Type at least two letters. ↑↓ to move, Enter to open, Esc to close.
                </p>
            ) : hits.length === 0 ? (
                <p className="text-sm text-gray-500 mt-3 px-1">
                    Nothing matches &ldquo;{term.trim()}&rdquo;.
                </p>
            ) : (
                <ul ref={listRef} className="mt-3 max-h-[50vh] overflow-auto -mx-1">
                    {hits.map((hit, index) => (
                        <li key={`${hit.kind}-${hit.id}`}>
                            <button
                                onClick={() => onPick(hit)}
                                onMouseEnter={() => setCursor(index)}
                                className={`w-full text-left rounded-xl px-3 py-2 flex items-center gap-3
                                    ${index === active ? 'bg-accent/10' : 'hover:bg-gray-50'}`}
                            >
                                <span className="text-[10px] uppercase tracking-wide font-semibold
                                    text-gray-400 w-12 shrink-0">
                                    {KIND_LABEL[hit.kind]}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-gray-900 truncate">
                                        {hit.label}
                                    </span>
                                    <span className="block text-[11px] text-gray-400 truncate">
                                        {hit.detail}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
