'use client';

import { useState } from 'react';
import {
    TRAVEL_MODES, formatDate, formatDayDate, formatTime, travelModeMeta,
    type TravelLeg, type TravelMode,
} from '@/lib/honeymoon';
import {
    dayForDate, formatMinutes, journeyTitle, placementFor, sameInstantIn,
    type JourneyGroup,
} from '@/lib/honeymoonJourneys';
import BookingPanel from './BookingPanel';
import LegFields from './LegFields';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Card, InlineText, MiniSelect, OverflowMenu, TextField } from './ui';

/**
 * One ticket, with its legs.
 *
 * The old tab was a flat list of legs, each asking which trip *day* it belonged
 * to — which made you do the arithmetic a confirmation email had already done.
 * This is the shape a ticket actually has: a journey with a route, a total
 * duration, the layovers in between, one booking reference covering the lot, and
 * legs whose day is worked out from the dates you type.
 */
export default function JourneyCard({ api, group, onAddLeg }: {
    api: HoneymoonApi;
    group: JourneyGroup;
    /** Append a leg to this journey, prefilled from the one before it. */
    onAddLeg: (group: JourneyGroup) => void;
}) {
    const [open, setOpen] = useState<number | null>(null);
    const trip = api.data?.trip;
    const days = api.data?.days ?? [];
    const meta = travelModeMeta(group.mode);
    const homeZone = trip?.start_date && group.legs[0]?.depart_tz ? group.legs[0].depart_tz : null;

    const warnings = group.problems.filter(
        (problem) => problem.kind === 'impossible-layover' || problem.kind === 'no-day'
            || problem.kind === 'no-dates',
    );
    const notes = group.problems.filter((problem) => !warnings.includes(problem));

    /** Retitle, or set the journey's mode — both only when it *is* a journey. */
    const journeyId = group.journey?.id ?? null;

    return (
        <Card className="p-4 space-y-3">
            {/* ---- Header: what this is, where it goes, how long it takes ---- */}
            <div className="flex flex-wrap items-start gap-2">
                <span className="text-xl leading-none" aria-hidden>{meta.icon}</span>
                <div className="min-w-0 flex-1">
                    {journeyId != null ? (
                        <InlineText
                            value={group.journey?.title ?? ''}
                            placeholder={group.route.join(' → ') || 'Name this journey'}
                            className="font-semibold text-gray-900 -ml-2"
                            onCommit={(title) => api.update('journeys', { id: journeyId, title })}
                        />
                    ) : (
                        <p className="font-semibold text-gray-900">{journeyTitle(group)}</p>
                    )}
                    <p className="text-xs text-gray-500">
                        {group.route.length >= 2
                            ? group.route.join(' → ')
                            : 'Add where it goes'}
                    </p>
                </div>

                <div className="text-right">
                    {group.departDate && (
                        <p className="text-xs text-gray-600">
                            {formatDate(group.departDate)}
                            {group.arriveDate && group.arriveDate !== group.departDate
                                && ` → ${formatDate(group.arriveDate)}`}
                        </p>
                    )}
                    {group.totalMinutes != null && (
                        <p className="text-[11px] text-gray-400 tabular-nums">
                            {formatMinutes(group.totalMinutes)} door to door
                            {group.movingMinutes != null && group.legs.length > 1
                                && ` · ${formatMinutes(group.movingMinutes)} moving`}
                        </p>
                    )}
                </div>

                <OverflowMenu items={[
                    ...(journeyId != null ? TRAVEL_MODES
                        .filter((entry) => entry.key !== group.journey?.kind)
                        .map((entry) => ({
                            label: `Show as ${entry.label.toLowerCase()}`,
                            onClick: () => api.update('journeys', {
                                id: journeyId, kind: entry.key,
                            }),
                        })) : []),
                    ...(journeyId == null && group.legs.length === 1 ? [{
                        label: 'Add a connection (makes this a journey)',
                        onClick: () => onAddLeg(group),
                    }] : []),
                    ...(journeyId != null ? [{
                        label: 'Delete the whole journey',
                        danger: true,
                        onClick: async () => {
                            if (!confirm(
                                `Delete "${journeyTitle(group)}" and its ${group.legs.length} `
                                + 'leg(s)? You can undo it.',
                            )) return;
                            // The legs first: the journey row is what they point
                            // at, and deleting it only unlinks them.
                            for (const leg of group.legs) {
                                await api.removeRow('travel', leg, 'Removed a leg');
                            }
                            await api.remove('journeys', journeyId);
                        },
                    }] : []),
                ]} />
            </div>

            {/* ---- What is wrong ---- */}
            {warnings.length > 0 && (
                <ul className="space-y-1">
                    {warnings.map((problem, index) => (
                        <li
                            key={`${problem.kind}-${index}`}
                            className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800"
                        >
                            {problem.message}
                            {problem.kind === 'no-day' && trip?.start_date && (
                                <FixDay api={api} group={group} legId={problem.legId} />
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {notes.length > 0 && (
                <ul className="space-y-1">
                    {notes.map((problem, index) => (
                        <li
                            key={`${problem.kind}-${index}`}
                            className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800"
                        >
                            {problem.message}
                        </li>
                    ))}
                </ul>
            )}

            {/* ---- The legs, with the layovers between them ---- */}
            {group.legs.length === 0 ? (
                <p className="text-xs text-gray-400">
                    No legs yet — add the first one below.
                </p>
            ) : (
                <ol className="space-y-1.5">
                    {group.legs.map((leg, index) => {
                        const layover = index > 0
                            ? group.layovers.find((entry) => entry.beforeLegId === leg.id)
                            : null;
                        const day = group.dayOf.get(leg.id);
                        return (
                            <li key={leg.id}>
                                {layover && (
                                    <div className={`mb-1.5 ml-6 flex items-center gap-2 text-[11px]
                                        ${layover.impossible ? 'text-rose-700'
                                        : layover.tight ? 'text-amber-700' : 'text-gray-400'}`}>
                                        <span className="h-3 w-px bg-current opacity-30" />
                                        <span>
                                            {layover.impossible
                                                ? 'leaves before you land'
                                                : `${formatMinutes(layover.minutes) ?? '—'} at ${layover.at ?? 'the stopover'}`}
                                            {layover.tight && ' · tight'}
                                            {layover.changesAirport && ' · different airport'}
                                        </span>
                                    </div>
                                )}

                                <div className={`rounded-2xl border px-2.5 py-2 transition
                                    ${open === leg.id
                                    ? 'border-accent/40 bg-accent/5'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(open === leg.id ? null : leg.id)}
                                        className="flex w-full items-center gap-2 text-left"
                                    >
                                        <span className="text-base leading-none" aria-hidden>
                                            {travelModeMeta(leg.mode).icon}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-gray-900">
                                                {[leg.from_text, leg.to_text].filter(Boolean)
                                                    .join(' → ') || 'Where does this leg go?'}
                                                {leg.flight_no && (
                                                    <span className="ml-1.5 rounded-full bg-gray-100
                                                        px-1.5 py-0.5 text-[10px] font-semibold
                                                        text-gray-600">
                                                        {leg.flight_no}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block text-[11px] text-gray-500
                                                tabular-nums">
                                                {leg.depart_time
                                                    ? formatTime(leg.depart_time) : '—'}
                                                {' → '}
                                                {leg.arrive_time
                                                    ? formatTime(leg.arrive_time) : '—'}
                                                {/* The one thing people always want
                                                    on a red-eye: what that landing
                                                    time is back where they came
                                                    from. */}
                                                {homeZone && leg.arrive_tz && leg.arrive_date
                                                    && leg.arrive_time
                                                    && leg.arrive_tz !== homeZone && (
                                                    <span className="text-gray-400">
                                                        {' '}({sameInstantIn(
                                                            leg.arrive_date, leg.arrive_time,
                                                            leg.arrive_tz, homeZone,
                                                        )} back home)
                                                    </span>
                                                )}
                                                {day && ` · day ${day.day_number}`}
                                                {leg.from_terminal && ` · T${leg.from_terminal}`}
                                                {leg.to_terminal && ` → T${leg.to_terminal}`}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-gray-300">
                                            {open === leg.id ? '▲' : '▼'}
                                        </span>
                                    </button>

                                    {open === leg.id && (
                                        <div className="mt-2 border-t border-gray-100 pt-2">
                                            <LegFields api={api} leg={leg} group={group} />
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => onAddLeg(group)}>
                    {group.legs.length ? '+ Add a connection' : '+ Add the first leg'}
                </Button>
                {group.legs.length > 0 && trip?.start_date && (
                    <span className="text-[11px] text-gray-400">
                        Placed on {group.legs.map((leg) => {
                            const day = group.dayOf.get(leg.id);
                            return day ? `day ${day.day_number}` : 'no day';
                        }).filter((value, index, all) => all.indexOf(value) === index).join(', ')}
                        {group.departDate && ` · ${formatDayDate(trip.start_date,
                            dayForDate(days, trip.start_date, group.departDate).dayNumber ?? 1)}`}
                    </span>
                )}
            </div>

            {/* ---- One booking for the whole ticket ----
                Not per leg: a ticket has one reference, one price and one
                cancellation date however many hops it has. This is also why the
                leg panel no longer holds a "Booking details" button of its own,
                which used to open a second panel inside the first. */}
            <div className="border-t border-gray-100 pt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide
                    text-gray-400">
                    The ticket
                </p>
                {journeyId != null ? (
                    <BookingPanel api={api} kind="travel" journeyId={journeyId} />
                ) : (
                    <BookingPanel api={api} kind="travel" travelId={group.legs[0]?.id} />
                )}
            </div>

            {group.journey && (
                <TextField
                    key={`n${group.journey.notes ?? ''}`}
                    defaultValue={group.journey.notes ?? ''}
                    placeholder="Anything about this journey — seat numbers, who to ask for"
                    onBlur={(e) => {
                        if (e.target.value !== (group.journey?.notes ?? '')) {
                            api.update('journeys', { id: journeyId, notes: e.target.value });
                        }
                    }}
                />
            )}
        </Card>
    );
}

/**
 * The one-click fix for a leg whose date has no day.
 *
 * Two ways out, and both are offered because both are sometimes right: file it
 * on the nearest day the trip does have, or extend the trip so the date exists.
 */
function FixDay({ api, group, legId }: {
    api: HoneymoonApi; group: JourneyGroup; legId?: number;
}) {
    const trip = api.data?.trip;
    const days = api.data?.days ?? [];
    const leg = group.legs.find((entry) => entry.id === legId);
    if (!leg || !trip?.start_date) return null;

    const date = leg.depart_date;
    const target = date ? dayForDate(days, trip.start_date, date) : null;
    const lastDay = days.length ? Math.max(...days.map((day) => day.day_number)) : 0;

    const extend = async () => {
        if (!target?.dayNumber || target.dayNumber <= lastDay) return;
        const rows = [];
        for (let n = lastDay + 1; n <= target.dayNumber; n += 1) rows.push({ day_number: n });
        await api.createMany('days', rows);
        await api.refresh();
        // The day now exists, so the leg can be placed properly.
        const placement = placementFor(
            { depart_date: leg.depart_date, arrive_date: leg.arrive_date },
            api.data?.days ?? [], trip,
        );
        if (placement) await api.update('travel', { id: leg.id, ...placement });
    };

    return (
        <span className="ml-1 inline-flex flex-wrap gap-1.5">
            {target?.dayNumber != null && target.dayNumber > lastDay && (
                <button
                    type="button"
                    onClick={extend}
                    className="underline decoration-dotted"
                >
                    add days up to {target.dayNumber}
                </button>
            )}
            <MiniSelect
                value=""
                aria-label="Put this leg on a day"
                onChange={(e) => {
                    if (!e.target.value) return;
                    api.update('travel', { id: leg.id, day_id: Number(e.target.value) });
                }}
            >
                <option value="">or file it on…</option>
                {days.map((day) => (
                    <option key={day.id} value={day.id}>
                        Day {day.day_number}
                    </option>
                ))}
            </MiniSelect>
        </span>
    );
}

/** The modes offered when starting a journey. */
export const JOURNEY_MODES: { key: TravelMode; label: string; icon: string }[] = TRAVEL_MODES
    .map((entry) => ({ key: entry.key, label: entry.label, icon: entry.icon }));

export type { TravelLeg };
