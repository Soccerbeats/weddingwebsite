'use client';

import { useState } from 'react';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, MiniSelect } from './ui';

/**
 * A set of filters, named and kept.
 *
 * Once the tab remembers your filters, naming a combination is small and
 * obviously useful: "Ubud eats", "unpinned South Bali", "everything Amy
 * suggested that I haven't rated". Stored on the trip rather than in the browser
 * because a named view is a thing about the trip, and you want it on the laptop
 * and the phone.
 */
export default function SavedViews({ api, current, onApply, tab = 'places' }: {
    api: HoneymoonApi;
    /** The filters as they are right now, for "save this". */
    current: Record<string, unknown>;
    onApply: (filters: Record<string, unknown>) => void;
    tab?: string;
}) {
    const views = (api.data?.views ?? []).filter((view) => view.tab === tab);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');

    const save = async () => {
        const clean = name.trim();
        if (!clean) return;
        const existing = views.find((view) => view.name.toLowerCase() === clean.toLowerCase());
        if (existing) await api.update('views', { id: existing.id, filters: current });
        else await api.create('views', { name: clean, tab, filters: current });
        setName('');
        setNaming(false);
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {views.length > 0 && (
                <MiniSelect
                    value=""
                    aria-label="Saved views"
                    onChange={(e) => {
                        const view = views.find((row) => String(row.id) === e.target.value);
                        if (view) onApply(view.filters);
                    }}
                >
                    <option value="">Saved views…</option>
                    {views.map((view) => (
                        <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                </MiniSelect>
            )}
            {naming ? (
                <span className="flex items-center gap-1.5">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                        placeholder="Ubud eats"
                        autoFocus
                        className="w-32 rounded-full border border-gray-200 bg-gray-50 px-3 py-1
                            text-xs focus:bg-white focus:outline-none focus:ring-2
                            focus:ring-accent/30"
                    />
                    <Button onClick={save} disabled={!name.trim()}>Save</Button>
                    <Button tone="ghost" onClick={() => setNaming(false)}>Cancel</Button>
                </span>
            ) : (
                <Button onClick={() => setNaming(true)}>Save this view</Button>
            )}
            {views.length > 0 && (
                <MiniSelect
                    value=""
                    aria-label="Delete a saved view"
                    onChange={(e) => {
                        const view = views.find((row) => String(row.id) === e.target.value);
                        if (view) api.removeRow('views', view, `Removed “${view.name}”`);
                    }}
                >
                    <option value="">Remove a view…</option>
                    {views.map((view) => (
                        <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                </MiniSelect>
            )}
        </div>
    );
}
