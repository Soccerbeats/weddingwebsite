'use client';

import React, { useMemo, useState } from 'react';

interface ReconcileGuest {
    id: number;
    guest_name: string;
    address?: string;
}

interface Props {
    guests: ReconcileGuest[];
    onClose: () => void;
    onApplied: () => void;
}

type RowStatus = 'differ' | 'csv_only' | 'match' | 'not_in_csv';

interface CompareRow {
    id: number;
    name: string;
    siteAddress: string;
    csvAddress: string;
    status: RowStatus;
    // which value the admin has chosen to keep for actionable rows
    choice: 'site' | 'csv';
}

// --- helpers -------------------------------------------------------------

// Split a full CSV text into rows, honoring quoted fields that span newlines.
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    // Normalize newlines, then split on newlines that are not inside quotes.
    const normalized = text.replace(/\r\n?/g, '\n');
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (inQuotes) {
            if (ch === '"') {
                if (normalized[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field); field = '';
        } else if (ch === '\n') {
            row.push(field); field = '';
            rows.push(row); row = [];
        } else field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows;
}

// Normalize a name for matching: lowercase, strip parentheticals, collapse spaces.
function normName(s: string): string {
    return (s || '')
        .replace(/\([^)]*\)/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Normalize an address for comparison so trivial formatting isn't flagged.
function normAddr(s: string): string {
    return (s || '')
        .toLowerCase()
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/[.,\s]+$/, '')
        .trim();
}

// --- component -----------------------------------------------------------

export default function AddressReconcileModal({ guests, onClose, onApplied }: Props) {
    const [rows, setRows] = useState<CompareRow[] | null>(null);
    const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
    const [filter, setFilter] = useState<'review' | 'all'>('review');
    const [error, setError] = useState<string | null>(null);
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState<number | null>(null);

    const handleFile = async (file: File) => {
        setError(null);
        setApplied(null);
        try {
            const text = await file.text();
            const grid = parseCsv(text);

            // Find the header row: has a "Names (...)" cell and an "Address:" cell.
            const headerIdx = grid.findIndex(r => {
                const cells = r.map(c => c.trim());
                return cells.some(c => /^names\s*\(/i.test(c)) && cells.some(c => c.toLowerCase() === 'address:');
            });
            if (headerIdx === -1) {
                setError('Could not find a header row with a "Names (…)" column and an "Address:" column. Is this the right spreadsheet?');
                return;
            }
            const header = grid[headerIdx].map(c => c.trim());
            const nameCol = header.findIndex(c => /^names\s*\(/i.test(c));
            const addrCol = header.findIndex(c => c.toLowerCase() === 'address:');

            // Build a map of normalized name -> best CSV address.
            const csvByName = new Map<string, string>();
            for (const r of grid.slice(headerIdx + 1)) {
                const rawName = (r[nameCol] || '').trim();
                if (!rawName) continue;
                const key = normName(rawName);
                if (!key) continue;
                const addr = (r[addrCol] || '').trim();
                if (!csvByName.has(key) || (!csvByName.get(key) && addr)) {
                    csvByName.set(key, addr);
                }
            }

            const matchedKeys = new Set<string>();
            const compare: CompareRow[] = guests.map(g => {
                const key = normName(g.guest_name);
                const site = (g.address || '').trim();
                const hasCsv = csvByName.has(key);
                const csv = hasCsv ? (csvByName.get(key) || '') : '';
                if (hasCsv) matchedKeys.add(key);

                let status: RowStatus;
                if (!hasCsv) status = 'not_in_csv';
                else if (!csv) status = site ? 'match' : 'match'; // csv blank → nothing to offer
                else if (!site) status = 'csv_only';
                else status = normAddr(site) === normAddr(csv) ? 'match' : 'differ';

                // Default choice: fill blanks from CSV, otherwise keep the site value.
                const choice: 'site' | 'csv' = status === 'csv_only' ? 'csv' : 'site';
                return { id: g.id, name: g.guest_name, siteAddress: site, csvAddress: csv, status, choice };
            });

            // CSV names that matched no website guest (informational only).
            const unmatched: string[] = [];
            for (const [key] of csvByName) {
                if (!matchedKeys.has(key)) unmatched.push(key);
            }

            setRows(compare);
            setUnmatchedNames(unmatched);
            // If nothing needs review, show everything so the screen isn't empty.
            const needsReview = compare.some(r => r.status === 'differ' || r.status === 'csv_only');
            setFilter(needsReview ? 'review' : 'all');
        } catch (e) {
            console.error(e);
            setError('Failed to read the CSV file.');
        }
    };

    const counts = useMemo(() => {
        const c = { differ: 0, csv_only: 0, match: 0, not_in_csv: 0 };
        (rows || []).forEach(r => { c[r.status]++; });
        return c;
    }, [rows]);

    const actionable = (r: CompareRow) => r.status === 'differ' || r.status === 'csv_only';

    const visibleRows = useMemo(() => {
        if (!rows) return [];
        return filter === 'review' ? rows.filter(actionable) : rows;
    }, [rows, filter]);

    const pendingChanges = useMemo(
        () => (rows || []).filter(r => actionable(r) && r.choice === 'csv' && normAddr(r.csvAddress) !== normAddr(r.siteAddress)),
        [rows],
    );

    const setChoice = (id: number, choice: 'site' | 'csv') => {
        setRows(prev => (prev ? prev.map(r => (r.id === id ? { ...r, choice } : r)) : prev));
    };

    const bulk = (choice: 'site' | 'csv') => {
        setRows(prev => (prev ? prev.map(r => (actionable(r) ? { ...r, choice } : r)) : prev));
    };

    const handleApply = async () => {
        if (pendingChanges.length === 0) return;
        setApplying(true);
        let ok = 0;
        for (const r of pendingChanges) {
            try {
                const res = await fetch('/api/admin/guest-list', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: r.id, address: r.csvAddress }),
                });
                if (res.ok) ok++;
            } catch (e) {
                console.error('Failed to update', r.name, e);
            }
        }
        setApplying(false);
        setApplied(ok);
        onApplied();
    };

    const statusBadge = (s: RowStatus) => {
        const map: Record<RowStatus, { label: string; cls: string }> = {
            differ: { label: 'Differs', cls: 'bg-amber-100 text-amber-800' },
            csv_only: { label: 'Missing on site', cls: 'bg-blue-100 text-blue-800' },
            match: { label: 'Match', cls: 'bg-green-100 text-green-700' },
            not_in_csv: { label: 'Not in CSV', cls: 'bg-gray-100 text-gray-500' },
        };
        const { label, cls } = map[s];
        return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Compare Addresses from CSV</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Upload your spreadsheet to compare each guest&apos;s address against what&apos;s on the site,
                            then choose which to keep.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {!rows ? (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                The tool reads the <span className="font-mono bg-gray-100 px-1 rounded">Names (…)</span> and{' '}
                                <span className="font-mono bg-gray-100 px-1 rounded">Address:</span> columns and matches guests by name.
                            </p>
                            <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
                                <input
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                                />
                                <span className="text-accent font-medium">Click to choose a CSV file</span>
                                <p className="text-xs text-gray-400 mt-1">.csv exported from your guest-list spreadsheet</p>
                            </label>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-xl bg-amber-50 p-3 text-center">
                                    <p className="text-2xl font-bold text-amber-700">{counts.differ}</p>
                                    <p className="text-xs text-amber-700">Differ</p>
                                </div>
                                <div className="rounded-xl bg-blue-50 p-3 text-center">
                                    <p className="text-2xl font-bold text-blue-700">{counts.csv_only}</p>
                                    <p className="text-xs text-blue-700">Missing on site</p>
                                </div>
                                <div className="rounded-xl bg-green-50 p-3 text-center">
                                    <p className="text-2xl font-bold text-green-700">{counts.match}</p>
                                    <p className="text-xs text-green-700">Match</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3 text-center">
                                    <p className="text-2xl font-bold text-gray-500">{counts.not_in_csv}</p>
                                    <p className="text-xs text-gray-500">Not in CSV</p>
                                </div>
                            </div>

                            {unmatchedNames.length > 0 && (
                                <p className="text-xs text-gray-400">
                                    {unmatchedNames.length} CSV name{unmatchedNames.length === 1 ? '' : 's'} didn&apos;t match any guest on the site (likely plus-ones or people not invited on the site) — ignored.
                                </p>
                            )}

                            {/* Controls */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-b border-gray-100 py-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setFilter('review')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === 'review' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Needs review ({counts.differ + counts.csv_only})
                                    </button>
                                    <button
                                        onClick={() => setFilter('all')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        All ({rows.length})
                                    </button>
                                </div>
                                <div className="flex gap-2 text-xs">
                                    <button onClick={() => bulk('csv')} className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Use CSV for all</button>
                                    <button onClick={() => bulk('site')} className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Keep site for all</button>
                                </div>
                            </div>

                            {/* Rows */}
                            {visibleRows.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">Nothing to show for this filter.</p>
                            ) : (
                                <div className="space-y-3">
                                    {visibleRows.map(r => (
                                        <div key={r.id} className="border border-gray-200 rounded-xl p-3">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="font-semibold text-gray-900">{r.name}</span>
                                                {statusBadge(r.status)}
                                            </div>
                                            {actionable(r) ? (
                                                <div className="grid sm:grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => setChoice(r.id, 'site')}
                                                        className={`text-left rounded-lg border p-2.5 text-sm transition-colors ${r.choice === 'site' ? 'border-accent ring-1 ring-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'}`}
                                                    >
                                                        <span className="block text-xs font-medium text-gray-500 mb-0.5">Website{r.choice === 'site' ? ' ✓' : ''}</span>
                                                        <span className="text-gray-800">{r.siteAddress || <em className="text-gray-400">(blank)</em>}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setChoice(r.id, 'csv')}
                                                        className={`text-left rounded-lg border p-2.5 text-sm transition-colors ${r.choice === 'csv' ? 'border-accent ring-1 ring-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'}`}
                                                    >
                                                        <span className="block text-xs font-medium text-gray-500 mb-0.5">CSV{r.choice === 'csv' ? ' ✓' : ''}</span>
                                                        <span className="text-gray-800">{r.csvAddress || <em className="text-gray-400">(blank)</em>}</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-gray-500">
                                                    {r.siteAddress || <em className="text-gray-400">(blank)</em>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {rows && (
                    <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">
                            {applied !== null
                                ? <span className="text-green-700 font-medium">Applied {applied} update{applied === 1 ? '' : 's'}.</span>
                                : <span>{pendingChanges.length} change{pendingChanges.length === 1 ? '' : 's'} selected</span>}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50">
                                {applied !== null ? 'Close' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={applying || pendingChanges.length === 0}
                                className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-xl hover:bg-accent/90 disabled:opacity-50"
                            >
                                {applying ? 'Applying…' : `Apply ${pendingChanges.length} change${pendingChanges.length === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
