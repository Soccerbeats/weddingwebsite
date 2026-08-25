'use client';

import { useState } from 'react';
import { travelModeMeta, type TravelLeg } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, TextField } from './ui';

/** One end of a travel leg: what you type, and where that turned out to be. */
interface Hit {
    label: string; lat: number; lng: number; kind?: string;
    /** Which geocoder answered — see the route for why it matters. */
    source?: 'nominatim' | 'photon';
}

/**
 * The From or To of a travel leg, with a lookup.
 *
 * The text and the coordinates are deliberately separate. Finding a place does
 * **not** overwrite what you typed: "DPS" is the right label for a leg and
 * "Ngurah Rai International Airport, Jalan Cucak Rowo, Tuban, Denpasar, Badung,
 * Bali, Indonesia" is not, so the search result becomes the pin and your text
 * stays your text. The one exception is a pasted link, which is nobody's idea of
 * a label — there the found name takes over.
 *
 * The mode goes with the query: a leg's From is looked up as an airport when the
 * leg is a flight and as a ferry terminal when it is a boat, which is the whole
 * reason "DPS" resolves to Bali's airport rather than a boundary in China.
 */
export default function LegEnd({ leg, end, api }: {
    leg: TravelLeg;
    end: 'from' | 'to';
    api: HoneymoonApi;
}) {
    const text = end === 'from' ? leg.from_text : leg.to_text;
    const lat = end === 'from' ? leg.from_lat : leg.to_lat;
    const lng = end === 'from' ? leg.from_lng : leg.to_lng;

    const [draft, setDraft] = useState(text ?? '');
    // Follow the stored text when it changes underneath us (a refetch after a
    // lookup on the other tab); adjusting state during render, per React.
    const [seen, setSeen] = useState(text ?? '');
    if ((text ?? '') !== seen) { setSeen(text ?? ''); setDraft(text ?? ''); }
    const [searching, setSearching] = useState(false);
    const [hits, setHits] = useState<Hit[]>([]);
    const [error, setError] = useState('');

    const meta = travelModeMeta(leg.mode);
    const pinned = lat != null && lng != null;

    const save = (fields: Record<string, unknown>) => api.update('travel', { id: leg.id, ...fields });

    const lookup = async () => {
        const term = draft.trim();
        if (!term) return;
        setSearching(true);
        setError('');
        setHits([]);
        try {
            const res = await fetch(
                `/api/admin/honeymoon/geocode?q=${encodeURIComponent(term)}&mode=${leg.mode}`,
            );
            const body = await res.json();
            const found: Hit[] = body.results ?? [];
            if (!found.length) {
                setError(body.error ?? `Nothing found for "${term}".`);
                return;
            }
            /*
             * One answer is an answer — unless it is a guess.
             *
             * A single hit is normally applied straight away, because the second
             * hit for an airport code is regularly a hotel next to the runway.
             * But the fallback geocoder answers fuzzily: asked for "YBR airport"
             * it returns *YBL* airport, 1,800 km away, and applying that silently
             * would put a confident wrong pin on the map. So a single hit is
             * auto-applied only when its name actually contains what was typed.
             */
            const confident = found.length === 1
                && (found[0].source !== 'photon'
                    || found[0].label.toLowerCase().includes(term.toLowerCase()));
            if (confident) applyHit(found[0]);
            else setHits(found.slice(0, 5));
        } catch {
            setError('Lookup failed.');
        } finally {
            setSearching(false);
        }
    };

    const applyHit = (hit: Hit) => {
        const isLink = /^https?:\/\//i.test(draft.trim());
        // Nominatim's display_name is an address; its first segment is the name.
        const name = hit.label.split(',')[0]?.trim() || draft.trim();
        const label = isLink || !draft.trim() ? name : draft.trim();
        setDraft(label);
        setHits([]);
        save({
            [`${end}_text`]: label,
            [`${end}_lat`]: hit.lat,
            [`${end}_lng`]: hit.lng,
        });
    };

    return (
        <div>
            <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold
                    w-9 shrink-0">
                    {end === 'from' ? 'From' : 'To'}
                </span>
                <TextField
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { if ((text ?? '') !== draft) save({ [`${end}_text`]: draft }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                    placeholder={end === 'from'
                        ? `${meta.label} from — DPS, or a place name`
                        : `${meta.label} to — SIN, or a place name`}
                />
                <Button onClick={lookup} disabled={searching || !draft.trim()} className="!px-3">
                    {searching ? '…' : 'Find'}
                </Button>
            </div>

            <div className="flex items-center gap-2 pl-10 mt-0.5 flex-wrap">
                {pinned ? (
                    <>
                        <span
                            className="text-[11px] text-emerald-700 tabular-nums"
                            title="Looked up — this end is on the map"
                        >
                            📍 {lat.toFixed(4)}, {lng.toFixed(4)}
                        </span>
                        <button
                            onClick={() => save({ [`${end}_lat`]: null, [`${end}_lng`]: null })}
                            className="text-[11px] text-gray-400 hover:text-rose-600"
                            title="Forget where this is"
                        >
                            clear
                        </button>
                    </>
                ) : (
                    <span className="text-[11px] text-gray-400">
                        Not looked up — press Find to put it on the map
                    </span>
                )}
            </div>

            {error && <p className="text-[11px] text-amber-700 pl-10 mt-0.5">{error}</p>}

            {hits.length > 0 && (
                <ul className="mt-1 ml-10 divide-y divide-gray-100 rounded-2xl border
                    border-gray-200 bg-white overflow-hidden">
                    {hits.map((hit, i) => (
                        <li key={`${hit.lat},${hit.lng},${i}`}>
                            <button
                                onClick={() => applyHit(hit)}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 transition"
                            >
                                <div className="text-[11px] text-gray-800 line-clamp-2">{hit.label}</div>
                                <div className="text-[10px] text-gray-400 tabular-nums">
                                    {hit.kind ? `${hit.kind} · ` : ''}
                                    {hit.lat.toFixed(4)}, {hit.lng.toFixed(4)}
                                    {/* Said, not hidden: the fallback matches
                                        fuzzily and can return a different
                                        airport with a similar code. */}
                                    {hit.source === 'photon' && (
                                        <span className="text-amber-700"> · fuzzy match, check it</span>
                                    )}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
