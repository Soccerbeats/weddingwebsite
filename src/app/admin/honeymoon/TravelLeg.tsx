'use client';

import { useState } from 'react';
import {
    TRAVEL_MODES, formatDayDate, formatTime, legArrivalDay, legEnds, legIsOvernight,
    travelModeMeta,
    type Day, type TravelLeg, type TravelMode,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, OverflowMenu, SelectField, TextField } from './ui';

/**
 * One travel leg, editable.
 *
 * Lives in its own module because it has two homes: the day card on the
 * Itinerary tab, where a leg sits among the day's stops, and the Travel tab,
 * where every leg of the trip is listed together. Two copies of a form with
 * eight fields, a geocoder and a day-offset would drift apart within a week.
 */
export default function TravelLegCard({ leg, day, api }: {
    leg: TravelLeg;
    /** The day the leg leaves on — its dates and number come from here. */
    day: Day;
    api: HoneymoonApi;
}) {
    const startDate = api.data?.trip.start_date ?? null;
    const realDate = formatDayDate(startDate, day.day_number);

    return (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5">
            <div className="flex items-center gap-2">
                <SelectField
                    className="max-w-[7.5rem]"
                    value={leg.mode}
                    onChange={(e) => api.update('travel', {
                        id: leg.id, mode: e.target.value as TravelMode,
                    })}
                >
                    {TRAVEL_MODES.map((m) => (
                        <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                    ))}
                </SelectField>
                {legIsOvernight(leg) && (
                    <span className="shrink-0 rounded-full bg-slate-900 text-white
                        text-[10px] font-semibold px-2 py-0.5">
                        +{leg.arrive_day_offset} day{leg.arrive_day_offset === 1 ? '' : 's'}
                    </span>
                )}
                <div className="flex-1" />
                <OverflowMenu items={[{
                    label: 'Remove leg',
                    danger: true,
                    onClick: () => api.removeRow('travel', leg, 'Removed a travel leg'),
                }]} />
            </div>
            <div className="mt-2 space-y-2">
                <LegEnd leg={leg} end="from" api={api} />
                <LegEnd leg={leg} end="to" api={api} />
                <div className="grid grid-cols-2 gap-2">
                    <TextField
                        type="time"
                        key={`d${leg.depart_time ?? ''}`}
                        defaultValue={leg.depart_time ?? ''}
                        onBlur={(e) => {
                            if (e.target.value !== (leg.depart_time ?? '')) {
                                api.update('travel', { id: leg.id, depart_time: e.target.value });
                            }
                        }}
                    />
                    <TextField
                        type="time"
                        key={`a${leg.arrive_time ?? ''}`}
                        defaultValue={leg.arrive_time ?? ''}
                        onBlur={(e) => {
                            if (e.target.value !== (leg.arrive_time ?? '')) {
                                api.update('travel', { id: leg.id, arrive_time: e.target.value });
                            }
                        }}
                    />
                </div>

                {/* How long the leg takes in days. A red-eye lands on the
                    next one and a long haul with a layover later still,
                    and without this the arrival time reads as being
                    hours *before* the departure on the same day. */}
                <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-gray-400
                        font-semibold shrink-0">
                        Lands
                    </span>
                    <SelectField
                        className="max-w-[11rem]"
                        value={String(leg.arrive_day_offset ?? 0)}
                        onChange={(e) => api.update('travel', {
                            id: leg.id, arrive_day_offset: Number(e.target.value),
                        })}
                    >
                        <option value="0">same day</option>
                        <option value="1">next day (+1)</option>
                        <option value="2">two days later (+2)</option>
                        <option value="3">three days later (+3)</option>
                    </SelectField>
                </div>

                {legIsOvernight(leg) && (
                    <p className="text-[11px] text-slate-700 bg-slate-100 rounded-xl
                        px-2.5 py-1.5">
                        {travelModeMeta(leg.mode).icon} Leaves day {day.day_number}
                        {leg.depart_time ? ` at ${formatTime(leg.depart_time)}` : ''}
                        {realDate ? ` (${realDate})` : ''}, lands day{' '}
                        {legArrivalDay(leg, day.day_number)}
                        {leg.arrive_time ? ` at ${formatTime(leg.arrive_time)}` : ''}
                        {formatDayDate(startDate, legArrivalDay(leg, day.day_number))
                            ? ` (${formatDayDate(
                                startDate, legArrivalDay(leg, day.day_number),
                            )})`
                            : ''}.
                    </p>
                )}
                <TextField
                    key={`c${leg.confirmation_ref ?? ''}`}
                    defaultValue={leg.confirmation_ref ?? ''}
                    placeholder="Confirmation ref"
                    onBlur={(e) => {
                        if (e.target.value !== (leg.confirmation_ref ?? '')) {
                            api.update('travel', { id: leg.id, confirmation_ref: e.target.value });
                        }
                    }}
                />
                {/* Both ends found: say so once, on the leg, rather than
                    twice on the fields. */}
                {legEnds(leg) && (
                    <p className="text-[11px] text-sky-700">
                        {travelModeMeta(leg.mode).icon} Drawn on the map — turn on
                        {' '}🗓 Itinerary there to see it.
                    </p>
                )}
            </div>
            </div>
    );
}

/** One end of a travel leg: what you type, and where that turned out to be. */
interface Hit { label: string; lat: number; lng: number; kind?: string }

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
function LegEnd({ leg, end, api }: {
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
            // One answer is an answer; several need a choice, because the second
            // hit for an airport code is regularly a hotel next to the runway.
            if (found.length === 1) applyHit(found[0]);
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
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
