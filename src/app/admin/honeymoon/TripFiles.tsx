'use client';

import { useRef, useState } from 'react';
import { DOCUMENT_KINDS, formatDate } from '@/lib/honeymoon';
import type { DocumentKind } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, MiniSelect, TextField } from './ui';

/**
 * Passports, visas, insurance, e-tickets.
 *
 * Worth having because of the offline snapshot: a document you can open at a
 * border with no signal is the point, and a photo buried in a camera roll from
 * March is not that.
 *
 * A caveat stated plainly rather than hidden: these are served from the same
 * volume as every other upload, through `/api/photos/…`, so a file's URL is not
 * a secret. It is convenience on the trip, not a safe.
 */
export default function TripFiles({ api }: { api: HoneymoonApi }) {
    const documents = api.data?.documents ?? [];
    const input = useRef<HTMLInputElement>(null);
    const [kind, setKind] = useState<DocumentKind>('passport');
    const [person, setPerson] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        setError('');
        try {
            for (const file of Array.from(files)) {
                const body = new FormData();
                body.append('file', file);
                body.append('kind', 'document');
                const res = await fetch('/api/admin/honeymoon/upload', { method: 'POST', body });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok || !payload.filename) {
                    setError(payload.error ?? 'That upload failed');
                    continue;
                }
                await api.create('documents', {
                    name: file.name.replace(/\.[^.]+$/, ''),
                    kind,
                    path: payload.filename,
                    person: person.trim(),
                });
            }
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">What is it</label>
                    <MiniSelect value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                        {DOCUMENT_KINDS.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                                {entry.icon} {entry.label}
                            </option>
                        ))}
                    </MiniSelect>
                </div>
                <div className="w-32">
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Whose</label>
                    <TextField
                        value={person}
                        placeholder="Optional"
                        onChange={(e) => setPerson(e.target.value)}
                    />
                </div>
                <input
                    ref={input}
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => upload(e.target.files)}
                />
                <Button tone="primary" onClick={() => input.current?.click()} disabled={busy}>
                    {busy ? 'Uploading…' : '+ Add a file'}
                </Button>
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}

            {documents.length === 0 ? (
                <p className="text-xs text-gray-400">
                    Nothing yet. Images and PDFs up to 25 MB — they are cached by the offline
                    snapshot, so they open at a border with no signal.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {documents.map((document) => {
                        const meta = DOCUMENT_KINDS.find((entry) => entry.key === document.kind);
                        return (
                            <li
                                key={document.id}
                                className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50
                                    px-2.5 py-1.5"
                            >
                                <span aria-hidden>{meta?.icon ?? '📎'}</span>
                                <a
                                    href={`/api/photos/${document.path}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-0 flex-1 truncate text-sm text-gray-800
                                        hover:text-accent hover:underline"
                                >
                                    {document.name}
                                </a>
                                {document.person && (
                                    <span className="text-[11px] text-gray-500">
                                        {document.person}
                                    </span>
                                )}
                                {document.expires_on && (
                                    <span className="text-[11px] text-amber-700">
                                        expires {formatDate(document.expires_on)}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => api.removeRow(
                                        'documents', document, `Removed ${document.name}`,
                                    )}
                                    className="text-[11px] text-gray-500 underline decoration-dotted"
                                >
                                    Remove
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
