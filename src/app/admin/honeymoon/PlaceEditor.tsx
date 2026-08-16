'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SOURCE_MANUAL, sourceLabel, sourcesOf, type Place, type PlaceLink, type PlaceStatus } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import {
    Button, CategorySelect, Modal, SelectField, StatusSelect, TextArea, TextField,
} from './ui';

// Leaflet reaches for `window` at import time, so the preview map never joins
// the server bundle.
const PinMap = dynamic(() => import('./PinMap'), {
    ssr: false,
    loading: () => <div className="h-52 w-full rounded-2xl bg-gray-100 animate-pulse" />,
});

interface GeocodeHit {
    label: string;
    lat: number;
    lng: number;
    precision: 'exact' | 'geocoded';
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

    const applyHit = (hit: GeocodeHit) => {
        setLat(hit.lat);
        setLng(hit.lng);
        // Confirming a pin by hand is exactly what clears the review flag.
        setNeedsReview(false);
        if (!address && hit.precision === 'geocoded') setAddress(hit.label);
        setHits([]);
        setQuery('');
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
                        <CategorySelect value={category} onChange={(e) => setCategory(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Region</label>
                        <SelectField value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                            <option value="">— none —</option>
                            {(api.data?.regions ?? []).map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </SelectField>
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
                            placeholder="Search a name, paste a Google Maps link, or type lat, lng"
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
