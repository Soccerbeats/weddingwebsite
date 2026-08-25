'use client';

import { useState } from 'react';
import {
    TRAVEL_MODES, formatDayDate, formatTime, legArrivalDay, legEnds, legIsOvernight,
    travelModeMeta,
    type Day, type TravelLeg, type TravelMode,
} from '@/lib/honeymoon';
import { formatDuration, legRealMinutes } from '@/lib/honeymoonTimeline';
import { nominalZone } from '@/lib/honeymoonSun';
import { dateIso } from '@/lib/honeymoonToday';
import BookingPanel from './BookingPanel';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, OverflowMenu, SelectField, TextField } from './ui';

/**
 * Zones worth offering without typing.
 *
 * A datalist, not a dropdown: the list of IANA zones is six hundred long and the
 * ones a honeymoon uses are a dozen. Anything can still be typed.
 */
const COMMON_ZONES = [
    'Asia/Makassar', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
    'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Fiji',
    'Europe/London', 'Europe/Paris', 'Europe/Rome', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'Indian/Maldives', 'UTC',
];

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
                <OverflowMenu items={[
                    /*
                     * Legs came back `ORDER BY id`, so one entered late sorted
                     * last however early it departs — and a day with a taxi, a
                     * flight and a transfer read in the order you happened to
                     * type them. Now they have a `sort_order` and these move it.
                     */
                    ...(day.travel.length > 1 ? [
                        {
                            label: 'Move earlier',
                            onClick: () => {
                                const ids = day.travel.map((row) => row.id);
                                const at = ids.indexOf(leg.id);
                                if (at <= 0) return;
                                ids.splice(at - 1, 0, ids.splice(at, 1)[0]);
                                api.reorder('travel', ids);
                            },
                        },
                        {
                            label: 'Move later',
                            onClick: () => {
                                const ids = day.travel.map((row) => row.id);
                                const at = ids.indexOf(leg.id);
                                if (at < 0 || at === ids.length - 1) return;
                                ids.splice(at + 1, 0, ids.splice(at, 1)[0]);
                                api.reorder('travel', ids);
                            },
                        },
                        {
                            label: 'Sort the day by departure time',
                            onClick: () => {
                                const ids = [...day.travel]
                                    .sort((a, b) => (a.depart_time ?? '~')
                                        .localeCompare(b.depart_time ?? '~'))
                                    .map((row) => row.id);
                                api.reorder('travel', ids);
                            },
                        },
                    ] : []),
                    ...(day.travel.length > 1 ? [{
                        label: `Move to another day…`,
                        onClick: () => {
                            const target = prompt(
                                'Move this leg to which day number?',
                                String(day.day_number),
                            );
                            const number = Number(target);
                            const found = (api.data?.days ?? [])
                                .find((row) => row.day_number === number);
                            if (found) api.update('travel', { id: leg.id, day_id: found.id });
                        },
                    }] : []),
                    {
                        label: 'Remove leg',
                        danger: true,
                        onClick: () => api.removeRow('travel', leg, 'Removed a travel leg'),
                    },
                ]} />
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

                <LegDetails leg={leg} day={day} api={api} />
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

/**
 * The half of a leg you only fill in once it is booked.
 *
 * Collapsed by default: a leg is useful as "DPS → SIN, 14:05" for weeks before
 * anyone knows the terminal, and eight more fields on every card would bury the
 * three that matter. Open, it holds the flight number (and the lookup that fills
 * the rest in from it), terminals, aircraft, the two time zones — which are what
 * make a westbound leg stop reading as negative — and what it cost.
 */
function LegDetails({ leg, day, api }: { leg: TravelLeg; day: Day; api: HoneymoonApi }) {
    const [open, setOpen] = useState(false);
    const [lookupState, setLookupState] = useState<'idle' | 'busy' | 'unconfigured'>('idle');
    const [lookupError, setLookupError] = useState('');

    const startDate = api.data?.trip.start_date ?? null;
    const departDate = dateIso(startDate, day.day_number);
    const realMinutes = legRealMinutes(leg, departDate);

    const filled = [
        leg.flight_no, leg.from_terminal, leg.to_terminal, leg.aircraft,
        leg.depart_tz, leg.arrive_tz, leg.cost, leg.booked_by,
    ].filter((value) => value != null && value !== '').length;

    /**
     * Fill the leg in from its flight number.
     *
     * Needs `FLIGHT_API_KEY`; without it the button says so instead of failing.
     * Times, terminals, aircraft and both zones come back together, which is the
     * whole point — those six fields are exactly the error-prone typing.
     */
    const lookupFlight = async () => {
        if (!leg.flight_no || !departDate) return;
        setLookupState('busy');
        setLookupError('');
        try {
            const res = await fetch(
                `/api/admin/honeymoon/flight?no=${encodeURIComponent(leg.flight_no)}`
                + `&date=${departDate}`,
            );
            const body = await res.json();
            if (!res.ok) {
                setLookupError(body?.error ?? 'The lookup failed');
                setLookupState('idle');
                return;
            }
            if (!body.configured) {
                setLookupState('unconfigured');
                return;
            }
            if (!body.flight) {
                setLookupError(body.error ?? 'No flight found that day');
                setLookupState('idle');
                return;
            }
            const flight = body.flight;
            // Only blanks are filled: a leg you have already corrected by hand
            // must not be overwritten by a schedule.
            const patch: Record<string, unknown> = { id: leg.id };
            const fill = (key: string, current: unknown, value: unknown) => {
                if (value != null && value !== '' && (current == null || current === '')) {
                    patch[key] = value;
                }
            };
            fill('from_text', leg.from_text, flight.from_text);
            fill('to_text', leg.to_text, flight.to_text);
            fill('depart_time', leg.depart_time, flight.depart_time);
            fill('arrive_time', leg.arrive_time, flight.arrive_time);
            fill('depart_tz', leg.depart_tz, flight.depart_tz);
            fill('arrive_tz', leg.arrive_tz, flight.arrive_tz);
            fill('from_terminal', leg.from_terminal, flight.from_terminal);
            fill('to_terminal', leg.to_terminal, flight.to_terminal);
            fill('aircraft', leg.aircraft, flight.aircraft);
            if (flight.arrive_day_offset && !leg.arrive_day_offset) {
                patch.arrive_day_offset = flight.arrive_day_offset;
            }
            await api.update('travel', patch);
            setLookupState('idle');
        } catch {
            setLookupError('Could not reach the lookup service');
            setLookupState('idle');
        }
    };

    return (
        <div className="rounded-xl bg-white/70 border border-slate-200">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px]
                    font-medium text-slate-600"
            >
                <span>
                    Booking details
                    {filled > 0 && <span className="ml-1 text-slate-400">({filled} filled in)</span>}
                    {realMinutes != null && (
                        <span className="ml-2 text-sky-700">
                            {formatDuration(realMinutes * 60)} in the air
                        </span>
                    )}
                </span>
                <span className="text-slate-400">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="space-y-2 border-t border-slate-100 p-2.5">
                    {leg.mode === 'flight' && (
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label className="mb-1 block text-[10px] font-semibold uppercase
                                    tracking-wide text-gray-400">
                                    Flight number
                                </label>
                                <TextField
                                    key={`f${leg.flight_no ?? ''}`}
                                    defaultValue={leg.flight_no ?? ''}
                                    placeholder="SQ 938"
                                    onBlur={(e) => {
                                        if (e.target.value !== (leg.flight_no ?? '')) {
                                            api.update('travel', {
                                                id: leg.id, flight_no: e.target.value,
                                            });
                                        }
                                    }}
                                />
                            </div>
                            <Button
                                onClick={lookupFlight}
                                disabled={!leg.flight_no || !departDate || lookupState === 'busy'}
                            >
                                {lookupState === 'busy' ? 'Looking…' : 'Fill in from schedule'}
                            </Button>
                        </div>
                    )}
                    {lookupState === 'unconfigured' && (
                        <p className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                            Flight lookup needs an API key. Set <code>FLIGHT_API_KEY</code> in the
                            stack (AeroDataBox via RapidAPI has a free tier) and this button fills in
                            the times, terminals, aircraft and both time zones.
                        </p>
                    )}
                    {lookupError && (
                        <p className="text-[11px] text-rose-700">{lookupError}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <TextField
                            key={`ft${leg.from_terminal ?? ''}`}
                            defaultValue={leg.from_terminal ?? ''}
                            placeholder="From terminal"
                            onBlur={(e) => {
                                if (e.target.value !== (leg.from_terminal ?? '')) {
                                    api.update('travel', {
                                        id: leg.id, from_terminal: e.target.value,
                                    });
                                }
                            }}
                        />
                        <TextField
                            key={`tt${leg.to_terminal ?? ''}`}
                            defaultValue={leg.to_terminal ?? ''}
                            placeholder="To terminal"
                            onBlur={(e) => {
                                if (e.target.value !== (leg.to_terminal ?? '')) {
                                    api.update('travel', { id: leg.id, to_terminal: e.target.value });
                                }
                            }}
                        />
                    </div>

                    {/* The two zones. Times are stored as the local clock at each
                        end — what the ticket says — so without these a flight
                        home reads as taking minus four hours. */}
                    <div className="grid grid-cols-2 gap-2">
                        <ZoneField
                            label="Departs in"
                            value={leg.depart_tz}
                            guess={leg.from_lng != null ? nominalZone(leg.from_lng) : null}
                            onChange={(depart_tz) => api.update('travel', { id: leg.id, depart_tz })}
                        />
                        <ZoneField
                            label="Arrives in"
                            value={leg.arrive_tz}
                            guess={leg.to_lng != null ? nominalZone(leg.to_lng) : null}
                            onChange={(arrive_tz) => api.update('travel', { id: leg.id, arrive_tz })}
                        />
                    </div>
                    <datalist id="honeymoon-zones">
                        {COMMON_ZONES.map((zone) => <option key={zone} value={zone} />)}
                    </datalist>

                    <div className="grid grid-cols-2 gap-2">
                        <TextField
                            key={`ac${leg.aircraft ?? ''}`}
                            defaultValue={leg.aircraft ?? ''}
                            placeholder="Aircraft"
                            onBlur={(e) => {
                                if (e.target.value !== (leg.aircraft ?? '')) {
                                    api.update('travel', { id: leg.id, aircraft: e.target.value });
                                }
                            }}
                        />
                        <TextField
                            key={`bb${leg.booked_by ?? ''}`}
                            defaultValue={leg.booked_by ?? ''}
                            placeholder="Booked by"
                            onBlur={(e) => {
                                if (e.target.value !== (leg.booked_by ?? '')) {
                                    api.update('travel', { id: leg.id, booked_by: e.target.value });
                                }
                            }}
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase
                            tracking-wide text-gray-400">
                            Cost ({api.data?.trip.home_currency || 'USD'})
                        </label>
                        <TextField
                            type="number"
                            min="0"
                            step="0.01"
                            key={`co${leg.cost ?? ''}`}
                            defaultValue={leg.cost != null ? String(leg.cost) : ''}
                            placeholder="0.00"
                            onBlur={(e) => {
                                if (e.target.value !== (leg.cost != null ? String(leg.cost) : '')) {
                                    api.update('travel', { id: leg.id, cost: e.target.value });
                                }
                            }}
                        />
                    </div>

                    {/* The ticket itself: reference, what it cost, when it stops
                        being refundable. The fields above are the leg; this is
                        the booking. */}
                    <BookingPanel api={api} kind="travel" travelId={leg.id} compact />
                </div>
            )}
        </div>
    );
}

/** A time zone, with the longitude's own guess one click away. */
function ZoneField({ label, value, guess, onChange }: {
    label: string;
    value: string | null;
    /** What the pin's longitude suggests — right in the tropics, close elsewhere. */
    guess: string | null;
    onChange: (zone: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide
                text-gray-400">
                {label}
            </label>
            <TextField
                list="honeymoon-zones"
                key={`z${value ?? ''}`}
                defaultValue={value ?? ''}
                placeholder="Asia/Makassar"
                onBlur={(e) => { if (e.target.value !== (value ?? '')) onChange(e.target.value); }}
            />
            {!value && guess && (
                <button
                    type="button"
                    onClick={() => onChange(guess)}
                    className="mt-1 text-[10px] text-sky-700 underline decoration-dotted"
                >
                    use {guess} (from the pin)
                </button>
            )}
        </div>
    );
}
