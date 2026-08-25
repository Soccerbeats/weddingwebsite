'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { Place } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button } from './ui';

/**
 * Photos on a place.
 *
 * The `photos` column has existed since the first schema and was always `[]`.
 * What goes in it: the booking screenshot, the menu, the photo of the exact
 * beach entrance that took twenty minutes to find. The first photo is the cover,
 * which is what the card and the map popup show — so "make cover" is a reorder,
 * not a flag.
 *
 * Uploads go through the portal's own route, which deliberately does *not*
 * register them in `photos.json`: nothing here can end up in the public wedding
 * gallery.
 */
export default function PlacePhotos({ api, place, compact = false }: {
    api: HoneymoonApi;
    place: Place;
    compact?: boolean;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const photos = place.photos ?? [];

    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        setError('');
        const added: string[] = [];
        try {
            for (const file of Array.from(files)) {
                const body = new FormData();
                body.append('file', file);
                body.append('kind', 'photo');
                const res = await fetch('/api/admin/honeymoon/upload', { method: 'POST', body });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok || !payload.filename) {
                    setError(payload.error ?? 'That upload failed');
                    continue;
                }
                added.push(payload.filename);
            }
            if (added.length) {
                await api.update('places', { id: place.id, photos: [...photos, ...added] });
            }
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    const remove = async (filename: string) => {
        await api.update('places', {
            id: place.id,
            photos: photos.filter((name) => name !== filename),
        });
        // The row is what matters; the file is tidied up behind it and a failure
        // there is not worth interrupting anyone for.
        fetch(`/api/admin/honeymoon/upload?filename=${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        }).catch(() => {});
    };

    const makeCover = (filename: string) => api.update('places', {
        id: place.id,
        photos: [filename, ...photos.filter((name) => name !== filename)],
    });

    return (
        <div className="space-y-2">
            {photos.length > 0 && (
                <div className={`grid gap-2 ${compact ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {photos.map((filename, index) => (
                        <div key={filename} className="group relative">
                            <div className="relative aspect-square overflow-hidden rounded-xl
                                bg-gray-100">
                                <Image
                                    src={`/api/photos/${filename}`}
                                    alt={`${place.name} photo ${index + 1}`}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                />
                            </div>
                            {index === 0 && (
                                <span className="absolute left-1 top-1 rounded-full bg-gray-900/80
                                    px-1.5 py-0.5 text-[9px] font-semibold text-white">
                                    Cover
                                </span>
                            )}
                            <div className="absolute inset-x-1 bottom-1 flex justify-between
                                opacity-0 transition group-hover:opacity-100">
                                {index !== 0 && (
                                    <button
                                        type="button"
                                        onClick={() => makeCover(filename)}
                                        className="rounded-full bg-white/90 px-1.5 py-0.5 text-[9px]
                                            font-medium text-gray-700"
                                    >
                                        Cover
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => remove(filename)}
                                    className="ml-auto rounded-full bg-white/90 px-1.5 py-0.5
                                        text-[9px] font-medium text-rose-700"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    ref={input}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => upload(e.target.files)}
                />
                <Button onClick={() => input.current?.click()} disabled={busy}>
                    {busy ? 'Uploading…' : photos.length ? '+ More photos' : '+ Photos'}
                </Button>
                {!photos.length && (
                    <span className="text-[11px] text-gray-400">
                        The first one becomes the cover.
                    </span>
                )}
            </div>
            {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
    );
}
