'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    blankEvent, isPublicEvent, normalizeEventTime, sortByTime, type ScheduleEvent,
} from '@/lib/schedule';

/**
 * The run of the day, as a table.
 *
 * This is the *whole* day — vendor call times, hair and makeup, setup,
 * breakdown — not only the parts a guest sees. The Public tick on each row is
 * what decides which of them reach `/schedule`; everything else stays here.
 * Rows are a table rather than the stack of cards this used to be because a
 * full run-of-show is thirty rows, and thirty cards is a page you scroll rather
 * than read.
 *
 * The order is the times. Leaving a time field tidies what was typed — `8am`
 * becomes `8:00 AM` — and drops the row where the clock says it goes, which is
 * why there is nothing here for dragging rows about: to move something, change
 * when it happens. Sorting waits for the field to be left rather than firing on
 * each keystroke, or typing the second `1` of `11:00` would throw the row you
 * are editing to the other end of the table.
 */

/** The header cell style, shared so the two column sets line up. */
const TH = 'text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2';
const CELL_INPUT =
    'w-full rounded-xl bg-gray-50 border border-transparent px-3 py-2 text-sm text-gray-900 ' +
    'focus:bg-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors';

export default function AdminSchedule() {
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [scheduleSubtitle, setScheduleSubtitle] = useState('');
    const [shuttleText, setShuttleText] = useState('');
    const [dressCode, setDressCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                if (data.scheduleEvents) {
                    setEvents(sortByTime(data.scheduleEvents));
                } else {
                    // Default starter event if empty
                    setEvents([{ time: '4:00 PM', title: 'Ceremony', description: '', location: '', public: true }]);
                }
                if (data.scheduleSubtitle) setScheduleSubtitle(data.scheduleSubtitle);
                if (data.scheduleShuttleText) setShuttleText(data.scheduleShuttleText);
                if (data.scheduleDressCode) setDressCode(data.scheduleDressCode);
            });
    }, []);

    const publicCount = useMemo(() => events.filter(isPublicEvent).length, [events]);

    const handleEventChange = <K extends keyof ScheduleEvent>(index: number, field: K, value: ScheduleEvent[K]) => {
        setEvents(events.map((ev, i) => (i === index ? { ...ev, [field]: value } : ev)));
    };

    const addEvent = () => setEvents([...events, blankEvent()]);
    const removeEvent = (index: number) => setEvents(events.filter((_, i) => i !== index));

    /** Leaving a time field tidies it and re-files the row by the clock. */
    const commitTime = (index: number) => {
        setEvents(current => sortByTime(current.map(
            (ev, i) => (i === index ? { ...ev, time: normalizeEventTime(ev.time) } : ev),
        )));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            // Only update scheduleEvents property
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduleEvents: events,
                    scheduleSubtitle,
                    scheduleShuttleText: shuttleText,
                    scheduleDressCode: dressCode,
                }),
            });

            if (res.ok) {
                setMessage('Schedule updated successfully!');
            } else {
                setMessage('Failed to update.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    /** The row controls, identical in the table and in the phone cards. There is
     *  no reordering here on purpose: the times are the order. */
    const rowActions = (index: number) => (
        <button
            type="button"
            onClick={() => removeEvent(index)}
            className="p-1.5 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Remove this row"
        >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </button>
    );

    /** The Public tick, which is the whole point of the table. */
    const publicToggle = (index: number, event: ScheduleEvent) => (
        <input
            type="checkbox"
            checked={isPublicEvent(event)}
            onChange={e => handleEventChange(index, 'public', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/30 cursor-pointer"
            style={{ accentColor: 'var(--accent)' }}
            title={isPublicEvent(event) ? 'Guests can see this' : 'Only you can see this'}
        />
    );

    return (
        <div className="max-w-6xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Schedule Management</h1>
            <p className="text-gray-600 mb-8">
                The whole run of the day. Tick <span className="font-medium text-gray-800">Public</span> on the rows
                guests should see on the schedule page — everything else stays here.
            </p>

            {message && (
                <div className={`p-4 rounded-xl mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200">
                        <p className="text-sm text-gray-500">
                            {events.length} row{events.length === 1 ? '' : 's'} ·{' '}
                            <span className="font-medium text-gray-700">{publicCount} public</span>
                            {events.length - publicCount > 0 && ` · ${events.length - publicCount} private`}
                        </p>
                        <p className="ml-auto text-xs text-gray-400">
                            Ordered by time — edit a time to move a row.
                        </p>
                    </div>

                    {/* A table from `md` up. Below that it is six columns on a
                        390px screen, so the same rows are stacked as cards. */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className={`${TH} w-20 text-center`}>Public</th>
                                    <th scope="col" className={`${TH} w-32`}>Time</th>
                                    <th scope="col" className={`${TH} w-56`}>Event</th>
                                    <th scope="col" className={`${TH} w-56`}>Location</th>
                                    <th scope="col" className={TH}>Description</th>
                                    <th scope="col" className={`${TH} w-12`}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event, index) => (
                                    // A private row is tinted, so a glance down the
                                    // table answers "what do guests actually see?"
                                    <tr
                                        key={index}
                                        className={`border-t border-gray-100 ${isPublicEvent(event) ? '' : 'bg-gray-50/70'}`}
                                    >
                                        <td className="px-3 py-2 text-center">{publicToggle(index, event)}</td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={event.time}
                                                onChange={e => handleEventChange(index, 'time', e.target.value)}
                                                onBlur={() => commitTime(index)}
                                                className={CELL_INPUT}
                                                placeholder="4:00 PM"
                                                aria-label={`Time for row ${index + 1}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={event.title}
                                                onChange={e => handleEventChange(index, 'title', e.target.value)}
                                                className={CELL_INPUT}
                                                placeholder="Ceremony"
                                                aria-label={`Event for row ${index + 1}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={event.location}
                                                onChange={e => handleEventChange(index, 'location', e.target.value)}
                                                className={CELL_INPUT}
                                                placeholder="Garden Courtyard"
                                                aria-label={`Location for row ${index + 1}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={event.description}
                                                onChange={e => handleEventChange(index, 'description', e.target.value)}
                                                className={CELL_INPUT}
                                                placeholder="Brief details…"
                                                aria-label={`Description for row ${index + 1}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">{rowActions(index)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Phone: the same row, stacked. */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {events.map((event, index) => (
                            <div key={index} className={`p-4 space-y-2 ${isPublicEvent(event) ? '' : 'bg-gray-50/70'}`}>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                        {publicToggle(index, event)}
                                        Public
                                    </label>
                                    <div className="ml-auto">{rowActions(index)}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        value={event.time}
                                        onChange={e => handleEventChange(index, 'time', e.target.value)}
                                        onBlur={() => commitTime(index)}
                                        className={CELL_INPUT}
                                        placeholder="4:00 PM"
                                        aria-label={`Time for row ${index + 1}`}
                                    />
                                    <input
                                        type="text"
                                        value={event.title}
                                        onChange={e => handleEventChange(index, 'title', e.target.value)}
                                        className={CELL_INPUT}
                                        placeholder="Ceremony"
                                        aria-label={`Event for row ${index + 1}`}
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={event.location}
                                    onChange={e => handleEventChange(index, 'location', e.target.value)}
                                    className={CELL_INPUT}
                                    placeholder="Garden Courtyard"
                                    aria-label={`Location for row ${index + 1}`}
                                />
                                <input
                                    type="text"
                                    value={event.description}
                                    onChange={e => handleEventChange(index, 'description', e.target.value)}
                                    className={CELL_INPUT}
                                    placeholder="Brief details…"
                                    aria-label={`Description for row ${index + 1}`}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="p-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={addEvent}
                            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-accent hover:text-accent transition-all duration-300 font-medium flex items-center justify-center gap-2"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add row
                        </button>
                    </div>
                </div>

                {/* Extra cards under the timeline. Blank = not shown. */}
                <div className="space-y-4 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Details Cards</h2>
                    <p className="text-sm text-gray-500">Two optional cards shown under the schedule. Leave one blank to hide it.</p>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase">Getting There (shuttles, parking, transport)</label>
                        <textarea
                            rows={3}
                            value={shuttleText}
                            onChange={(e) => setShuttleText(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. Shuttles leave the hotel every 30 minutes from 2:30 PM. Return service starts at 9:00 PM."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase">Dress Code</label>
                        <textarea
                            rows={2}
                            value={dressCode}
                            onChange={(e) => setDressCode(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. Cocktail attire — suits or dresses, no jeans please."
                        />
                    </div>
                </div>

                {/* Nav Card Subtitle */}
                <div className="space-y-4 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Nav Card Subtitle</h2>
                    <p className="text-sm text-gray-500">Short tagline shown on the Schedule card at the bottom of the home page.</p>
                    <input
                        type="text"
                        value={scheduleSubtitle}
                        onChange={(e) => setScheduleSubtitle(e.target.value)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        placeholder="e.g. Every moment planned for you"
                    />
                </div>

                <div className="pt-4 sticky bottom-6">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full md:w-auto ml-auto flex justify-center py-3 px-8 border border-transparent rounded-xl shadow-lg text-base font-medium text-white bg-accent hover:bg-accent-dark hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all duration-300"
                    >
                        {loading ? 'Saving Schedule...' : 'Save Schedule Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
