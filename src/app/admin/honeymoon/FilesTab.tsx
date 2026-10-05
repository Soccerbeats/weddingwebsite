'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DOCUMENT_KINDS, formatDate, travelModeMeta,
    type DocumentKind, type TripDocument,
} from '@/lib/honeymoon';
import {
    documentFolders, documentWarnings, filterDocuments, guessDocumentKind, isImageFile,
} from '@/lib/honeymoonFiles';
import { useHoneymoonApi } from './HoneymoonContext';
import { partnersOf } from './PlaceNotes';
import { useLocalPref } from './useLocalPref';
import { FilterChips } from './kit/FilterButton';
import { Hint } from './kit/Hint';
import { Segmented } from './kit/Segmented';
import { Sheet } from './kit/Sheet';
import { TabToolbar } from './kit/TabToolbar';
import { Button, EmptyState, InlineText, MiniSelect, OverflowMenu } from './ui';

const fileUrl = (doc: TripDocument) => `/api/photos/${doc.path}`;
const thumbUrl = (doc: TripDocument) => `/api/photos/${doc.path}/thumb`;
const kindMeta = (kind: string) => DOCUMENT_KINDS.find((entry) => entry.key === kind) ?? DOCUMENT_KINDS[DOCUMENT_KINDS.length - 1];

/**
 * Every travel document, as a file explorer.
 *
 * It was a short list in the middle of Settings. This is its own tab because
 * these are the files you look for in a queue at a border: folders by kind and
 * by person, thumbnails, a viewer that steps through them, details you can fix
 * in place, and the warnings that matter at a desk — a passport that runs out
 * too soon, a policy that ends mid-trip.
 *
 * Offline is real now: the tab tells the service worker which files exist and it
 * keeps a copy, so they open with no signal. The page says how many are saved,
 * because a promise you cannot check is not one.
 */
export default function FilesTab() {
    const api = useHoneymoonApi();
    const documents = useMemo(() => api.data?.documents ?? [], [api.data?.documents]);
    const trip = api.data?.trip;
    const [folder, setFolder] = useState('all');
    const [query, setQuery] = useState('');
    const [view, setView] = useLocalPref<'grid' | 'list'>('hm-files-view', 'grid');
    const [openId, setOpenId] = useState<number | null>(null);
    const [busy, setBusy] = useState(0);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const folders = useMemo(() => documentFolders(documents), [documents]);
    const shown = useMemo(() => filterDocuments(documents, folder, query), [documents, folder, query]);
    const warnings = useMemo(
        () => (trip ? documentWarnings(documents, trip) : []),
        [documents, trip],
    );
    const warnedIds = new Set(warnings.filter((w) => w.documentId != null).map((w) => w.documentId));
    const offline = useOfflineFiles(documents);

    /* A folder that empties (its last file moved or deleted) falls back to All. */
    const folderKeys = ['all', ...folders.kinds.map((f) => f.key), ...folders.people.map((f) => f.key)];
    const activeFolder = folderKeys.includes(folder) ? folder : 'all';

    const upload = useCallback(async (files: FileList | File[] | null) => {
        const list = files ? Array.from(files) : [];
        if (!list.length) return;
        setBusy(list.length);
        setError('');
        // Dropped into a folder, a file takes that folder's kind or person
        // unless its name says otherwise.
        const folderKind = activeFolder.startsWith('kind:') ? activeFolder.slice(5) as DocumentKind : 'other';
        const folderPerson = activeFolder.startsWith('person:') ? activeFolder.slice(7) : '';
        try {
            for (const file of list) {
                const body = new FormData();
                body.append('file', file);
                body.append('kind', 'document');
                const res = await fetch('/api/admin/honeymoon/upload', { method: 'POST', body });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok || !payload.filename) {
                    setError(`${file.name}: ${payload.error ?? 'the upload failed'}`);
                } else {
                    await api.create('documents', {
                        name: file.name.replace(/\.[^.]+$/, ''),
                        kind: guessDocumentKind(file.name, folderKind),
                        path: payload.filename,
                        person: folderPerson,
                    });
                }
                setBusy((n) => n - 1);
            }
        } finally {
            setBusy(0);
            if (input.current) input.current.value = '';
        }
    }, [activeFolder, api]);

    const folderLabel = activeFolder === 'all'
        ? 'All files'
        : [...folders.kinds, ...folders.people].find((f) => f.key === activeFolder)?.label ?? 'All files';

    const allFolders = [
        { key: 'all', label: 'All files', icon: '🗂️', count: documents.length },
        ...folders.kinds,
    ];

    return (
        <div
            data-files-tab
            className="relative"
            onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragging(false);
            }}
            onDrop={(e) => {
                if (!e.dataTransfer.files.length) return;
                e.preventDefault();
                setDragging(false);
                void upload(e.dataTransfer.files);
            }}
        >
            <TabToolbar
                left={(
                    <>
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search files…"
                            aria-label="Search files"
                            className="min-h-11 md:min-h-0 w-full sm:w-56 rounded-full border border-gray-200 bg-white px-4
                                py-1.5 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                        <Segmented<'grid' | 'list'>
                            ariaLabel="File view"
                            size="sm"
                            value={view}
                            onChange={setView}
                            options={[{ key: 'grid', label: '▦ Grid' }, { key: 'list', label: '☰ List' }]}
                        />
                    </>
                )}
                right={(
                    <>
                        {documents.length > 0 && (
                            <span
                                data-offline-status
                                className={`text-xs ${offline.saved === documents.length ? 'text-emerald-700' : 'text-gray-500'}`}
                                title="Kept on this device by the portal's offline cache, so they open with no signal"
                            >
                                {offline.supported
                                    ? `Saved for offline: ${offline.saved} of ${documents.length}`
                                    : 'Offline copies need a secure (https) connection'}
                            </span>
                        )}
                        <input
                            ref={input}
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => upload(e.target.files)}
                        />
                        <Button tone="primary" onClick={() => input.current?.click()} disabled={busy > 0}>
                            {busy > 0 ? `Uploading… ${busy} left` : '+ Add files'}
                        </Button>
                        <Hint label="About these files">
                            Passports, visas, insurance, tickets, vaccination cards and booking
                            confirmations — images or PDFs up to 25 MB each. Drop files anywhere on this
                            page. They are kept on this device for offline use once this tab has been
                            opened with a connection. They are stored like every other upload in the
                            portal: the links are unlisted, not secret.
                        </Hint>
                    </>
                )}
                below={query || activeFolder !== 'all' ? (
                    <FilterChips active={[
                        ...(activeFolder !== 'all' ? [{ key: 'folder', label: folderLabel, clear: () => setFolder('all') }] : []),
                        ...(query ? [{ key: 'q', label: `“${query}”`, clear: () => setQuery('') }] : []),
                    ]} />
                ) : undefined}
            />

            {error && (
                <p className="mb-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
            )}

            {warnings.length > 0 && documents.length > 0 && (
                <ul className="mb-3 space-y-1.5" data-file-warnings>
                    {warnings.map((warning) => (
                        <li key={`${warning.documentId}-${warning.message}`}>
                            <button
                                type="button"
                                disabled={warning.documentId == null}
                                onClick={() => warning.documentId != null && setOpenId(warning.documentId)}
                                className={`flex min-h-11 md:min-h-0 w-full items-center gap-2 rounded-2xl px-4 py-2 text-left text-sm
                                    ${warning.level === 'warn' ? 'bg-amber-50 text-amber-900 hover:bg-amber-100' : 'bg-gray-50 text-gray-600'}`}
                            >
                                <span aria-hidden>{warning.level === 'warn' ? '⚠' : 'ℹ'}</span>
                                {warning.message}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {documents.length === 0 ? (
                <FirstFiles onAdd={() => input.current?.click()} />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[13rem_1fr]">
                    {/* ---- Folders ---- */}
                    <nav aria-label="Folders" className="min-w-0">
                        <ul className="flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible [scrollbar-width:none]">
                            {allFolders.map((f) => (
                                <FolderButton key={f.key} folder={f} active={activeFolder === f.key} onPick={setFolder} />
                            ))}
                            {folders.people.length > 0 && (
                                <li className="hidden md:block px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    People
                                </li>
                            )}
                            {folders.people.map((f) => (
                                <FolderButton key={f.key} folder={f} active={activeFolder === f.key} onPick={setFolder} />
                            ))}
                        </ul>
                    </nav>

                    {/* ---- Files ---- */}
                    <div className="min-w-0">
                        {shown.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-white">
                                <EmptyState title="Nothing here" hint="Try another folder, or clear the search." />
                            </div>
                        ) : view === 'grid' ? (
                            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {shown.map((doc) => (
                                    <li key={doc.id}>
                                        <FileTile doc={doc} warned={warnedIds.has(doc.id)} onOpen={() => setOpenId(doc.id)} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
                                {shown.map((doc) => (
                                    <li key={doc.id}>
                                        <FileRow doc={doc} warned={warnedIds.has(doc.id)} onOpen={() => setOpenId(doc.id)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-2 px-1 text-[11px] text-gray-400">
                            {shown.length} of {documents.length} file{documents.length === 1 ? '' : 's'} · drop files anywhere here to add them
                        </p>
                    </div>
                </div>
            )}

            {dragging && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl
                    border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[1px]">
                    <p className="rounded-full bg-white px-5 py-2 text-sm font-medium text-gray-800 shadow">
                        Drop to add to {folderLabel}
                    </p>
                </div>
            )}

            <FileViewer
                docs={shown}
                openId={openId}
                onOpen={setOpenId}
                warnings={warnings}
            />
        </div>
    );
}

function FolderButton({ folder, active, onPick }: {
    folder: { key: string; label: string; icon: string; count: number };
    active: boolean;
    onPick: (key: string) => void;
}) {
    return (
        <li className="shrink-0">
            <button
                type="button"
                onClick={() => onPick(folder.key)}
                aria-current={active ? 'true' : undefined}
                data-folder={folder.key}
                className={`flex min-h-11 md:min-h-0 w-full items-center gap-2 whitespace-nowrap rounded-full md:rounded-xl px-3 py-1.5
                    text-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                    ${active ? 'bg-accent text-white md:bg-accent/15 md:text-gray-900 md:font-semibold'
                        : 'border border-gray-200 bg-white text-gray-700 md:border-transparent md:bg-transparent hover:bg-gray-100'}`}
            >
                <span aria-hidden>{folder.icon}</span>
                <span className="md:flex-1 md:text-left">{folder.label}</span>
                <span className={`tabular-nums text-xs ${active ? 'opacity-80' : 'text-gray-400'}`}>{folder.count}</span>
            </button>
        </li>
    );
}

function FileTile({ doc, warned, onOpen }: { doc: TripDocument; warned: boolean; onOpen: () => void }) {
    const meta = kindMeta(doc.kind);
    return (
        <button
            type="button"
            onClick={onOpen}
            data-file={doc.id}
            className="group block w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition
                hover:border-gray-200 hover:shadow active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
            <div className="relative aspect-[4/3] w-full bg-gray-50">
                {isImageFile(doc.path) ? (
                    // A volume photo, resized by the photo route.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl(doc)} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                    <PdfGlyph />
                )}
                {warned && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        ⚠ check
                    </span>
                )}
            </div>
            <div className="space-y-0.5 px-3 py-2.5">
                <p className="truncate text-sm font-medium text-gray-900">{doc.name}</p>
                <p className="truncate text-[11px] text-gray-500">
                    {meta.icon} {meta.label}{doc.person ? ` · ${doc.person}` : ''}
                    {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : ''}
                </p>
            </div>
        </button>
    );
}

function FileRow({ doc, warned, onOpen }: { doc: TripDocument; warned: boolean; onOpen: () => void }) {
    const meta = kindMeta(doc.kind);
    return (
        <button
            type="button"
            onClick={onOpen}
            data-file={doc.id}
            className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-lg" aria-hidden>
                {isImageFile(doc.path)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={thumbUrl(doc)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : meta.icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{doc.name}</span>
                <span className="block truncate text-[11px] text-gray-500">
                    {meta.label}{doc.person ? ` · ${doc.person}` : ''}
                </span>
            </span>
            {doc.expires_on && (
                <span className={`hidden sm:inline shrink-0 text-xs ${warned ? 'font-medium text-amber-700' : 'text-gray-500'}`}>
                    {warned && '⚠ '}expires {formatDate(doc.expires_on)}
                </span>
            )}
        </button>
    );
}

function PdfGlyph() {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="relative flex h-20 w-16 items-end justify-center rounded-md border border-gray-200 bg-white pb-2 shadow-sm">
                <span className="absolute right-0 top-0 size-4 rounded-bl-md border-b border-l border-gray-200 bg-gray-50" />
                <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">PDF</span>
            </div>
        </div>
    );
}

/** The first-run state: what goes here, and the one button that starts it. */
function FirstFiles({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <p className="text-3xl" aria-hidden>🗂️</p>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">The papers you would hate to lose</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                Passports, visas, insurance, e-tickets, vaccination cards, booking confirmations. Drop
                them here and they open on the trip, with or without signal.
            </p>
            <div className="mt-4">
                <Button tone="primary" onClick={onAdd}>+ Add files</Button>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">Images or PDFs, up to 25 MB each. Drag them onto this page.</p>
        </div>
    );
}

/** One file, big, with its details editable beside it. */
function FileViewer({ docs, openId, onOpen, warnings }: {
    docs: TripDocument[];
    openId: number | null;
    onOpen: (id: number | null) => void;
    warnings: ReturnType<typeof documentWarnings>;
}) {
    const api = useHoneymoonApi();
    const all = api.data?.documents ?? [];
    const doc = openId == null ? null : all.find((d) => d.id === openId) ?? null;
    const at = doc ? docs.findIndex((d) => d.id === doc.id) : -1;
    const step = useCallback((delta: number) => {
        if (at < 0) return;
        const next = docs[at + delta];
        if (next) onOpen(next.id);
    }, [at, docs, onOpen]);

    useEffect(() => {
        if (!doc) return;
        const onKey = (event: KeyboardEvent) => {
            const tag = (event.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (event.key === 'ArrowLeft') step(-1);
            if (event.key === 'ArrowRight') step(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [doc, step]);

    const partners = partnersOf(api.data?.trip.partner_names);
    const places = (api.data?.places ?? []).filter((p) => !p.archived && (p.category === 'stay' || p.is_excursion || p.status === 'booked'));
    const legs = (api.data?.days ?? []).flatMap((day) => day.travel.map((leg) => ({ leg, day })));
    const set = (fields: Record<string, unknown>) => doc && api.update('documents', { id: doc.id, ...fields });
    const mine = doc ? warnings.filter((w) => w.documentId === doc.id) : [];

    return (
        <Sheet
            open={doc != null}
            onClose={() => onOpen(null)}
            width="lg"
            dataAttrs={{ 'data-file-viewer': String(doc?.id ?? '') }}
            title={doc && (
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {kindMeta(doc.kind).icon} {kindMeta(doc.kind).label}
                        {at >= 0 && ` · ${at + 1} of ${docs.length}`}
                    </p>
                    <InlineText
                        value={doc.name}
                        className="-ml-2 text-lg font-semibold text-gray-900"
                        onCommit={(name) => { if (name.trim()) set({ name: name.trim() }); }}
                    />
                </div>
            )}
            actions={doc && (
                <>
                    <Button className="!px-3" onClick={() => step(-1)} disabled={at <= 0} aria-label="Previous file">‹</Button>
                    <Button className="!px-3" onClick={() => step(1)} disabled={at < 0 || at >= docs.length - 1} aria-label="Next file">›</Button>
                    <OverflowMenu items={[
                        {
                            label: 'Open in a new tab',
                            onClick: () => { window.open(fileUrl(doc), '_blank', 'noopener'); },
                        },
                        {
                            label: 'Delete',
                            danger: true,
                            onClick: () => { onOpen(null); void api.removeRow('documents', doc, `Deleted ${doc.name}`); },
                        },
                    ]} />
                </>
            )}
        >
            {doc && (
                <div className="space-y-4">
                    {mine.map((w) => (
                        <p key={w.message} className="rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-900">⚠ {w.message}</p>
                    ))}
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                        {isImageFile(doc.path) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl(doc)} alt={doc.name} className="mx-auto max-h-[60vh] w-auto" />
                        ) : (
                            <iframe title={doc.name} src={fileUrl(doc)} className="h-[60vh] w-full bg-white" />
                        )}
                    </div>
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="What it is">
                            <MiniSelect value={doc.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="What it is">
                                {DOCUMENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                            </MiniSelect>
                        </Field>
                        <Field label="Whose">
                            <MiniSelect value={doc.person ?? ''} onChange={(e) => set({ person: e.target.value })} aria-label="Whose">
                                <option value="">Shared</option>
                                {[...new Set([...partners, ...(doc.person ? [doc.person] : [])])].map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </MiniSelect>
                        </Field>
                        <Field label="Expires">
                            <input
                                type="date"
                                key={`exp-${doc.id}-${doc.expires_on ?? ''}`}
                                defaultValue={doc.expires_on ?? ''}
                                onBlur={(e) => { if (e.target.value !== (doc.expires_on ?? '')) set({ expires_on: e.target.value }); }}
                                aria-label="Expires"
                                className="min-h-11 md:min-h-0 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-base md:text-sm"
                            />
                        </Field>
                        <Field label="For">
                            <MiniSelect
                                aria-label="What it is for"
                                value={doc.place_id != null ? `p${doc.place_id}` : doc.travel_id != null ? `t${doc.travel_id}` : ''}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    set({
                                        place_id: v.startsWith('p') ? Number(v.slice(1)) : null,
                                        travel_id: v.startsWith('t') ? Number(v.slice(1)) : null,
                                    });
                                }}
                                className="max-w-full"
                            >
                                <option value="">The whole trip</option>
                                {legs.length > 0 && (
                                    <optgroup label="Travel">
                                        {legs.map(({ leg, day }) => (
                                            <option key={`t${leg.id}`} value={`t${leg.id}`}>
                                                {travelModeMeta(leg.mode).icon} {[leg.from_text, leg.to_text].filter(Boolean).join(' → ') || 'A leg'} · day {day.day_number}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {places.length > 0 && (
                                    <optgroup label="Places">
                                        {places.map((p) => <option key={`p${p.id}`} value={`p${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                            </MiniSelect>
                        </Field>
                    </dl>
                    <Field label="Notes">
                        <InlineText
                            multiline
                            value={doc.notes ?? ''}
                            placeholder="+ Policy number, the 24h line, what to show at the desk…"
                            className="-ml-2 text-sm text-gray-700"
                            onCommit={(notes) => set({ notes })}
                        />
                    </Field>
                    <a
                        href={fileUrl(doc)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 md:min-h-0 items-center text-sm text-accent hover:underline"
                    >
                        Open the original ↗
                    </a>
                </div>
            )}
        </Sheet>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

/**
 * Keep every document in the service worker's file cache, and say how many are.
 *
 * The worker does the fetching (so it survives this tab closing); this posts
 * the current list whenever it changes and listens for the count back.
 */
function useOfflineFiles(documents: TripDocument[]) {
    const [saved, setSaved] = useState(0);
    const [supported, setSupported] = useState(true);
    const urls = useMemo(() => documents.map((doc) => fileUrl(doc)).sort(), [documents]);
    const key = urls.join('|');

    useEffect(() => {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSupported(false);
            return;
        }
        const onMessage = (event: MessageEvent) => {
            if (event.data?.type === 'honeymoon-sw:files-done') setSaved(Number(event.data.saved) || 0);
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        void navigator.serviceWorker.register('/honeymoon-sw.js', { scope: '/' })
            .then(() => navigator.serviceWorker.ready)
            .then((registration) => {
                registration.active?.postMessage({ type: 'honeymoon-sw:files', urls: key ? key.split('|') : [] });
            })
            .catch(() => setSupported(false));
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [key]);

    return { saved: Math.min(saved, documents.length), supported };
}
