'use client';

import { createPortal } from 'react-dom';
import { TRAVEL_MODES, formatDayDate, formatTime, type Day } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';

/**
 * The itinerary as a sheet of paper.
 *
 * Invisible on screen and the only thing visible in print. Portalled to <body>
 * because the admin area lives inside a fixed, overflow-hidden container, which
 * would otherwise clip the whole print to a single page.
 *
 * It is a different document from the screen, not a copy of it: no controls, no
 * empty fields, no colour — just what is happening, in order, in a form you can
 * fold into a passport. That is what you want at a hotel desk with no signal.
 */
export default function PrintSheet({ api }: { api: HoneymoonApi }) {
    const data = api.data;
    if (!data || typeof document === 'undefined') return null;

    const { trip, days } = data;
    const name = (id: number | null) => (id == null ? '' : api.placeById.get(id)?.name ?? '');

    return createPortal((
        <div className="print-sheet hidden print:block text-black bg-white p-8">
            <header className="mb-6 border-b border-black/20 pb-3">
                <h1 className="text-2xl font-semibold">{trip.title}</h1>
                <p className="text-sm">
                    {trip.start_date
                        ? `${formatDayDate(trip.start_date, 1)}${days.length > 1
                            ? ` — ${formatDayDate(trip.start_date, Math.max(...days.map((d) => d.day_number)))}`
                            : ''}`
                        : `${days.length} day${days.length === 1 ? '' : 's'}`}
                </p>
                {trip.notes && <p className="text-sm mt-1">{trip.notes}</p>}
            </header>

            {days.map((day) => (
                <DaySheet key={day.id} day={day} startDate={trip.start_date} name={name} />
            ))}

            {data.notes.length > 0 && (
                <section className="mt-6 pt-3 border-t border-black/20">
                    <h2 className="text-base font-semibold mb-2">Know before you go</h2>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                        {data.notes.map((note) => (
                            <div key={note.id} className="print-day">
                                <dt className="text-sm font-semibold">{note.title}</dt>
                                <dd className="text-xs whitespace-pre-line">{note.body}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
        </div>
    ), document.body);
}

function DaySheet({ day, startDate, name }: {
    day: Day;
    startDate: string | null;
    name: (id: number | null) => string;
}) {
    const date = formatDayDate(startDate, day.day_number);
    const base = name(day.base_place_id);

    return (
        <section className="print-day mb-5">
            <h2 className="text-base font-semibold border-b border-black/10 pb-1 mb-1.5">
                Day {day.day_number}
                {date && <span className="font-normal"> · {date}</span>}
                {day.title && <span className="font-normal"> · {day.title}</span>}
            </h2>

            {base && <p className="text-xs mb-1">Staying at {base}</p>}
            {day.notes && <p className="text-xs mb-1 italic">{day.notes}</p>}

            {day.travel.map((leg) => {
                const mode = TRAVEL_MODES.find((m) => m.key === leg.mode)?.label ?? 'Travel';
                return (
                    <p key={leg.id} className="text-sm">
                        <span className="font-semibold">{mode}</span>
                        {leg.depart_time && ` ${formatTime(leg.depart_time)}`}
                        {leg.arrive_time && `–${formatTime(leg.arrive_time)}`}
                        {(leg.from_text || leg.to_text)
                            && ` · ${[leg.from_text, leg.to_text].filter(Boolean).join(' → ')}`}
                        {leg.confirmation_ref && ` · ref ${leg.confirmation_ref}`}
                    </p>
                );
            })}

            {day.stops.length === 0 ? (
                <p className="text-xs italic">Nothing planned.</p>
            ) : (
                <ol className="text-sm">
                    {day.stops.map((stop) => (
                        <li key={stop.id} className="flex gap-2 py-0.5">
                            <span className="w-16 shrink-0 tabular-nums">
                                {stop.start_time ? formatTime(stop.start_time) : ''}
                            </span>
                            <span>
                                {stop.custom_label || name(stop.place_id) || 'Stop'}
                                {stop.notes && <span className="text-xs"> — {stop.notes}</span>}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
