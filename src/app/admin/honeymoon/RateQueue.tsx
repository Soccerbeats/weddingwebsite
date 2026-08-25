'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { RATINGS, categoryMeta, formatPrice } from '@/lib/honeymoon';
import type { Place, PlaceRating } from '@/lib/honeymoon';
import { providerOf } from '@/lib/honeymoonPlaces';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Modal } from './ui';

/**
 * Triage, one at a time.
 *
 * Rating forty stays through a grid of cards is a bad experience on a laptop and
 * an unusable one on a phone: the pills are small, the photo is small, and the
 * decision is made twice because you lose your place. This is the same job as a
 * deck of cards — big photo, three buttons, next — and it is the fastest way to
 * turn "a hundred ideas" into "a shortlist".
 *
 * It never skips ahead on its own: rating advances, and so does Skip, so
 * nothing is ever decided by a mis-tap you did not see.
 */
export default function RateQueue({ api, open, onClose, filter, title }: {
    api: HoneymoonApi;
    open: boolean;
    onClose: () => void;
    /** Which places belong in this queue — stays, excursions, or anything. */
    filter: (place: Place) => boolean;
    title: string;
}) {
    const [at, setAt] = useState(0);
    const [rated, setRated] = useState(0);

    /*
     * The queue is fixed when the dialog opens, not recomputed as you rate.
     *
     * If it filtered live, rating a place would remove it from the list and the
     * next one would slide under your thumb — which is how you end up rating the
     * wrong thing. So the list is captured once and the cursor walks it.
     */
    const queue = useMemo(() => {
        if (!open) return [];
        return (api.data?.places ?? []).filter(
            (place) => !place.archived && place.rating == null && filter(place),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once per opening
    }, [open]);

    const place = queue[at] ? api.placeById.get(queue[at].id) ?? queue[at] : null;

    const rate = async (rating: PlaceRating) => {
        if (!place) return;
        setRated((count) => count + 1);
        setAt((index) => index + 1);
        // Optimistic, and deliberately not awaited: the next card should be
        // under your thumb immediately, and the write is a single field.
        void api.patchPlace(place.id, { rating });
    };

    return (
        <Modal open={open} onClose={onClose} title={title} wide>
            {!queue.length ? (
                <div className="py-8 text-center">
                    <p className="text-sm text-gray-600">Nothing unrated here. Everything is triaged.</p>
                    <Button className="mt-3" onClick={onClose}>Close</Button>
                </div>
            ) : !place ? (
                <div className="py-8 text-center">
                    <p className="text-base font-medium text-gray-900">
                        Done — {rated} rated.
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                        The shortlist and the ranking will have moved.
                    </p>
                    <Button tone="primary" className="mt-3" onClick={onClose}>Close</Button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide
                            text-gray-400">
                            {categoryMeta(place.category).icon} {categoryMeta(place.category).label}
                            {place.region_id != null
                                && ` · ${api.regionById.get(place.region_id) ?? ''}`}
                        </p>
                        <p className="text-[11px] tabular-nums text-gray-400">
                            {at + 1} of {queue.length}
                        </p>
                    </div>

                    <div className="relative h-56 w-full overflow-hidden rounded-2xl bg-gray-100">
                        {place.photos[0] ? (
                            <Image
                                src={`/api/photos/${place.photos[0]}`}
                                alt={place.name}
                                fill
                                unoptimized
                                className="object-cover"
                            />
                        ) : place.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={place.image_url}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="size-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <div className="flex size-full items-center justify-center text-4xl">
                                {categoryMeta(place.category).icon}
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{place.name}</h3>
                        {place.price_note && (
                            <p className="text-sm text-gray-600">
                                {formatPrice(place.price_note, api.data?.trip.home_currency)}
                            </p>
                        )}
                        {place.description && (
                            <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                                {place.description}
                            </p>
                        )}
                        {place.links.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {place.links.slice(0, 3).map((link) => (
                                    <a
                                        key={link.url}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px]
                                            text-gray-700 hover:bg-gray-200"
                                    >
                                        {providerOf(link.url) ?? 'Link'} ↗
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Big targets, in the order you would say them out loud. */}
                    <div className="grid grid-cols-3 gap-2">
                        {RATINGS.map((rating) => (
                            <button
                                key={rating.key}
                                type="button"
                                onClick={() => rate(rating.key)}
                                className="flex min-h-14 flex-col items-center justify-center
                                    rounded-2xl text-white transition active:opacity-80"
                                style={{ backgroundColor: rating.color }}
                            >
                                <span className="text-xl leading-none">{rating.icon}</span>
                                <span className="mt-0.5 text-[11px] font-semibold">
                                    {rating.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={() => setAt((index) => Math.max(0, index - 1))}
                            disabled={at === 0}
                        >
                            ← Back
                        </Button>
                        <Button onClick={() => setAt((index) => index + 1)}>Skip →</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
