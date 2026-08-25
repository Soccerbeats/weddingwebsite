'use client';

import { useState } from 'react';
import type { ShareLink, ShareScope } from '@/lib/honeymoon';
import { formatDate } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, MiniSelect, TextField } from './ui';

const SCOPES: { key: ShareScope; label: string; hint: string }[] = [
    { key: 'today', label: 'Today only', hint: 'Just the day you are on' },
    { key: 'itinerary', label: 'Whole itinerary', hint: 'Every day, with arrows' },
    { key: 'all', label: 'Itinerary + guide', hint: 'Adds the guide notes' },
];

/**
 * Read-only links, one per person you hand one to.
 *
 * A link is a credential in a URL, so the interface is built around that: it is
 * shown once next to a Copy button, it can be revoked without being deleted (a
 * link that leaked should stay dead), and it says when it was last opened so an
 * unused one is obvious.
 */
export default function ShareLinks({ api }: { api: HoneymoonApi }) {
    const shares = api.data?.shares ?? [];
    const [label, setLabel] = useState('');
    const [scope, setScope] = useState<ShareScope>('itinerary');
    const [expires, setExpires] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<number | null>(null);

    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const urlFor = (share: ShareLink) => `${origin}/honeymoon/${share.token}`;

    const create = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/admin/honeymoon/shares', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, scope, expires_on: expires || null }),
            });
            if (res.ok) {
                setLabel('');
                setExpires('');
                await api.refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const setRevoked = async (share: ShareLink, revoked: boolean) => {
        await fetch('/api/admin/honeymoon/shares', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: share.id, revoked }),
        });
        await api.refresh();
    };

    const destroy = async (share: ShareLink) => {
        if (!confirm(`Delete the link for ${share.label || 'this person'}? It stops working.`)) return;
        await fetch(`/api/admin/honeymoon/shares?id=${share.id}`, { method: 'DELETE' });
        await api.refresh();
    };

    const copy = async (share: ShareLink) => {
        try {
            await navigator.clipboard.writeText(urlFor(share));
            setCopied(share.id);
            setTimeout(() => setCopied(null), 2000);
        } catch { /* clipboard blocked — the link is on screen to select */ }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                    <label className="mb-1 block text-xs font-semibold text-gray-500">For whom</label>
                    <TextField
                        value={label}
                        placeholder="Heaven"
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Shows</label>
                    <MiniSelect
                        value={scope}
                        onChange={(e) => setScope(e.target.value as ShareScope)}
                    >
                        {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </MiniSelect>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Expires (optional)
                    </label>
                    <TextField
                        type="date"
                        value={expires}
                        onChange={(e) => setExpires(e.target.value)}
                    />
                </div>
                <Button tone="primary" onClick={create} disabled={busy}>
                    {busy ? 'Creating…' : 'Create link'}
                </Button>
            </div>

            {shares.length === 0 ? (
                <p className="text-xs text-gray-500">
                    No links yet. Anyone with one can read the trip; nobody with one can change it.
                </p>
            ) : (
                <ul className="space-y-2">
                    {shares.map((share) => (
                        <li
                            key={share.id}
                            className={`rounded-2xl border p-3 ${share.revoked
                                ? 'border-gray-200 bg-gray-50 opacity-60'
                                : 'border-gray-200'}`}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">
                                    {share.label || 'Unnamed link'}
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs
                                    text-gray-600">
                                    {SCOPES.find((s) => s.key === share.scope)?.label ?? share.scope}
                                </span>
                                {share.revoked && (
                                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs
                                        font-medium text-rose-700">
                                        Revoked
                                    </span>
                                )}
                                {share.expires_on && (
                                    <span className="text-xs text-gray-500">
                                        until {formatDate(share.expires_on)}
                                    </span>
                                )}
                                <span className="ml-auto text-xs text-gray-400">
                                    {share.last_seen_at
                                        ? `opened ${new Date(share.last_seen_at).toLocaleDateString()}`
                                        : 'never opened'}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <code className="min-w-0 flex-1 truncate rounded-xl bg-gray-50 px-2
                                    py-1.5 text-xs text-gray-600">
                                    {urlFor(share)}
                                </code>
                                <Button onClick={() => copy(share)}>
                                    {copied === share.id ? 'Copied' : 'Copy'}
                                </Button>
                                <Button onClick={() => setRevoked(share, !share.revoked)}>
                                    {share.revoked ? 'Restore' : 'Revoke'}
                                </Button>
                                <Button tone="danger" onClick={() => destroy(share)}>Delete</Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
