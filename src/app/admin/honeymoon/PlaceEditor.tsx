'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    SOURCE_MANUAL, countriesInUse, sourceLabel, sourcesOf,
    type Place, type PlaceLink, type PlaceStatus,
} from '@/lib/honeymoon';
import BookingPanel from './BookingPanel';
import type { HoneymoonApi } from './useHoneymoon';
import {
    Button, CategorySelect, CustomisableSelect, ManageListModal, Modal, SelectField, StatusSelect,
    TextArea, TextField,
} from './ui';

// Leaflet reaches for `window` at import time, so the preview map never joins
// the server bundle.
const PinMap = dynamic(() => import('./PinMap'), {
    ssr: false,
    loading: () => <div className="h-48 w-full rounded-2xl bg-gray-100 animate-pulse" />,
});

/** Every editable field, in one comparable string. */
function fingerprint(form: {
    name: string; category: string; regionId: string; status: string; description: string;
    address: string; priceNote: string; lat: number | null; lng: number | null;
    needsReview: boolean; links: PlaceLink[]; source: string; country: string;
    cost: string; costPer: string; openingHours: string; bestTime: string;
}): string {
    return JSON.stringify([
        form.name, form.category, form.regionId, form.status, form.description, form.address,
        form.priceNote, form.lat, form.lng, form.needsReview, form.links, form.source, form.country,
        form.cost, form.costPer, form.openingHours, form.bestTime,
    ]);
}

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
    /** From OSM's extratags, on a search that was happening anyway. */
    opening_hours?: string;
    phone?: string;
    website?: string;
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
    const [country, setCountry] = useState('');
    const [cost, setCost] = useState('');
    const [costPer, setCostPer] = useState<'night' | 'person' | 'total'>('total');
    const [openingHours, setOpeningHours] = useState('');
    const [bestTime, setBestTime] = useState('');
    const [managing, setManaging] = useState<'categories' | 'regions' | null>(null);
    /** Fingerprint of the form as it was opened — see confirmDiscard. */
    const pristine = useRef('');

    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<GeocodeHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const searchSeq = useRef(0);

    /**
     * Load the incoming place into the form each time the modal opens, and
     * record what "untouched" looks like.
     *
     * The snapshot has to be taken from the same values being written here, not
     * from state read on a later render: state updates are queued, so reading it
     * afterwards captures the *previous* form and every dialog would then look
     * dirty the moment it opened.
     */
    useEffect(() => {
        if (!open) return;
        const initial = {
            name: place?.name ?? '',
            category: place?.category ?? 'misc',
            regionId: place?.region_id != null ? String(place.region_id) : '',
            status: place?.status ?? 'idea',
            description: place?.description ?? '',
            address: place?.address ?? '',
            priceNote: place?.price_note ?? '',
            lat: place?.lat ?? null,
            lng: place?.lng ?? null,
            needsReview: place?.needs_review ?? false,
            links: place?.links ?? [],
            source: place ? sourceLabel(place.source) : SOURCE_MANUAL,
            country: place?.country ?? '',
            cost: place?.cost != null ? String(place.cost) : '',
            costPer: place?.cost_per ?? 'total',
            openingHours: place?.opening_hours ?? '',
            bestTime: place?.best_time ?? '',
        };
        setName(initial.name);
        setCategory(initial.category);
        setRegionId(initial.regionId);
        setStatus(initial.status as PlaceStatus);
        setDescription(initial.description);
        setAddress(initial.address);
        setPriceNote(initial.priceNote);
        setLat(initial.lat);
        setLng(initial.lng);
        setNeedsReview(initial.needsReview);
        setLinks(initial.links);
        setSource(initial.source);
        setCountry(initial.country);
        setCost(initial.cost);
        setCostPer(initial.costPer as 'night' | 'person' | 'total');
        setOpeningHours(initial.openingHours);
        setBestTime(initial.bestTime);
        setQuery('');
        setHits([]);
        setLookupError('');
        pristine.current = fingerprint(initial);
    }, [open, place]);

    /** What this place would count as if it just followed its region. */
    const inheritedCountry = (api.data?.regions ?? [])
        .find((r) => String(r.id) === regionId)?.country?.trim() ?? '';

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
        // OSM's extras, taken only where the field is still empty: a hit should
        // fill in blanks, never overwrite something you typed.
        if (hit.opening_hours && !openingHours.trim()) setOpeningHours(hit.opening_hours);
        if (hit.website) {
            setLinks((prev) => (prev.some((l) => l.url === hit.website)
                ? prev
                : [...prev, { label: 'Website', url: hit.website! }]));
        }
        if (hit.phone && !description.includes(hit.phone)) {
            setDescription((prev) => (prev.trim() ? prev : `Phone: ${hit.phone}`));
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

    /**
     * Is the form still as it was opened?
     *
     * Closing this dialog used to throw away everything typed into it without a
     * word — a stray Escape or a mis-aimed click and the notes you just wrote
     * were gone. Comparing a fingerprint of the form against the one taken when
     * it opened tells "nothing happened" from "you are about to lose work", and
     * only the second one is worth interrupting anyone for.
     */
    const confirmDiscard = useCallback(() => {
        const now = fingerprint({
            name, category, regionId, status, description, address, priceNote,
            lat, lng, needsReview, links, source, country, cost, costPer, openingHours, bestTime,
        });
        if (now === pristine.current) return true;
        return confirm('Discard your changes to this place?');
    }, [name, category, regionId, status, description, address, priceNote,
        lat, lng, needsReview, links, source, country, cost, costPer, openingHours, bestTime]);

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
            country: country.trim(),
            // A blank cost is "not priced yet", which is not zero — the coercion
            // in the route turns '' into NULL and keeps that distinction.
            cost: cost.trim(),
            cost_per: costPer,
            opening_hours: openingHours.trim(),
            best_time: bestTime.trim(),
        };
        const ok = editing
            ? await api.update('places', { id: place.id, ...payload })
            : await api.create('places', payload);
        if (ok) onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            guard={confirmDiscard}
            title={editing ? 'Edit place' : 'Add a place'}
            wide
        >
            {/* Two columns from lg up, and tight spacing throughout: this dialog
                has to fit a laptop screen without a scrollbar, and stacking the
                map above the notes made it about twice as tall as it needed to
                be while the space beside the map sat empty. */}
            <div
                className="space-y-3"
                // Save without reaching for the mouse. Plain Enter can't do it —
                // this form has a search box where Enter means "look that up".
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
                }}
            >
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
                    <TextField
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tukad Cepung Waterfall"
                        autoFocus={!editing}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                        <CategorySelect
                            value={category}
                            places={api.data?.places ?? []}
                            onChange={setCategory}
                            onCreateCategory={api.createCategory}
                            onManage={() => setManaging('categories')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Country</label>
                        <CustomisableSelect
                            label="Country"
                            value={country}
                            placeholder="Indonesia, Singapore…"
                            options={[
                                {
                                    key: '',
                                    // Named rather than blank so it is obvious this is
                                    // inheritance, not "no country".
                                    label: inheritedCountry
                                        ? `— from region (${inheritedCountry}) —`
                                        : '— none —',
                                },
                                ...countriesInUse(api.data?.regions ?? [], api.data?.places ?? [])
                                    .map((c) => ({ key: c, label: c })),
                            ]}
                            onChange={setCountry}
                            onCreate={(typed) => typed.trim()}
                        />
                        {country && inheritedCountry && country !== inheritedCountry && (
                            <p className="text-[11px] text-amber-700 mt-1">
                                Overrides its region ({inheritedCountry}).
                            </p>
                        )}
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
                                    key: String(r.id),
                                    label: r.country ? `${r.name} · ${r.country}` : `${r.name} · no country`,
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                    {/* ---- Location ---- */}
                    <div className="rounded-2xl border border-gray-200 p-3 space-y-2.5">
                        {/* Coordinates and Clear pin share the header line — both
                            are about the pin, and giving Clear pin a row of its
                            own cost more height than the control is worth. */}
                        <div className="flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-gray-500">Location</label>
                            {lat != null && lng != null ? (
                                <span className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400 tabular-nums">
                                        {lat.toFixed(5)}, {lng.toFixed(5)}
                                    </span>
                                    <button
                                        onClick={() => { setLat(null); setLng(null); }}
                                        className="text-[11px] text-gray-400 hover:text-rose-600"
                                    >
                                        Clear pin
                                    </button>
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

                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                            <TextArea
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Light rays between 9 and 11am."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                            <TextField value={address} onChange={(e) => setAddress(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                        {/* ---- The numbers the budget can add up ---- */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Cost ({api.data?.trip.home_currency || 'USD'})
                                </label>
                                <TextField
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={cost}
                                    onChange={(e) => setCost(e.target.value)}
                                    placeholder="420"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    A number the trip total can use. The note above stays for the
                                    detail — &ldquo;breakfast included&rdquo; is not arithmetic.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Per
                                </label>
                                <SelectField
                                    value={costPer}
                                    onChange={(e) => setCostPer(
                                        e.target.value as 'night' | 'person' | 'total',
                                    )}
                                >
                                    <option value="total">Total</option>
                                    <option value="night">Per night</option>
                                    <option value="person">Per person</option>
                                </SelectField>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Opening hours
                                </label>
                                <TextField
                                    value={openingHours}
                                    onChange={(e) => setOpeningHours(e.target.value)}
                                    placeholder="Mo-Su 09:00-18:00"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    OSM syntax, filled in from the map search when it knows. The
                                    itinerary warns when a stop falls outside it.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Best time to go
                                </label>
                                <TextField
                                    value={bestTime}
                                    onChange={(e) => setBestTime(e.target.value)}
                                    placeholder="Sunrise · avoid weekends"
                                />
                            </div>
                        </div>

                        {/* ---- Booking ----
                            Only for a place that exists: a booking hangs off a
                            place_id, and there isn't one until the first save. */}
                        {editing && (status === 'booked' || place?.is_excursion) && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                    Booking
                                </label>
                                <BookingPanel
                                    api={api}
                                    kind={place?.is_excursion ? 'excursion' : 'stay'}
                                    placeId={place.id}
                                    compact
                                />
                            </div>
                        )}

                        {/* ---- Links ---- */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Links</label>
                            <div className="space-y-2">
                                {links.map((link, i) => (
                                    <div key={i} className="flex gap-2">
                                        <TextField
                                            value={link.label}
                                            placeholder="Website"
                                            className="max-w-[8rem]"
                                            onChange={(e) => setLinks(links.map((l, j) =>
                                                j === i ? { ...l, label: e.target.value } : l))}
                                        />
                                        <TextField
                                            value={link.url}
                                            placeholder="https://…"
                                            onChange={(e) => setLinks(links.map((l, j) =>
                                                j === i ? { ...l, url: e.target.value } : l))}
                                        />
                                        <Button
                                            tone="ghost"
                                            onClick={() => setLinks(links.filter((_, j) => j !== i))}
                                        >
                                            ✕
                                        </Button>
                                    </div>
                                ))}
                                <Button onClick={() => setLinks([...links, { label: '', url: '' }])}>
                                    + Add link
                                </Button>
                            </div>
                        </div>
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
                    <Button onClick={() => { if (confirmDiscard()) onClose(); }}>Cancel</Button>
                    <Button tone="primary" onClick={save} disabled={!name.trim()}>
                        {editing ? 'Save' : 'Add place'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
