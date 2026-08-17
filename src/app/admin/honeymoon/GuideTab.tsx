'use client';

import { useMemo, useState } from 'react';
import { sourceLabel } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Card, EmptyState, InlineText, OverflowMenu, TextField } from './ui';

/**
 * Know Before You Go, plus the per-region write-ups.
 *
 * This is the half of the travel guide that has no coordinates — the water
 * warning, the exchange rate, the scooter safety brief — so it lives as cards
 * rather than pins, grouped by the category each note carries.
 */
export default function GuideTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [newTitle, setNewTitle] = useState('');
    const [openRegion, setOpenRegion] = useState<number | null>(null);

    // Stable identity so the grouping memo below doesn't rerun every render.
    const notes = useMemo(() => data?.notes ?? [], [data]);
    const regions = data?.regions ?? [];

    /** Grouped by category, with uncategorised last. */
    const grouped = useMemo(() => {
        const map = new Map<string, typeof notes>();
        for (const note of notes) {
            const key = note.category?.trim() || 'General';
            const list = map.get(key);
            if (list) list.push(note); else map.set(key, [note]);
        }
        return [...map.entries()].sort(([a], [b]) => {
            if (a === 'General') return 1;
            if (b === 'General') return -1;
            return a.localeCompare(b);
        });
    }, [notes]);

    const addNote = async () => {
        const title = newTitle.trim();
        if (!title) return;
        await api.create('notes', { title, body: '', category: 'General' });
        setNewTitle('');
    };

    return (
        <div className="space-y-4">
            {/* ---- Regions ---- */}
            <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-2 px-1">Regions</h2>
                {regions.length === 0 ? (
                    <Card>
                        <EmptyState
                            title="No regions yet"
                            hint="Regions group your places and carry the guide's area write-ups."
                        />
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2 items-start">
                        {regions.map((region) => {
                            const count = (data?.places ?? []).filter((p) => p.region_id === region.id).length;
                            const open = openRegion === region.id;
                            return (
                                <Card key={region.id} className="p-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setOpenRegion(open ? null : region.id)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <span className="text-sm font-medium text-gray-900">
                                                {region.name}
                                            </span>
                                            <span className="text-xs text-gray-400 ml-2">
                                                {region.country || (
                                                    <span className="text-sky-700">no country</span>
                                                )} · {count} place{count === 1 ? '' : 's'}
                                            </span>
                                        </button>
                                        <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
                                        <OverflowMenu items={[{
                                            label: 'Delete region',
                                            danger: true,
                                            onClick: () => {
                                                if (confirm(
                                                    `Delete ${region.name}? Its ${count} place(s) stay, but lose their region.`,
                                                )) api.remove('regions', region.id);
                                            },
                                        }]} />
                                    </div>
                                    {open && (
                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                            {/* Country is not cosmetic: it drives the map's
                                                country filter, and a region without one used
                                                to make its places disappear. */}
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] uppercase tracking-wide
                                                    text-gray-400 font-semibold shrink-0">
                                                    Country
                                                </span>
                                                <InlineText
                                                    value={region.country ?? ''}
                                                    placeholder="Indonesia"
                                                    className="text-xs -ml-1 max-w-[14rem]"
                                                    onCommit={(country) => api.update('regions', {
                                                        id: region.id, country,
                                                    })}
                                                />
                                                {!region.country && (
                                                    <span className="text-[11px] text-sky-700 shrink-0">
                                                        not set — hidden from country filters
                                                    </span>
                                                )}
                                            </div>
                                            <InlineText
                                                multiline
                                                value={region.description ?? ''}
                                                placeholder="What's this area like?"
                                                className="text-sm text-gray-600 -ml-2"
                                                onCommit={(description) => api.update('regions', {
                                                    id: region.id, description,
                                                })}
                                            />
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ---- Notes ---- */}
            <section>
                <div className="flex items-center justify-between gap-2 mb-2 px-1">
                    <h2 className="text-sm font-semibold text-gray-900">Know Before You Go</h2>
                </div>

                <Card className="p-3 mb-2">
                    <div className="flex gap-2">
                        <TextField
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                            placeholder="Add a note — visa on arrival, SIM cards…"
                        />
                        <Button tone="primary" onClick={addNote} disabled={!newTitle.trim()}>Add</Button>
                    </div>
                </Card>

                {notes.length === 0 ? (
                    <Card>
                        <EmptyState
                            title="No notes yet"
                            hint="Run npm run seed:honeymoon to load the Bali guide's practical sections."
                        />
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {grouped.map(([category, items]) => (
                            <div key={category}>
                                <h3 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5 px-1">
                                    {category}
                                </h3>
                                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3
                                    gap-2 items-start">
                                    {items.map((note) => (
                                        <Card key={note.id} className="p-3">
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <InlineText
                                                        value={note.title}
                                                        className="font-medium text-gray-900 -ml-2"
                                                        onCommit={(title) => api.update('notes', {
                                                            id: note.id, title,
                                                        })}
                                                    />
                                                    <InlineText
                                                        multiline
                                                        value={note.body}
                                                        placeholder="Details…"
                                                        className="text-sm text-gray-600 -ml-2 mt-0.5"
                                                        onCommit={(body) => api.update('notes', {
                                                            id: note.id, body,
                                                        })}
                                                    />
                                                </div>
                                                <OverflowMenu items={[{
                                                    label: 'Delete note',
                                                    danger: true,
                                                    onClick: () => {
                                                        if (confirm(`Delete "${note.title}"?`)) {
                                                            api.remove('notes', note.id);
                                                        }
                                                    },
                                                }]} />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <InlineText
                                                    value={note.category ?? ''}
                                                    placeholder="Category"
                                                    className="text-[11px] text-gray-400 -ml-2"
                                                    onCommit={(cat) => api.update('notes', {
                                                        id: note.id, category: cat,
                                                    })}
                                                />
                                                <span className="text-[11px] text-gray-300 shrink-0 pr-1">
                                                    {sourceLabel(note.source)}
                                                </span>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
