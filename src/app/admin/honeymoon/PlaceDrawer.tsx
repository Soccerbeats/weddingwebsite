'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import {
    categoryMeta, formatDistance, formatPrice, hasCoords, sourceLabel, STATUSES,
} from '@/lib/honeymoon';
import type { Place } from '@/lib/honeymoon';
import { formatMoney } from '@/lib/honeymoonBudget';
import { describeHours } from '@/lib/honeymoonHours';
import { nearbyPlaces, providerOf } from '@/lib/honeymoonPlaces';
import { navUrl } from '@/lib/honeymoonToday';
import Markdown from './Markdown';
import PlacePhotos from './PlacePhotos';
import { PersonRatings, PlaceComments } from './PlaceNotes';
import BookingPanel from './BookingPanel';
import type { HoneymoonApi } from './useHoneymoon';
import { Button } from './ui';

/**
 * Everything about one place, in one panel.
 *
 * The editor is a form — good for changing things, bad for reading. The map's
 * selected-place card and the shortlist row both truncate. This is the third
 * thing: the full picture of a place, including the parts that live in other
 * tables (which days it is on, what it is near, whether it is booked, what you
 * two said about it) and the parts that were never surfaced at all (photos,
 * opening hours, its links labelled with who they are with).
 */
export default function PlaceDrawer({ api, place, onClose, onEdit, onAddToDay }: {
    api: HoneymoonApi;
    place: Place | null;
    onClose: () => void;
    onEdit: (place: Place) => void;
    /** Offered per nearby place, when the caller has a day in mind. */
    onAddToDay?: (place: Place) => void;
}) {
    const nearby = useMemo(
        () => (place ? nearbyPlaces(place, api.data?.places ?? [], 8, 6) : []),
        [place, api.data?.places],
    );
    const onDays = useMemo(() => {
        if (!place) return [];
        return (api.data?.days ?? [])
            .filter((day) => day.base_place_id === place.id
                || day.stops.some((stop) => stop.place_id === place.id))
            .map((day) => ({
                day,
                asBase: day.base_place_id === place.id,
            }));
    }, [place, api.data?.days]);

    if (!place) return null;

    const meta = categoryMeta(place.category);
    const region = place.region_id != null ? api.regionById.get(place.region_id) : null;
    const status = STATUSES.find((entry) => entry.key === place.status);
    const currency = place.cost_currency || api.data?.trip.home_currency || 'USD';
    const hours = describeHours(place.opening_hours);

    return (
        <div className="fixed inset-0 z-[80] flex justify-end">
            {/* The backdrop is a button so Escape-less dismissal works by click
                without a keyboard trap; the panel stops propagation. */}
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 bg-gray-900/20 backdrop-blur-[1px]"
            />
            <aside className="relative h-full w-full max-w-md overflow-auto bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-gray-100
                    bg-white/95 px-4 py-3 backdrop-blur">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide
                            text-gray-400">
                            {meta.icon} {meta.label}
                            {region ? ` · ${region}` : ''}
                        </p>
                        <h2 className="truncate text-lg font-semibold text-gray-900">
                            {place.name}
                        </h2>
                    </div>
                    <Button onClick={() => onEdit(place)}>Edit</Button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-full px-2 text-xl leading-none text-gray-400
                            hover:text-gray-700"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {status && (
                            <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium
                                    text-white"
                                style={{ backgroundColor: status.color }}
                            >
                                {status.label}
                            </span>
                        )}
                        {place.rank != null && (
                            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px]
                                font-semibold text-white">
                                #{place.rank}
                            </span>
                        )}
                        {place.is_excursion && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px]
                                text-sky-800">
                                Excursion
                            </span>
                        )}
                        {place.archived && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px]
                                text-gray-600">
                                Removed
                            </span>
                        )}
                        <span className="text-[11px] text-gray-400">
                            {sourceLabel(place.source)}
                        </span>
                    </div>

                    {place.image_url && !place.photos.length && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={place.image_url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-40 w-full rounded-2xl bg-gray-100 object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    )}
                    {place.photos.length > 0 && (
                        <div className="relative h-40 w-full overflow-hidden rounded-2xl
                            bg-gray-100">
                            <Image
                                src={`/api/photos/${place.photos[0]}`}
                                alt={place.name}
                                fill
                                unoptimized
                                className="object-cover"
                            />
                        </div>
                    )}

                    <Section title="Where">
                        {place.address && (
                            <p className="text-sm text-gray-700">{place.address}</p>
                        )}
                        {hasCoords(place) ? (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                <a
                                    href={navUrl(place)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full bg-gray-900 px-3 py-1.5 text-xs
                                        font-medium text-white"
                                >
                                    Directions
                                </a>
                                {/* Street-level imagery, one anchor tag: the
                                    fastest way to know whether the "beach club"
                                    is on the beach. */}
                                <a
                                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-gray-200 px-3 py-1.5
                                        text-xs font-medium text-gray-700"
                                >
                                    Street View
                                </a>
                                <a
                                    href={`https://www.mapillary.com/app/?lat=${place.lat}&lng=${place.lng}&z=17`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-gray-200 px-3 py-1.5
                                        text-xs font-medium text-gray-700"
                                >
                                    Mapillary
                                </a>
                            </div>
                        ) : (
                            <p className="text-xs text-amber-700">
                                Not pinned yet — it will not appear on the map.
                            </p>
                        )}
                    </Section>

                    {(place.cost != null || place.price_note || hours || place.best_time) && (
                        <Section title="Practical">
                            <dl className="space-y-1 text-sm">
                                {place.cost != null && (
                                    <Row label="Cost">
                                        {formatMoney(place.cost, currency)}
                                        <span className="text-gray-400">
                                            {place.cost_per === 'night' ? ' per night'
                                                : place.cost_per === 'person' ? ' per person' : ''}
                                        </span>
                                    </Row>
                                )}
                                {place.price_note && (
                                    <Row label="Price note">
                                        {formatPrice(place.price_note, currency)}
                                    </Row>
                                )}
                                {hours && <Row label="Hours">{hours}</Row>}
                                {place.best_time && <Row label="Best time">{place.best_time}</Row>}
                                {place.star_rating != null && (
                                    <Row label="Rated">{place.star_rating} ★</Row>
                                )}
                                {place.amenities.length > 0 && (
                                    <Row label="Amenities">{place.amenities.join(' · ')}</Row>
                                )}
                            </dl>
                        </Section>
                    )}

                    {place.description && (
                        <Section title="Notes">
                            <Markdown source={place.description} className="text-sm text-gray-700" />
                        </Section>
                    )}

                    {place.links.length > 0 && (
                        <Section title="Links">
                            <ul className="space-y-1">
                                {place.links.map((link) => (
                                    <li key={link.url}>
                                        <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm text-accent
                                                hover:underline"
                                        >
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5
                                                text-[10px] font-medium text-gray-600">
                                                {providerOf(link.url) ?? 'Link'}
                                            </span>
                                            <span className="truncate">
                                                {link.label || link.url}
                                            </span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    <Section title="Photos">
                        <PlacePhotos api={api} place={place} compact />
                    </Section>

                    <Section title="What you two think">
                        <PersonRatings api={api} place={place} />
                        <div className="mt-2">
                            <PlaceComments api={api} place={place} />
                        </div>
                    </Section>

                    <Section title="Booking">
                        <BookingPanel
                            api={api}
                            kind={place.is_excursion ? 'excursion' : 'stay'}
                            placeId={place.id}
                            compact
                        />
                    </Section>

                    <Section title="On the itinerary">
                        {onDays.length === 0 ? (
                            <p className="text-sm text-gray-500">Not scheduled yet.</p>
                        ) : (
                            <ul className="space-y-1 text-sm text-gray-700">
                                {onDays.map(({ day, asBase }) => (
                                    <li key={day.id}>
                                        Day {day.day_number}
                                        {day.title ? ` — ${day.title}` : ''}
                                        {asBase && (
                                            <span className="ml-1 text-[11px] text-emerald-700">
                                                (sleeping here)
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>

                    {nearby.length > 0 && (
                        <Section title="Nearby">
                            <ul className="space-y-1">
                                {nearby.map(({ place: other, km }) => (
                                    <li
                                        key={other.id}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <span aria-hidden>{categoryMeta(other.category).icon}</span>
                                        <span className="min-w-0 flex-1 truncate text-gray-700">
                                            {other.name}
                                        </span>
                                        <span className="shrink-0 text-[11px] text-gray-400
                                            tabular-nums">
                                            {formatDistance(km)}
                                        </span>
                                        {onAddToDay && (
                                            <button
                                                type="button"
                                                onClick={() => onAddToDay(other)}
                                                className="shrink-0 rounded-full border
                                                    border-gray-200 px-2 py-0.5 text-[11px]
                                                    text-gray-600 hover:bg-gray-50"
                                            >
                                                + day
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-1 text-[11px] text-gray-400">
                                Within 8 km — the gap between a temple at eleven and dinner at seven.
                            </p>
                        </Section>
                    )}
                </div>
            </aside>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {title}
            </h3>
            {children}
        </section>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right text-gray-800">{children}</dd>
        </div>
    );
}
