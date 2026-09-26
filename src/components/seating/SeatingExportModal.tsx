'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toCsv } from '@/lib/mailing';
import {
    DEFAULT_EXPORT_OPTIONS, csvHeaders, csvRows, exportFilename, seatedPeople,
    type ExportOptions, type SeatingExportData,
} from '@/lib/seatingExport';
import SeatingExportSheet from './SeatingExportSheet';

/**
 * Export the seating chart — as paper, or as a spreadsheet.
 *
 * The options are on the left and the actual sheet is on the right, live: the
 * preview is the same component the printer gets, shrunk to fit, so "both
 * sections, counts only, new page per table" is a thing you look at rather than
 * a thing you guess at and then print thirty pages to find out.
 */

/** A4 at 96dpi, less the 12mm margins `@page` sets. */
const PAGE_WIDTH = 794;

function Segment<T extends string>({ label, value, options, onChange }: {
    label: string;
    value: T;
    options: { value: T; label: string; hint?: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</h3>
            <div className="flex flex-col gap-1.5">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-left transition-colors ${
                            value === opt.value
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {opt.label}
                        {opt.hint && (
                            <span className={`ml-auto text-[10px] ${value === opt.value ? 'text-white/60' : 'text-gray-400'}`}>
                                {opt.hint}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Check({ checked, onChange, label, hint, disabled }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    hint?: string;
    disabled?: boolean;
}) {
    return (
        <label className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-xs ${
            disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-700 hover:bg-gray-50'
        }`}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={e => onChange(e.target.checked)}
                className="mt-0.5 accent-gray-900"
            />
            <span>
                {label}
                {hint && <span className="block text-[10px] text-gray-400 leading-snug">{hint}</span>}
            </span>
        </label>
    );
}

export default function SeatingExportModal({ onClose }: { onClose: () => void }) {
    const [data, setData] = useState<SeatingExportData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);

    const paneRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [sheetHeight, setSheetHeight] = useState(0);

    const set = useCallback(<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/admin/seating/export')
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load the chart'))))
            .then(json => { if (!cancelled) setData(json); })
            .catch(() => { if (!cancelled) setError('Could not load the seating chart.'); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // The preview is the real sheet at real width, scaled down to the pane. Its
    // height has to be measured rather than assumed: a transform does not change
    // how much room the element takes, so without this the pane scrolls through
    // a page and a half of empty space below a short chart.
    useLayoutEffect(() => {
        const pane = paneRef.current;
        const sheet = sheetRef.current;
        if (!pane || !sheet) return;
        const measure = () => {
            const available = pane.clientWidth - 32;
            setScale(Math.min(1, Math.max(0.3, available / PAGE_WIDTH)));
            setSheetHeight(sheet.scrollHeight);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(pane);
        observer.observe(sheet);
        return () => observer.disconnect();
    }, [data, options]);

    const downloadCsv = useCallback(() => {
        if (!data) return;
        const csv = toCsv(csvHeaders(options), csvRows(data, options));
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename('csv');
        a.click();
        URL.revokeObjectURL(url);
        onClose();
    }, [data, options, onClose]);

    const run = useCallback(() => {
        if (options.format === 'csv') { downloadCsv(); return; }
        window.print();
    }, [options.format, downloadCsv]);

    const people = data ? seatedPeople(data).length + data.unseated.length : 0;

    return (
        <>
            <div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 print:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Export seating chart"
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                        <div>
                            <h2 className="font-serif text-lg font-bold text-gray-800">Export seating chart</h2>
                            <p className="text-xs text-gray-500">
                                {data ? `${data.tables.length} tables · ${people} people` : 'Loading…'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-auto w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                        {/* Options */}
                        <div className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 overflow-y-auto p-5 flex flex-col gap-5">
                            <Segment
                                label="What to include"
                                value={options.sections}
                                onChange={v => set('sections', v)}
                                options={[
                                    { value: 'table', label: 'By table', hint: 'seating order' },
                                    { value: 'list', label: 'Alphabetical list', hint: 'find a name' },
                                    { value: 'both', label: 'Both', hint: '2 sections' },
                                ]}
                            />
                            <Segment
                                label="Level of detail"
                                value={options.detail}
                                onChange={v => set('detail', v)}
                                options={[
                                    { value: 'names', label: 'Every name' },
                                    { value: 'counts', label: 'Counts only' },
                                    { value: 'both', label: 'Names + counts' },
                                ]}
                            />
                            <div>
                                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Also show</h3>
                                <Check checked={options.kitchen} onChange={v => set('kitchen', v)} label="Kitchen summary" hint="Whole-wedding totals on page one" />
                                <Check checked={options.household} onChange={v => set('household', v)} label="Household" hint="Which invitation each person came in on" />
                                <Check checked={options.side} onChange={v => set('side', v)} label="Side" />
                                <Check checked={options.empty} onChange={v => set('empty', v)} label="Empty seats" />
                                <Check checked={options.unseated} onChange={v => set('unseated', v)} label="Not seated yet" />
                                <Check
                                    checked={options.vendors}
                                    onChange={v => set('vendors', v)}
                                    label="Vendors"
                                    hint={
                                        data && data.vendors.length === 0
                                            ? 'None added yet — the Vendors tab on the guest list'
                                            : 'Who is in the building, and who is being fed'
                                    }
                                />
                                <Check checked={options.pageBreak} onChange={v => set('pageBreak', v)} label="New page per table" />
                                <Check
                                    checked={false}
                                    onChange={() => {}}
                                    disabled
                                    label="Entrée choice"
                                    hint="Not collected — the RSVP form asks for restrictions only"
                                />
                            </div>
                            <Segment
                                label="Format"
                                value={options.format}
                                onChange={v => set('format', v)}
                                options={[
                                    { value: 'print', label: 'Print / PDF' },
                                    { value: 'csv', label: 'Spreadsheet', hint: '.csv' },
                                ]}
                            />
                        </div>

                        {/* Preview */}
                        <div ref={paneRef} className="flex-1 min-w-0 bg-gray-100 overflow-auto p-4">
                            {error && <p className="text-xs text-red-600">{error}</p>}
                            {!data && !error && <p className="text-xs text-gray-400">Building the sheet…</p>}
                            {data && options.format === 'csv' && (
                                <div className="bg-white rounded-lg shadow p-5 text-[11px] text-gray-600">
                                    <p className="font-medium text-gray-800 mb-2">{exportFilename('csv')}</p>
                                    <p className="mb-3">
                                        One row per person — {csvRows(data, options).length} rows,{' '}
                                        {csvHeaders(options).length} columns. Each restriction is its own
                                        yes/blank column, so a pivot gives the same counts the printed sheet shows.
                                    </p>
                                    <pre className="bg-gray-50 rounded p-3 overflow-x-auto font-mono text-[10px] leading-5">
{[csvHeaders(options).join(','), ...csvRows(data, options).slice(0, 8).map(r => r.join(','))].join('\n')}
{csvRows(data, options).length > 8 ? `\n… ${csvRows(data, options).length - 8} more rows` : ''}
                                    </pre>
                                </div>
                            )}
                            {data && options.format === 'print' && (
                                <div
                                    className="mx-auto bg-white shadow-lg"
                                    style={{ width: PAGE_WIDTH * scale, height: sheetHeight * scale || undefined }}
                                >
                                    <div
                                        ref={sheetRef}
                                        style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                                    >
                                        <SeatingExportSheet data={data} options={options} preview />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
                        <p className="text-[11px] text-gray-400 hidden sm:block">
                            {options.format === 'print'
                                ? 'Opens your printer dialog — choose “Save as PDF” there.'
                                : 'Downloads a spreadsheet you can open in Excel or Sheets.'}
                        </p>
                        <button
                            onClick={onClose}
                            className="ml-auto px-5 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={run}
                            disabled={!data}
                            className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40"
                        >
                            {options.format === 'print' ? 'Print' : 'Download'}
                        </button>
                    </div>
                </div>
            </div>

            {/* The copy that actually prints: a direct child of <body>, because the
                admin shell is a fixed, overflow-hidden box that would clip it to one
                page. `.print-sheet` is the existing rule that hides everything else. */}
            {data && options.format === 'print' && typeof document !== 'undefined' && createPortal(
                <div className="print-sheet hidden print:block">
                    <SeatingExportSheet data={data} options={options} />
                </div>,
                document.body,
            )}
        </>
    );
}
