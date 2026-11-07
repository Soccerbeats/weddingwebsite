'use client';

import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    blankEvent, cleanIsoDate, eventDay, isPublicEvent, normalizeEventTime, SCHEDULE_HEADERS, scheduleRows,
    sortSchedule, storedDate, type ScheduleEvent,
} from '@/lib/schedule';
import { weddingIsoDate } from '@/lib/weddingDate';
import { toCsv } from '@/lib/mailing';
import { ColumnResizer, useColumnWidths } from '@/components/admin/useColumnWidths';
import { SaveStatus, useAutosave } from '@/components/admin/useAutosave';

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
 * The order is the times, so there is nothing here for dragging rows about: to
 * move something, change when it happens. Leaving a time field tidies what was
 * typed — `8am` becomes `8:00 AM` — but the row does not go anywhere until
 * **Enter**. That split is the point: a new row is filled in by tabbing across
 * it, and a table that re-sorted on each cell would pull the row out from under
 * the cursor halfway through. Enter says "done, file it".
 *
 * Everything saves itself. There is no save button, so the page has to be
 * honest about where a change has got to — hence the status by the row counts,
 * which is the one thing on screen that says whether what you typed is safe.
 */

/** The form as the API takes it. Built in one place so what autosave compares
 *  against storage is exactly what it would write. */
function buildPayload(events: ScheduleEvent[], subtitle: string, shuttle: string, dress: string) {
    return {
        scheduleEvents: events,
        scheduleSubtitle: subtitle,
        scheduleShuttleText: shuttle,
        scheduleDressCode: dress,
    };
}

/**
 * The table's columns, and how wide they start.
 *
 * The ids are the storage keys for a viewer's dragged widths, so renaming one
 * costs that viewer their setting for that column — everything else survives,
 * because unknown ids fall back to the default rather than being kept.
 */
const COLUMNS = [
    { id: 'public', label: 'Public', width: 84 },
    { id: 'day', label: 'Day', width: 160 },
    { id: 'time', label: 'Time', width: 124 },
    { id: 'title', label: 'Event', width: 208 },
    { id: 'location', label: 'Location', width: 208 },
    { id: 'description', label: 'Description', width: 280 },
    { id: 'actions', label: '', width: 56 },
] as const;

const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(
    COLUMNS.map(c => [c.id, c.width]),
);

/** The header cell style, shared so the two column sets line up. */
const TH = 'relative text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2';
/** `2027-04-30` as "Fri, Apr 30". */
function shortDay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** `2027-04-30` as "Friday, April 30". */
function longDay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const CELL_INPUT =
    'w-full rounded-xl bg-gray-50 border border-transparent px-3 py-2 text-sm text-gray-900 ' +
    'focus:bg-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors';

export default function AdminSchedule() {
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [scheduleSubtitle, setScheduleSubtitle] = useState('');
    const [shuttleText, setShuttleText] = useState('');
    const [dressCode, setDressCode] = useState('');
    const [loaded, setLoaded] = useState(false);
    /** The wedding date from Settings, which is the day a row with no date of its own is on. */
    const [weddingIso, setWeddingIso] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                const wedding = weddingIsoDate(data.weddingDate);
                setWeddingIso(wedding);
                const day: ScheduleEvent[] = data.scheduleEvents
                    ? sortSchedule(data.scheduleEvents, wedding)
                    // Default starter event if empty
                    : [{ time: '4:00 PM', title: 'Ceremony', description: '', location: '', public: true }];
                const subtitle = data.scheduleSubtitle ?? '';
                const shuttle = data.scheduleShuttleText ?? '';
                const dress = data.scheduleDressCode ?? '';

                setEvents(day);
                setScheduleSubtitle(subtitle);
                setShuttleText(shuttle);
                setDressCode(dress);
                // `loaded` last: the hook takes what is on screen at that point
                // as its baseline, and the day has just been sorted, so opening
                // the page and reading it must not count as a change.
                setLoaded(true);
            })
            .catch(err => console.error('Failed to load the schedule:', err));
    }, []);

    const publicCount = useMemo(() => events.filter(isPublicEvent).length, [events]);
    /** The days the schedule covers, in order. More than one turns on the day headings. */
    const dayKeys = useMemo(
        () => [...new Set(events.map(ev => eventDay(ev, weddingIso)))],
        [events, weddingIso],
    );
    const multiDay = dayKeys.length > 1;
    const dayTitle = (key: string) =>
        key === (weddingIso ?? '') ? (key ? `${longDay(key)} · the wedding day` : 'The wedding day') : longDay(key);
    /** A day heading goes above the first row of each day, once there is more than one. */
    const startsDay = (index: number) =>
        multiDay && (index === 0 || eventDay(events[index], weddingIso) !== eventDay(events[index - 1], weddingIso));

    const payload = useMemo(
        () => buildPayload(events, scheduleSubtitle, shuttleText, dressCode),
        [events, scheduleSubtitle, shuttleText, dressCode],
    );

    const { widths, startResize, resetColumn, resetAll, changed: resized } =
        useColumnWidths('schedule.columnWidths.v1', DEFAULT_WIDTHS);
    /** The table is at least as wide as its columns; the container scrolls. */
    const totalWidth = COLUMNS.reduce((n, c) => n + (widths[c.id] ?? c.width), 0);

    const handleEventChange = <K extends keyof ScheduleEvent>(index: number, field: K, value: ScheduleEvent[K]) => {
        setEvents(events.map((ev, i) => (i === index ? { ...ev, [field]: value } : ev)));
    };

    /** A blank row at the end of a day (the wedding day unless said otherwise),
     *  with the cursor already in its time cell. It has no time yet, so nothing
     *  sorts it away while it is being filled. */
    const addEvent = (day: string = weddingIso ?? '') => {
        let index = events.length;
        for (let i = events.length - 1; i >= 0; i--) {
            if (eventDay(events[i], weddingIso) === day) { index = i + 1; break; }
        }
        const row = { ...blankEvent(), ...(storedDate(day, weddingIso) ? { date: day } : {}) };
        setEvents([...events.slice(0, index), row, ...events.slice(index)]);
        requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>(`[data-time-cell="${index}"]`)?.focus();
        });
    };
    const removeEvent = (index: number) => setEvents(events.filter((_, i) => i !== index));

    /**
     * Tidy a time, without moving the row.
     *
     * On leaving the time cell: `8am` becomes `8:00 AM` where it sits. Tidying
     * is safe here precisely because it does not reorder — the row keeps its
     * place while the rest of it is tabbed through.
     */
    const tidyTime = (index: number) => {
        setEvents(current => current.map(
            (ev, i) => (i === index ? { ...ev, time: normalizeEventTime(ev.time) } : ev),
        ));
    };

    /**
     * Enter: tidy the time and file the row by the clock.
     *
     * Focus is dropped on the way out. Rows are keyed by position, so after a
     * sort the input under the cursor would be showing a different row's data —
     * letting go is the honest answer to "done with this one".
     */
    const commitRow = (index: number, from: HTMLElement) => {
        setEvents(current => sortSchedule(current.map(
            (ev, i) => (i === index ? { ...ev, time: normalizeEventTime(ev.time) } : ev),
        ), weddingIso));
        from.blur();
    };

    /** Move a row to another day. Picking a date is a finished act, so the row
     *  is filed straight away — under its new day, by its time. */
    const moveToDay = (index: number, date: string | undefined) => {
        setEvents(current => sortSchedule(current.map((ev, i) => {
            if (i !== index) return ev;
            const next = { ...ev, time: normalizeEventTime(ev.time) };
            if (date) next.date = date; else delete next.date;
            return next;
        }), weddingIso));
    };

    /** Enter anywhere in a row files it; every other key is left alone. */
    const rowKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commitRow(index, e.target as HTMLElement);
    };

    const save = useCallback(async (body: ReturnType<typeof buildPayload>) => {
        const res = await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
    }, []);

    const { state: saveState, retry } = useAutosave({ value: payload, ready: loaded, save });

    /**
     * The day as a spreadsheet — every row, in the order shown, with a Public
     * column so the file is not mistaken for the guest-facing schedule.
     */
    const exportCsv = () => {
        const csv = toCsv([...SCHEDULE_HEADERS], scheduleRows(events, weddingIso));
        const stamp = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule-${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
                guests should see on the schedule page — everything else stays here. A weekend? Give a row its
                own <span className="font-medium text-gray-800">Day</span> — the welcome drinks the night before, the
                brunch after — and guests see the schedule day by day. Changes save themselves.
            </p>

            <div className="space-y-8">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200">
                        <p className="text-sm text-gray-500">
                            {events.length} row{events.length === 1 ? '' : 's'} ·{' '}
                            <span className="font-medium text-gray-700">{publicCount} public</span>
                            {events.length - publicCount > 0 && ` · ${events.length - publicCount} private`}
                        </p>
                        <p className="hidden sm:block text-xs text-gray-400">
                            Ordered by day and time — press Enter to file a row.
                        </p>
                        <div className="ml-auto flex items-center gap-2">
                            {resized && (
                                <button
                                    type="button"
                                    onClick={resetAll}
                                    className="hidden md:inline-block px-4 py-1 rounded-full text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                                    title="Put every column back to its starting width"
                                >
                                    Reset widths
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={exportCsv}
                                disabled={events.length === 0}
                                className="px-4 py-1 rounded-full text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                title="Every row, with a Public column, as a spreadsheet"
                            >
                                ⬇ Export CSV
                            </button>
                            <SaveStatus state={saveState} onRetry={retry} />
                        </div>
                    </div>

                    {/* A table from `md` up. Below that it is six columns on a
                        390px screen, so the same rows are stacked as cards. */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full table-fixed" style={{ minWidth: totalWidth }}>
                            {/* `table-fixed` plus an explicit colgroup: without
                                both, the browser re-apportions the columns from
                                their contents and a dragged width lasts until
                                the next keystroke. The container scrolls
                                sideways when the total outgrows it. */}
                            <colgroup>
                                {COLUMNS.map(col => (
                                    <col key={col.id} style={{ width: widths[col.id] }} />
                                ))}
                            </colgroup>
                            <thead className="bg-gray-50">
                                <tr>
                                    {COLUMNS.map((col, i) => (
                                        <th
                                            key={col.id}
                                            scope="col"
                                            className={`${TH} ${col.id === 'public' ? 'text-center' : ''}`}
                                        >
                                            {col.label
                                                ? <span className="truncate block">{col.label}</span>
                                                : <span className="sr-only">Actions</span>}
                                            {/* No handle on the last column: its
                                                right edge is the table's, and
                                                dragging it resizes nothing the
                                                eye can follow. */}
                                            {i < COLUMNS.length - 1 && (
                                                <ColumnResizer
                                                    label={col.label || 'actions'}
                                                    onPointerDown={startResize(col.id)}
                                                    onReset={() => resetColumn(col.id)}
                                                />
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event, index) => (
                                    <Fragment key={index}>
                                    {startsDay(index) && (
                                        <tr className="border-t border-gray-200 bg-accent/5">
                                            <td colSpan={COLUMNS.length} className="px-4 py-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-semibold text-gray-900">
                                                        {dayTitle(eventDay(event, weddingIso))}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => addEvent(eventDay(event, weddingIso))}
                                                        className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-accent-dark hover:bg-accent/10 transition-colors"
                                                    >
                                                        + Add to this day
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {/* A private row is tinted, so a glance down the
                                        table answers "what do guests actually see?" */}
                                    <tr
                                        onKeyDown={rowKeyDown(index)}
                                        className={`border-t border-gray-100 ${isPublicEvent(event) ? '' : 'bg-gray-50/70'}`}
                                    >
                                        <td className="px-3 py-2 text-center">{publicToggle(index, event)}</td>
                                        <td className="px-3 py-2">
                                            <DayCell
                                                date={event.date}
                                                weddingIso={weddingIso}
                                                onChange={date => moveToDay(index, date)}
                                                label={`Day for row ${index + 1}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={event.time}
                                                onChange={e => handleEventChange(index, 'time', e.target.value)}
                                                onBlur={() => tidyTime(index)}
                                                data-time-cell={index}
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
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Phone: the same row, stacked. */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {events.map((event, index) => (
                            <Fragment key={index}>
                            {startsDay(index) && (
                                <div className="flex items-center gap-3 bg-accent/5 px-4 py-2">
                                    <span className="text-sm font-semibold text-gray-900">
                                        {dayTitle(eventDay(event, weddingIso))}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => addEvent(eventDay(event, weddingIso))}
                                        className="ml-auto min-h-[44px] rounded-full px-3 text-xs font-medium text-accent-dark"
                                    >
                                        + Add
                                    </button>
                                </div>
                            )}
                            <div
                                onKeyDown={rowKeyDown(index)}
                                className={`p-4 space-y-2 ${isPublicEvent(event) ? '' : 'bg-gray-50/70'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                        {publicToggle(index, event)}
                                        Public
                                    </label>
                                    <div className="ml-auto">{rowActions(index)}</div>
                                </div>
                                <DayCell
                                    date={event.date}
                                    weddingIso={weddingIso}
                                    onChange={date => moveToDay(index, date)}
                                    label={`Day for row ${index + 1}`}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        value={event.time}
                                        onChange={e => handleEventChange(index, 'time', e.target.value)}
                                        onBlur={() => tidyTime(index)}
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
                            </Fragment>
                        ))}
                    </div>

                    <div className="p-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => addEvent()}
                            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-accent hover:text-accent transition-all duration-300 font-medium flex items-center justify-center gap-2"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            {multiDay ? 'Add a row to the wedding day' : 'Add row'}
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

            </div>
        </div>
    );
}

/**
 * Which day a row happens on. Reads "♥ Wedding day" until it is moved — a row
 * with no date belongs to the wedding, so changing the wedding date in Settings
 * carries it along — and opens the browser's own calendar when clicked.
 */
function DayCell({ date, weddingIso, onChange, label }: {
    date: string | undefined;
    weddingIso: string | null;
    onChange: (date: string | undefined) => void;
    label: string;
}) {
    const picker = useRef<HTMLInputElement>(null);
    const own = cleanIsoDate(date);
    const onWeddingDay = !own || own === weddingIso;
    const open = () => {
        const input = picker.current;
        if (!input) return;
        try { input.showPicker(); } catch { input.focus(); }
    };
    return (
        <div className="relative flex items-center">
            <button
                type="button"
                onClick={open}
                className={`${CELL_INPUT} flex items-center gap-1.5 whitespace-nowrap text-left ${onWeddingDay ? '' : 'pr-8'}`}
                aria-label={`${label}: ${onWeddingDay ? 'the wedding day' : shortDay(own!)}`}
            >
                {onWeddingDay
                    ? <><span className="text-accent" aria-hidden="true">♥</span><span className="text-gray-600">Wedding day</span></>
                    : <span className="font-medium">{shortDay(own!)}</span>}
            </button>
            {/* The real input sits behind the button, invisible: it is only here
                to draw the calendar. */}
            <input
                ref={picker}
                type="date"
                tabIndex={-1}
                aria-hidden="true"
                value={own ?? weddingIso ?? ''}
                onChange={e => onChange(storedDate(e.target.value, weddingIso))}
                className="pointer-events-none absolute inset-0 opacity-0"
            />
            {!onWeddingDay && (
                <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                    title="Back to the wedding day"
                    aria-label="Back to the wedding day"
                >
                    ×
                </button>
            )}
        </div>
    );
}
