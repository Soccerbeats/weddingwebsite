'use client';

import { useMemo, useState } from 'react';
import {
    TRAVEL_MODES, formatDayDate, formatTime, legArrivalDay, legEnds, legIsOvernight,
    travelModeMeta,
    type Day, type TravelLeg, type TravelMode,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import TravelLegCard from './TravelLeg';
import { Button, Card, EmptyState, SelectField } from './ui';

/**
 * Every way you get from one place to the next, in one place.
 *
 * The legs live on days and always did — this is a second view of the same rows,
 * not a second store. A leg edited here changes on the itinerary and the other
 * way round, because both render the one editor over the one record.
 *
 * It earns its own tab because booking travel is its own afternoon: you sit down
 * with six confirmation emails and enter six legs, which through the itinerary
 * means opening six day cards. Here they are a list, in order, with the trip's
 * dates against them.
 */
export default function TravelTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const days = useMemo(() => data?.days ?? [], [data]);
    const startDate = data?.trip.start_date ?? null;

    /** Every leg with the day it leaves on, in trip order. */
    const legs = useMemo(
        () => days.flatMap((day) => day.travel.map((leg) => ({ leg, day })))
            .sort((a, b) => a.day.day_number - b.day.day_number
                || (a.leg.depart_time ?? '').localeCompare(b.leg.depart_time ?? '')
                || a.leg.id - b.leg.id),
        [days],
    );

    const counts = useMemo(() => {
        const seen = new Map<string, number>();
        for (const { leg } of legs) seen.set(leg.mode, (seen.get(leg.mode) ?? 0) + 1);
        return TRAVEL_MODES.filter((m) => seen.has(m.key))
            .map((m) => ({ ...m, count: seen.get(m.key) ?? 0 }));
    }, [legs]);

    /** What the add row is set to. Defaults to the first day of the trip. */
    const [addDay, setAddDay] = useState('');
    const [addMode, setAddMode] = useState<TravelMode>('flight');
    const dayId = addDay || String(days[0]?.id ?? '');

    const add = async () => {
        if (!dayId) return;
        await api.create('travel', { day_id: Number(dayId), mode: addMode });
    };

    const [transferring, setTransferring] = useState(false);
    const [transferNote, setTransferNote] = useState('');

    /**
     * The leg nobody enjoys entering.
     *
     * Every arrival needs one — airport to hotel, by car, an hour of it — and
     * every one is typed by hand from two things the portal already knows: where
     * the flight landed, and where you are sleeping that night. This builds it:
     * the flight's arrival end becomes the origin (text and pin), the day's base
     * becomes the destination, and the departure time is set to half an hour
     * after the flight lands, which is roughly how long a bag takes.
     *
     * It is a first draft, not a booking: everything it writes is editable, and
     * it says what it used.
     */
    const addTransfer = async () => {
        if (!dayId) return;
        const day = days.find((d) => String(d.id) === dayId);
        if (!day) return;
        setTransferring(true);
        setTransferNote('');
        try {
            // The flight that gets you here: one landing on this day (including
            // a red-eye that left the day before), else one leaving today.
            const landing = days.flatMap((other) => other.travel
                .filter((leg) => leg.mode === 'flight'
                    && legArrivalDay(leg, other.day_number) === day.day_number)
                .map((leg) => ({ leg, from: other })))
                .sort((a, b) => (a.leg.arrive_time ?? '').localeCompare(b.leg.arrive_time ?? ''))
                .pop();

            const base = day.base_place_id != null
                ? api.placeById.get(day.base_place_id) ?? null
                : null;

            if (!landing && !base) {
                setTransferNote('Nothing to build it from: this day has no flight and no stay.');
                return;
            }

            const arriveMinutes = landing?.leg.arrive_time
                ? Number(landing.leg.arrive_time.slice(0, 2)) * 60
                    + Number(landing.leg.arrive_time.slice(3, 5))
                : null;
            const depart = arriveMinutes != null
                ? `${String(Math.floor(((arriveMinutes + 30) % 1440) / 60)).padStart(2, '0')}:`
                    + `${String((arriveMinutes + 30) % 60).padStart(2, '0')}`
                : null;

            const created = await api.create('travel', {
                day_id: day.id,
                mode: 'car',
                from_text: landing?.leg.to_text ?? 'Airport',
                to_text: base?.name ?? '',
                from_lat: landing?.leg.to_lat ?? null,
                from_lng: landing?.leg.to_lng ?? null,
                to_lat: base?.lat ?? null,
                to_lng: base?.lng ?? null,
                depart_time: depart ?? '',
                notes: 'Airport transfer',
            });
            if (created) {
                setTransferNote(landing
                    ? `Built from ${landing.leg.flight_no || 'the flight'} landing at `
                        + `${landing.leg.to_text || 'the airport'}${base ? ` → ${base.name}` : ''}.`
                    : `Built to ${base?.name ?? 'the stay'} — add where it starts from.`);
            }
        } finally {
            setTransferring(false);
        }
    };

    if (!days.length) {
        return (
            <Card>
                <EmptyState
                    title="No days to travel between yet"
                    hint="A leg leaves on a day, so the trip needs at least one. Add a day on the Itinerary tab — or set the dates in Settings and they are built for you — then come back."
                />
            </Card>
        );
    }

    return (
        <div className="space-y-3 max-w-4xl">
            {/* ---- Add ---- */}
            <Card className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[8rem]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            Leaves on
                        </label>
                        <SelectField value={dayId} onChange={(e) => setAddDay(e.target.value)}>
                            {days.map((day) => (
                                <option key={day.id} value={day.id}>
                                    Day {day.day_number}
                                    {formatDayDate(startDate, day.day_number)
                                        ? ` · ${formatDayDate(startDate, day.day_number)}`
                                        : ''}
                                    {day.title ? ` — ${day.title}` : ''}
                                </option>
                            ))}
                        </SelectField>
                    </div>
                    <div className="min-w-[8rem]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">How</label>
                        <SelectField
                            value={addMode}
                            onChange={(e) => setAddMode(e.target.value as TravelMode)}
                        >
                            {TRAVEL_MODES.map((m) => (
                                <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                            ))}
                        </SelectField>
                    </div>
                    <Button tone="primary" onClick={add}>+ Add leg</Button>
                    <Button onClick={addTransfer} disabled={!dayId || transferring}>
                        {transferring ? 'Adding…' : '+ Airport transfer'}
                    </Button>
                    <div className="flex-1" />
                    <p className="text-[11px] text-gray-400 pb-2">
                        A leg belongs to the day it leaves on. Landing on a later day is what the
                        Lands control is for.
                    </p>
                </div>
                {transferNote && (
                    <p className="mt-2 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
                        {transferNote}
                    </p>
                )}
            </Card>

            {/* ---- Counts ---- */}
            {legs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <span className="text-xs text-gray-500">
                        {legs.length} leg{legs.length === 1 ? '' : 's'}
                    </span>
                    {counts.map((m) => (
                        <span
                            key={m.key}
                            className="rounded-full bg-white border border-gray-200 px-2.5 py-1
                                text-[11px] text-gray-600"
                        >
                            {m.icon} {m.label} {m.count}
                        </span>
                    ))}
                </div>
            )}

            {/* ---- The legs ---- */}
            {legs.length === 0 ? (
                <Card>
                    <EmptyState
                        title="No travel entered yet"
                        hint="Add the flight that gets you there, then the boat, the transfer, the train home. Each one shows up on its day in the itinerary."
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {legs.map(({ leg, day }) => (
                        <Card key={leg.id} className="p-3">
                            <LegHeading leg={leg} day={day} startDate={startDate} />
                            <TravelLegCard leg={leg} day={day} api={api} />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Which day this leg belongs to, above the editor.
 *
 * On the itinerary that context is the card it sits in; in a flat list it has to
 * be said, or six flights in a row are indistinguishable.
 */
function LegHeading({ leg, day, startDate }: {
    leg: TravelLeg;
    day: Day;
    startDate: string | null;
}) {
    const meta = travelModeMeta(leg.mode);
    const date = formatDayDate(startDate, day.day_number);
    const landsDay = legArrivalDay(leg, day.day_number);
    const landsDate = formatDayDate(startDate, landsDay);

    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2 px-1">
            <span className="text-sm font-semibold text-gray-900">
                {meta.icon} Day {day.day_number}
            </span>
            {date && <span className="text-xs text-gray-400">{date}</span>}
            {day.title && <span className="text-xs text-gray-400">· {day.title}</span>}
            <div className="flex-1" />
            <span className="text-[11px] text-gray-500 tabular-nums">
                {leg.depart_time ? formatTime(leg.depart_time) : '—'}
                {' → '}
                {leg.arrive_time ? formatTime(leg.arrive_time) : '—'}
                {legIsOvernight(leg) && (
                    <span className="text-slate-700 font-semibold">
                        {' '}day {landsDay}{landsDate ? ` (${landsDate})` : ''}
                    </span>
                )}
            </span>
            {/* Whether the map can draw it, said once per leg rather than per end. */}
            <span className={`text-[11px] ${legEnds(leg) ? 'text-emerald-700' : 'text-gray-400'}`}>
                {legEnds(leg) ? '📍 on the map' : 'not on the map'}
            </span>
        </div>
    );
}
