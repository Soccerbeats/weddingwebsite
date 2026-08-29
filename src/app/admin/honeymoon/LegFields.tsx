'use client';

import { useState } from 'react';
import { TRAVEL_MODES, daysBetween, type TravelLeg, type TravelMode } from '@/lib/honeymoon';
import { dayForDate, placementFor, type JourneyGroup } from '@/lib/honeymoonJourneys';
import { nominalZone } from '@/lib/honeymoonSun';
import { formatDuration, legRealMinutes } from '@/lib/honeymoonTimeline';
import LegEnd from './LegEnd';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, MiniSelect, SelectField, TextField } from './ui';

/**
 * Zones worth offering without typing. Anything can still be typed.
 */
const COMMON_ZONES = [
    'Asia/Makassar', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
    'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Fiji',
    'Europe/London', 'Europe/Paris', 'Europe/Rome', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'Indian/Maldives', 'UTC',
];

/**
 * Everything about one leg, on one level.
 *
 * The old version had a "Booking details" panel which itself contained a
 * "+ Booking details" button opening a *second* panel — two collapses and a
 * three-deep hierarchy for eleven fields. Now: the leg's own facts here (where,
 * when, which flight, which terminal, which zone), and the ticket's facts once
 * per journey, one level up.
 *
 * Dates, not day numbers. Typing the dates off the confirmation is what places
 * the leg on a day — see `placementFor`.
 */
export default function LegFields({ api, leg, group }: {
    api: HoneymoonApi;
    leg: TravelLeg;
    group: JourneyGroup;
}) {
    const trip = api.data?.trip;
    const days = api.data?.days ?? [];
    const lastDay = days.length ? Math.max(...days.map((day) => day.day_number)) : 0;
    const [lookupState, setLookupState] = useState<'idle' | 'busy' | 'unconfigured'>('idle');
    const [lookupNote, setLookupNote] = useState('');

    /**
     * Save fields, and re-place the leg whenever a date changed.
     *
     * The whole point of the rework: `day_id` and `arrive_day_offset` are
     * derived. They are written in the same request as the dates, so the leg is
     * never briefly filed in the wrong place. Every read re-derives them from
     * the dates as well (`refileLegsByDate`), so this write is the fast path
     * rather than the only thing standing between a date and the right day.
     */
    const save = async (fields: Record<string, unknown>) => {
        const patch: Record<string, unknown> = { id: leg.id, ...fields };
        const touchesDates = 'depart_date' in fields || 'arrive_date' in fields;
        let extendTo = 0;
        if (touchesDates && trip) {
            const depart = (fields.depart_date as string | undefined) ?? leg.depart_date;
            const arrive = (fields.arrive_date as string | undefined) ?? leg.arrive_date;
            const placement = placementFor(
                { depart_date: depart ?? null, arrive_date: arrive ?? null }, days, trip,
            );
            if (placement) Object.assign(patch, placement);
            else if (depart) {
                /*
                 * The date has no day row. When the trip's own dates already
                 * run that far, the day simply was never created — the range
                 * was set without filling it in — and the honest thing is to
                 * create it, not to leave the leg on whichever day it happened
                 * to be on and mention it in a warning on another tab. That is
                 * how a flight home on the last day of the trip came to sit on
                 * the day before it.
                 *
                 * A date past the end of the trip is a different matter: it may
                 * well be a typo, so it keeps the journey card's warning and its
                 * "add days up to N" button rather than silently growing the
                 * trip by a year.
                 */
                const target = dayForDate(days, trip.start_date, depart).dayNumber;
                const covered = trip.end_date
                    ? (daysBetween(trip.start_date, trip.end_date) ?? 0) + 1
                    : 0;
                if (target != null && target > lastDay && target <= covered) extendTo = target;
            }
        }
        await api.update('travel', patch);
        if (extendTo > lastDay) {
            const rows = [];
            for (let n = lastDay + 1; n <= extendTo; n += 1) rows.push({ day_number: n });
            await api.createMany('days', rows);
            // No placement write needed: the day now exists, and the next read
            // files the leg onto it from its date.
            await api.refresh();
        }
    };

    const realMinutes = legRealMinutes(leg, leg.depart_date);

    /** Fill the leg in from its flight number. */
    const lookupFlight = async () => {
        if (!leg.flight_no || !leg.depart_date) return;
        setLookupState('busy');
        setLookupNote('');
        try {
            const res = await fetch(
                `/api/admin/honeymoon/flight?no=${encodeURIComponent(leg.flight_no)}`
                + `&date=${leg.depart_date}`,
            );
            const body = await res.json();
            if (!res.ok) { setLookupNote(body?.error ?? 'The lookup failed'); return; }
            if (!body.configured) { setLookupState('unconfigured'); return; }
            if (!body.flight) { setLookupNote(body.error ?? 'No schedule found'); return; }

            const flight = body.flight;
            // Only blanks are filled: a leg corrected by hand is never
            // overwritten by a schedule.
            const patch: Record<string, unknown> = {};
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
            // The arrival *date* now, rather than a day offset the person has to
            // reason about.
            if (flight.arrive_day_offset != null && !leg.arrive_date && leg.depart_date) {
                const arrival = new Date(
                    Date.parse(`${leg.depart_date}T00:00:00Z`)
                    + flight.arrive_day_offset * 86_400_000,
                );
                patch.arrive_date = arrival.toISOString().slice(0, 10);
            }
            await save(patch);
            setLookupNote(flight.other_date && flight.from_date
                ? `${flight.flight_no} does not operate on that date — filled in from its `
                    + `${flight.from_date} schedule. Worth checking closer to the trip.`
                : `Filled in from ${flight.flight_no}’s schedule.`);
            setLookupState('idle');
        } catch {
            setLookupNote('Could not reach the lookup service');
            setLookupState('idle');
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
                <div className="w-32">
                    <Label>How</Label>
                    <MiniSelect
                        value={leg.mode}
                        onChange={(e) => save({ mode: e.target.value as TravelMode })}
                    >
                        {TRAVEL_MODES.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                                {entry.icon} {entry.label}
                            </option>
                        ))}
                    </MiniSelect>
                </div>
                {leg.mode === 'flight' && (
                    <>
                        <div className="w-28">
                            <Label>Flight</Label>
                            <TextField
                                key={`f${leg.flight_no ?? ''}`}
                                defaultValue={leg.flight_no ?? ''}
                                placeholder="SQ 938"
                                onBlur={(e) => {
                                    if (e.target.value !== (leg.flight_no ?? '')) {
                                        save({ flight_no: e.target.value });
                                    }
                                }}
                            />
                        </div>
                        <Button
                            onClick={lookupFlight}
                            disabled={!leg.flight_no || !leg.depart_date || lookupState === 'busy'}
                            title={leg.depart_date
                                ? 'Fill in the times, terminals, aircraft and time zones'
                                : 'Set the departure date first'}
                        >
                            {lookupState === 'busy' ? 'Looking…' : 'Fill in from schedule'}
                        </Button>
                    </>
                )}
                <div className="flex-1" />
                {realMinutes != null && (
                    <span className="pb-2 text-[11px] text-sky-700">
                        {formatDuration(realMinutes * 60)} in the air
                    </span>
                )}
            </div>

            {lookupState === 'unconfigured' && (
                <p className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                    Flight lookup needs an API key. Set <code>FLIGHT_API_KEY</code> on the stack
                    (AeroDataBox via RapidAPI has a free tier).
                </p>
            )}
            {lookupNote && (
                <p className={`rounded-xl px-2.5 py-1.5 text-[11px] ${
                    lookupNote.includes('filled in from') || lookupNote.includes('Filled in')
                        ? 'bg-sky-50 text-sky-800' : 'bg-rose-50 text-rose-700'}`}>
                    {lookupNote}
                </p>
            )}

            {/* ---- The two ends ---- */}
            <LegEnd leg={leg} end="from" api={api} />
            <LegEnd leg={leg} end="to" api={api} />

            {/* ---- When. Dates, because that is what a ticket says. ---- */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <Label>Leaves</Label>
                    <div className="flex gap-1.5">
                        <TextField
                            type="date"
                            key={`dd${leg.depart_date ?? ''}`}
                            defaultValue={leg.depart_date ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (leg.depart_date ?? '')) {
                                    save({ depart_date: e.target.value });
                                }
                            }}
                        />
                        <TextField
                            type="time"
                            className="max-w-[7rem]"
                            key={`dt${leg.depart_time ?? ''}`}
                            defaultValue={leg.depart_time ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (leg.depart_time ?? '')) {
                                    save({ depart_time: e.target.value });
                                }
                            }}
                        />
                    </div>
                </div>
                <div>
                    <Label>Lands</Label>
                    <div className="flex gap-1.5">
                        <TextField
                            type="date"
                            key={`ad${leg.arrive_date ?? ''}`}
                            defaultValue={leg.arrive_date ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (leg.arrive_date ?? '')) {
                                    save({ arrive_date: e.target.value });
                                }
                            }}
                        />
                        <TextField
                            type="time"
                            className="max-w-[7rem]"
                            key={`at${leg.arrive_time ?? ''}`}
                            defaultValue={leg.arrive_time ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (leg.arrive_time ?? '')) {
                                    save({ arrive_time: e.target.value });
                                }
                            }}
                        />
                    </div>
                    {leg.depart_date && leg.arrive_date && leg.arrive_date !== leg.depart_date && (
                        <p className="mt-1 text-[10px] text-slate-600">
                            Lands the next day{leg.arrive_date > leg.depart_date ? '' : ' — check that'}
                        </p>
                    )}
                </div>
            </div>

            {/* ---- Terminals and zones ---- */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <Label>From terminal</Label>
                    <TextField
                        key={`ft${leg.from_terminal ?? ''}`}
                        defaultValue={leg.from_terminal ?? ''}
                        placeholder="2"
                        onBlur={(e) => {
                            if (e.target.value !== (leg.from_terminal ?? '')) {
                                save({ from_terminal: e.target.value });
                            }
                        }}
                    />
                </div>
                <div>
                    <Label>To terminal</Label>
                    <TextField
                        key={`tt${leg.to_terminal ?? ''}`}
                        defaultValue={leg.to_terminal ?? ''}
                        placeholder="3"
                        onBlur={(e) => {
                            if (e.target.value !== (leg.to_terminal ?? '')) {
                                save({ to_terminal: e.target.value });
                            }
                        }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <ZoneField
                    label="Local time at take-off"
                    value={leg.depart_tz}
                    guess={leg.from_lng != null ? nominalZone(leg.from_lng) : null}
                    onChange={(depart_tz) => save({ depart_tz })}
                />
                <ZoneField
                    label="Local time at landing"
                    value={leg.arrive_tz}
                    guess={leg.to_lng != null ? nominalZone(leg.to_lng) : null}
                    onChange={(arrive_tz) => save({ arrive_tz })}
                />
            </div>
            <datalist id="honeymoon-zones">
                {COMMON_ZONES.map((zone) => <option key={zone} value={zone} />)}
            </datalist>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <Label>Aircraft</Label>
                    <TextField
                        key={`ac${leg.aircraft ?? ''}`}
                        defaultValue={leg.aircraft ?? ''}
                        placeholder="Boeing 787"
                        onBlur={(e) => {
                            if (e.target.value !== (leg.aircraft ?? '')) {
                                save({ aircraft: e.target.value });
                            }
                        }}
                    />
                </div>
                <div>
                    <Label>Seats / notes</Label>
                    <TextField
                        key={`n${leg.notes ?? ''}`}
                        defaultValue={leg.notes ?? ''}
                        placeholder="32A, 32B"
                        onBlur={(e) => {
                            if (e.target.value !== (leg.notes ?? '')) {
                                save({ notes: e.target.value });
                            }
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                <span className="text-[10px] text-gray-400">
                    {group.journey
                        ? 'The reference and the price live on the journey, above.'
                        : 'Add a connection to turn this into a journey.'}
                </span>
                <Button
                    tone="danger"
                    onClick={() => api.removeRow('travel', leg, 'Removed a leg')}
                >
                    Remove this leg
                </Button>
            </div>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide
            text-gray-400">
            {children}
        </label>
    );
}

/** A time zone, with the longitude's own guess one click away. */
function ZoneField({ label, value, guess, onChange }: {
    label: string;
    value: string | null;
    guess: string | null;
    onChange: (zone: string) => void;
}) {
    return (
        <div>
            <Label>{label}</Label>
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

export { SelectField };
