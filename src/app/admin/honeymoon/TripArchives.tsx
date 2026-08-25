'use client';

import { useState } from 'react';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, TextField } from './ui';

/**
 * Snapshots of the whole trip.
 *
 * Two things this makes possible that the singleton could not: keeping the
 * honeymoon after you have flown home, and starting the next trip from a copy of
 * it. Restoring replaces what is live — so it snapshots the current state first,
 * under its own name, which makes even that undoable.
 */
export default function TripArchives({ api }: { api: HoneymoonApi }) {
    const archives = api.data?.archives ?? [];
    const [name, setName] = useState('');
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');

    const snapshot = async () => {
        setBusy('save');
        setMessage('');
        try {
            const res = await fetch('/api/admin/honeymoon/archives', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) { setMessage('Could not save a snapshot.'); return; }
            setName('');
            await api.refresh();
            setMessage('Saved.');
        } finally {
            setBusy('');
        }
    };

    const restore = async (id: number, label: string) => {
        if (!confirm(
            `Restore “${label}”? Everything currently in the portal is replaced — `
            + 'the current state is snapshotted first, so this is undoable.',
        )) return;
        setBusy(`restore-${id}`);
        setMessage('');
        try {
            const res = await fetch('/api/admin/honeymoon/archives', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, confirm: true }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { setMessage(body.error ?? 'Could not restore that.'); return; }
            await api.refresh();
            setMessage(`Restored “${body.restored}”. The previous state was saved as a snapshot.`);
        } finally {
            setBusy('');
        }
    };

    const forget = async (id: number, label: string) => {
        if (!confirm(`Delete the snapshot “${label}”? This one is not undoable.`)) return;
        await fetch(`/api/admin/honeymoon/archives?id=${id}`, { method: 'DELETE' });
        await api.refresh();
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                    <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Call it
                    </label>
                    <TextField
                        value={name}
                        placeholder="Before I moved everything to week two"
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <Button tone="primary" onClick={snapshot} disabled={busy === 'save'}>
                    {busy === 'save' ? 'Saving…' : 'Snapshot the trip'}
                </Button>
            </div>

            {message && <p className="text-xs text-gray-600">{message}</p>}

            {archives.length === 0 ? (
                <p className="text-xs text-gray-400">
                    No snapshots yet. Worth taking one before a big reshuffle — and one at the end,
                    which is how the portal outlives the honeymoon.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {archives.map((archive) => (
                        <li
                            key={archive.id}
                            className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50
                                px-2.5 py-1.5"
                        >
                            <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                                {archive.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">
                                {archive.places} places · {archive.days} days
                                {archive.created_at
                                    ? ` · ${new Date(archive.created_at).toLocaleDateString()}`
                                    : ''}
                            </span>
                            <Button
                                onClick={() => restore(archive.id, archive.name)}
                                disabled={busy === `restore-${archive.id}`}
                            >
                                {busy === `restore-${archive.id}` ? 'Restoring…' : 'Restore'}
                            </Button>
                            <Button tone="danger" onClick={() => forget(archive.id, archive.name)}>
                                Delete
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
