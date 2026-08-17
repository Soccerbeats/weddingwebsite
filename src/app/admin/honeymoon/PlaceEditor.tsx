'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SOURCE_MANUAL, sourceLabel, sourcesOf, type Place, type PlaceLink, type PlaceStatus } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import {
    Button, CategorySelect, CustomisableSelect, ManageListModal, Modal, StatusSelect,
    TextArea, TextField,
} from './ui';

// Leaflet reaches for `window` at import time, so the preview map never joins
// the server bundle.
const PinMap = dynamic(() => import('./PinMap'), {
    ssr: false,
    loading: () => <div className="h-52 w-full rounded-2xl bg-gray-100 animate-pulse" />,
});

/** Matches a bare "lat, lng" so a pasted pair resolves without pressing Find. */
const coordPair = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

interface GeocodeHit {
    label: string;
    lat: number;
    lng: number;
    precision: 'exact' | 'geocoded';
    /** Present when the hit came from a pasted Google Maps link. */
    name?: string;
    address?: string;
    url?: string;
}

/**
 * Create/edit a place.
 *
 * The coordinate box accepts all three input styles the API supports — a name
 * to search, a Google Maps link to paste, or raw "lat, lng" — because in
 * practice you reach for whichever is closest to hand.
 */
export default function PlaceEditor({ api, place, open, onClose }: {
    api: HoneymoonApi;
    /** null means "create new". */
    place: Place | null;
    open: boolean;
    onClose: () => void;
}) {
    const editing = place != null;

    const [name, setName] = useState('');
    const [category, setCategory] = useState('misc');
    const [regionId, setRegionId] = useState<string>('');
    const [status, setStatus] = useState<PlaceStatus>('idea');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [priceNote, setPriceNote] = useState('');
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [needsReview, setNeedsReview] = useState(false);
    const [links, setLinks] = useState<PlaceLink[]>([]);
    const [source, setSource] = useState(SOURCE_MANUAL);
    const [managing, setManaging] = useState<'categories' | 'regions' | null>(null);

    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<GeocodeHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const searchSeq = useRef(0);

    /* Load the incoming place into the form each time the modal opens. */
    useEffect(() => {
        if (!open) return;
        setName(place?.name ?? '');
        setCategory(place?.category ?? 'misc');
        setRegionId(place?.region_id != null ? String(place.region_id) : '');
        setStatus(place?.status ?? 'idea');
        setDescription(place?.description ?? '');
        setAddress(place?.address ?? '');
        setPriceNote(place?.price_note ?? '');
        setLat(place?.lat ?? null);
        setLng(place?.lng ?? null);
        setNeedsReview(place?.needs_review ?? false);
        setLinks(place?.links ?? []);
        setSource(place ? sourceLabel(place.source) : SOURCE_MANUAL);
        setQuery('');
        setHits([]);
        setLookupError('');
    }, [open, place]);

    const lookup = useCallback(async (raw: string) => {
        const term = raw.trim();
        if (!term) { setHits([]); return; }

        // Guard against an earlier slow request landing after a later one and
        // overwriting fresher results.
        const seq = ++searchSeq.current;
        setSearching(true);
        setLookupError('');
        try {
            const res = await fetch(`/api/admin/honeymoon/geocode?q=${encodeURIComponent(term)}`);
            const body = await res.json();
            if (seq !== searchSeq.current) return;
            setHits(body.results ?? []);
            if (body.error) setLookupError(body.error);
            else if (!body.results?.length) setLookupError('No matches. Try adding the town, or paste a Google Maps link.');
        } catch {
            if (seq === searchSeq.current) setLookupError('Lookup failed.');
        } finally {
            if (seq === searchSeq.current) setSearching(false);
        }
    }, []);

    /**
     * Take everything a hit can give us.
     *
     * A pasted Google Maps link carries a name, an address and the link itself —
     * retyping all three when they arrived in one paste is busywork. Existing
     * values are never clobbered: if you already typed a name, the link's name
     * loses.
     */
    const applyHit = (hit: GeocodeHit) => {
        setLat(hit.lat);
        setLng(hit.lng);
        // Placing a pin deliberately is exactly what clears the review flag.
        setNeedsReview(false);

        if (!name.trim() && hit.name) setName(hit.name);
        if (!address.trim()) {
            if (hit.address) setAddress(hit.address);
            else if (hit.precision === 'geocoded') setAddress(hit.label);
        }
        if (hit.url) {
            // Don't stack duplicates if the same link is pasted twice.
            setLinks((prev) => (prev.some((l) => l.url === hit.url)
                ? prev
                : [...prev, { label: 'Google Maps', url: hit.url! }]));
        }

        setHits([]);
        setQuery('');
    };

    /** A pasted or dropped link should just work, without hunting for Find. */
    const autoLookup = (value: string) => {
        setQuery(value);
        const trimmed = value.trim();
        if (/^https?:\/\//i.test(trimmed) || coordPair.test(trimmed)) lookup(trimmed);
    };

    const save = async () => {
        if (!name.trim()) return;
        const payload: Record<string, unknown> = {
            name: name.trim(),
            category,
            region_id: regionId === '' ? null : Number(regionId),
            status,
            description: description.trim(),
            address: address.trim(),
            price_note: priceNote.trim(),
            lat, lng,
            needs_review: needsReview,
            links: links.filter((l) => l.url.trim()),
            source: source.trim() || SOURCE_MANUAL,
        };
        const ok = editing
            ? await api.update('places', { id: place.id, ...payload })
            : await api.create('places', payload);
        if (ok) onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title={editing ? 'Edit place' : 'Add a place'} wide>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
                    <TextField
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tukad Cepung Waterfall"
                        autoFocus={!editing}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                        <CategorySelect
                            value={category}
                            places={api.data?.places ?? []}
                            onChange={setCategory}
                            onManage={() => setManaging('categories')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Region</label>
                        <CustomisableSelect
                            label="Region"
                            value={regionId}
                            placeholder="Nusa Penida, Gili Islands…"
                            options={[
                                { key: '', label: '— none —' },
                                ...(api.data?.regions ?? []).map((r) => ({
                                    key: String(r.id), label: r.name,
                                })),
                            ]}
                            onChange={setRegionId}
                            onCreate={async (typed) => {
                                // A region is a real row, so it has to exist before it
                                // can be selected. Reuse an existing one on a name
                                // match rather than creating a near-duplicate.
                                const existing = (api.data?.regions ?? []).find(
                                    (r) => r.name.toLowerCase() === typed.toLowerCase(),
                                );
                                if (existing) return String(existing.id);
                                // Inherit whatever country the trip is focused on, so a
                                // region added mid-filter isn't born invisible.
                                const created = await api.createRegion(
                                    typed, api.data?.trip.focus_country || '',
                                );
                                return created == null ? null : String(created);
                            }}
                            onManage={() => setManaging('regions')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                        <StatusSelect value={status} onChange={(e) => setStatus(e.target.value as PlaceStatus)} />
                    </div>
                </div>

                {/* ---- Location ---- */}
                <div className="rounded-2xl border border-gray-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-gray-500">Location</label>
                        {lat != null && lng != null ? (
                            <span className="text-[11px] text-gray-400 tabular-nums">
                                {lat.toFixed(5)}, {lng.toFixed(5)}
                            </span>
                        ) : (
                            <span className="text-[11px] text-amber-600">Not pinned</span>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <TextField
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(query); } }}
                            onPaste={(e) => {
                                const text = e.clipboardData.getData('text');
                                if (!text) return;
                                e.preventDefault();
                                autoLookup(text);
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                // Dragging a link from the browser gives text/uri-list;
                                // dragging selected text gives text/plain.
                                const text = e.dataTransfer.getData('text/uri-list')
                                    || e.dataTransfer.getData('text');
                                if (!text) return;
                                e.preventDefault();
                                autoLookup(text.trim());
                            }}
                            placeholder="Search a name, or paste/drop a Google Maps link"
                        />
                        <Button onClick={() => lookup(query)} disabled={searching || !query.trim()}>
                            {searching ? '…' : 'Find'}
                        </Button>
                    </div>

                    {lookupError && <p className="text-xs text-amber-700">{lookupError}</p>}

                    {hits.length > 0 && (
                        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 overflow-hidden">
                            {hits.map((hit, i) => (
                                <li key={`${hit.lat},${hit.lng},${i}`}>
                                    <button
                                        onClick={() => applyHit(hit)}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                                    >
                                        <div className="text-sm text-gray-800 line-clamp-2">{hit.label}</div>
                                        <div className="text-[11px] text-gray-400 tabular-nums">
                                            {hit.lat.toFixed(5)}, {hit.lng.toFixed(5)}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Confirming a pin you can't see is a coin flip, so the map
                        appears as soon as there is a coordinate to show. */}
                    {lat != null && lng != null && (
                        <>
                            <PinMap
                                lat={lat}
                                lng={lng}
                                category={category}
                                onChange={(nextLat, nextLng) => {
                                    setLat(nextLat);
                                    setLng(nextLng);
                                    // Placing the pin by hand IS the confirmation.
                                    setNeedsReview(false);
                                }}
                            />
                            <p className="text-[11px] text-gray-400">
                                Drag the pin or click the map to move it.
                            </p>
                        </>
                    )}

                    {needsReview && lat != null ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl
                            bg-amber-50 px-3 py-2">
                            <span className="text-xs text-amber-800">
                                Placed automatically — check the map above before trusting it.
                            </span>
                            <Button onClick={() => setNeedsReview(false)}>Looks right</Button>
                        </div>
                    ) : needsReview ? (
                        <div className="rounded-2xl bg-amber-50 px-3 py-2">
                            <span className="text-xs text-amber-800">
                                No pin yet — search above, or paste a Google Maps link.
                            </span>
                        </div>
                    ) : null}

                    {lat != null && (
                        <button
                            onClick={() => { setLat(null); setLng(null); }}
                            className="text-xs text-gray-400 hover:text-rose-600"
                        >
                            Clear pin
                        </button>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                    <TextArea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Light rays between 9 and 11am."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                        <TextField value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Source</label>
                        <TextField
                            list="honeymoon-sources"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            placeholder="Who suggested this?"
                        />
                        <datalist id="honeymoon-sources">
                            {sourcesOf(api.data?.places ?? []).map((s) => (
                                <option key={s} value={s} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Price note</label>
                        <TextField
                            value={priceNote}
                            onChange={(e) => setPriceNote(e.target.value)}
                            placeholder="~500k IDR entry"
                        />
                    </div>
                </div>

                {/* ---- Links ---- */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Links</label>
                    <div className="space-y-2">
                        {links.map((link, i) => (
                            <div key={i} className="flex gap-2">
                                <TextField
                                    value={link.label}
                                    placeholder="Website"
                                    className="md:max-w-[10rem]"
                                    onChange={(e) => setLinks(links.map((l, j) =>
                                        j === i ? { ...l, label: e.target.value } : l))}
                                />
                                <TextField
                                    value={link.url}
                                    placeholder="https://…"
                                    onChange={(e) => setLinks(links.map((l, j) =>
                                        j === i ? { ...l, url: e.target.value } : l))}
                                />
                                <Button tone="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                                    ✕
                                </Button>
                            </div>
                        ))}
                        <Button onClick={() => setLinks([...links, { label: '', url: '' }])}>
                            + Add link
                        </Button>
                    </div>
                </div>

                <ManageListModal
                    open={managing === 'categories'}
                    onClose={() => setManaging(null)}
                    title="Edit categories"
                    hint="Renaming keeps every place filed under it. Deleting moves them to Other."
                    items={(api.data?.categories ?? []).map((c) => {
                        const used = (api.data?.places ?? [])
                            .filter((p) => p.category === c.key).length;
                        return {
                            id: c.id,
                            // Label only — what you edit is exactly what is stored.
                            label: c.label,
                            detail: `${c.icon}  ${used ? `${used} place${used === 1 ? '' : 's'}` : 'unused'}`,
                            warn: used
                                ? `Delete "${c.label}"? ${used} place(s) will move to Other.`
                                : `Delete "${c.label}"?`,
                            locked: c.key === 'misc'
                                ? 'Other is the fallback category'
                                : undefined,
                        };
                    })}
                    onRename={(id, label) => api.update('categories', { id, label })}
                    onDelete={(id) => api.remove('categories', id)}
                />

                <ManageListModal
                    open={managing === 'regions'}
                    onClose={() => setManaging(null)}
                    title="Edit regions"
                    hint="Renaming keeps every place in it. Deleting leaves the places but clears their region."
                    items={(api.data?.regions ?? []).map((r) => {
                        const used = (api.data?.places ?? [])
                            .filter((p) => p.region_id === r.id).length;
                        return {
                            id: r.id,
                            label: r.name,
                            detail: used ? `${used} place${used === 1 ? '' : 's'}` : 'unused',
                            warn: used
                                ? `Delete "${r.name}"? ${used} place(s) stay but lose their region.`
                                : `Delete "${r.name}"?`,
                        };
                    })}
                    onRename={(id, name) => api.update('regions', { id, name })}
                    onDelete={(id) => api.remove('regions', id)}
                />

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button tone="primary" onClick={save} disabled={!name.trim()}>
                        {editing ? 'Save' : 'Add place'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
