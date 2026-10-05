'use client';

import Image from 'next/image';
import { daysBetween, formatDate, hasCoords, type Place } from '@/lib/honeymoon';
import { priceText } from '@/lib/honeymoonPlaceSheet';
import { useHoneymoonApi } from '../HoneymoonContext';
import { usePlaceSheet } from '../PlaceSheetContext';
import { PLACE_DRAG } from '../dragTypes';
import { CategoryChip, OverflowMenu, StatusChip, type OverflowMenuItem } from '../ui';
import { RatingPills } from './RatingPills';

/**
 * One place, as a card — the same card on every list that shows places.
 *
 * Stays and excursions each had their own card, and both were inline editors:
 * a name box, a price box, a notes box, an area picker, all on the card. Editing
 * lives in the place panel now, so the card only *reads*, and clicking it opens
 * the panel. Two things stay on it because they are done in bulk, twenty places
 * at a sitting: the rating pills, and the select box.
 */
export function PlaceCard({ place, selected, onToggleSelect, active = false, onShowOnMap, menu = [], cardRef }: {
    place: Place;
    selected?: boolean;
    onToggleSelect?: () => void;
    /** Ringed — the one the map is pointing at. */
    active?: boolean;
    onShowOnMap?: () => void;
    menu?: OverflowMenuItem[];
    cardRef?: (node: HTMLDivElement | null) => void;
}) {
    const api = useHoneymoonApi();
    const { openPlace } = usePlaceSheet();
    const home = api.data?.trip.home_currency || 'USD';
    const booked = (api.data?.bookings ?? []).find(
        (row) => row.kind === 'stay' && row.place_id === place.id && row.check_in && row.check_out,
    );
    const nights = booked ? daysBetween(booked.check_in, booked.check_out) : null;
    const price = priceText(place, home);
    const region = place.region_id != null ? api.regionById.get(place.region_id) : null;

    return (
        <div
            ref={cardRef}
            data-place-card={place.id}
            className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition
                ${active ? 'border-accent ring-2 ring-accent' : 'border-gray-100 hover:border-gray-200'}`}
        >
            <button
                type="button"
                onClick={() => openPlace(place.id)}
                className="block w-full text-left"
                aria-label={`Open ${place.name}`}
            >
                <Cover place={place} />
                <div className="space-y-1 px-4 pt-3">
                    <div className="flex items-baseline gap-1.5">
                        {place.rank != null && (
                            <span className="shrink-0 text-[11px] font-bold tabular-nums text-accent">#{place.rank}</span>
                        )}
                        <h3 className="min-w-0 flex-1 truncate font-sans text-base font-semibold text-gray-900">{place.name}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryChip category={place.category} />
                        {place.status !== 'idea' && <StatusChip status={place.status} />}
                        {region && <span className="text-[11px] text-gray-400">{region}</span>}
                        {!hasCoords(place) && (
                            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">no pin</span>
                        )}
                    </div>
                    {price && <p className="text-sm text-gray-700">{price}</p>}
                    {booked && (
                        <p className="text-[11px] text-emerald-700">
                            🛏 {formatDate(booked.check_in)} → {formatDate(booked.check_out)}
                            {nights != null && nights > 0 && ` · ${nights} night${nights === 1 ? '' : 's'}`}
                        </p>
                    )}
                    {(place.star_rating != null || place.amenities.length > 0) && (
                        <p className="truncate text-[11px] text-gray-500">
                            {place.star_rating != null && <span className="mr-1.5">{place.star_rating}★</span>}
                            {place.amenities.slice(0, 3).join(' · ')}
                        </p>
                    )}
                    {place.description && (
                        <p className="line-clamp-2 text-sm text-gray-500">{place.description}</p>
                    )}
                </div>
            </button>
            <div className="flex items-center gap-1.5 px-4 pb-3 pt-2">
                {onToggleSelect && (
                    <label className="-ml-2 flex size-11 md:size-8 shrink-0 cursor-pointer items-center justify-center">
                        <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={onToggleSelect}
                            className="size-4 rounded accent-accent"
                            aria-label={`Select ${place.name}`}
                        />
                    </label>
                )}
                <RatingPills
                    value={place.rating}
                    labels={false}
                    onChange={(rating) => api.patchPlace(place.id, { rating: rating ?? '' })}
                />
                <div className="flex-1" />
                {onShowOnMap && hasCoords(place) && (
                    <button
                        type="button"
                        onClick={onShowOnMap}
                        className="min-h-11 md:min-h-0 rounded-full px-2.5 py-1 text-[11px] text-accent hover:bg-accent/10"
                    >
                        {active ? '◉ On the map' : '◎ Map'}
                    </button>
                )}
                {menu.length > 0 && <OverflowMenu items={menu} />}
            </div>
        </div>
    );
}

function Cover({ place }: { place: Place }) {
    if (place.photos.length > 0) {
        return (
            <div className="relative h-36 w-full bg-gray-100">
                <Image src={`/api/photos/${place.photos[0]}`} alt="" fill unoptimized className="object-cover" />
            </div>
        );
    }
    if (!place.image_url) return null;
    return (
        // A third-party CDN: a plain <img>, and no-referrer keeps the admin URL
        // out of their logs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={place.image_url}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-36 w-full bg-gray-100 object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
    );
}

/**
 * One place, as a row — the Places list, and the column beside the map.
 *
 * Draggable onto a day card, which is what the map's split view is for.
 */
export function PlaceRow({ place, selected, onToggleSelect, dense = false, trailing, menu = [] }: {
    place: Place;
    selected?: boolean;
    onToggleSelect?: () => void;
    dense?: boolean;
    trailing?: React.ReactNode;
    menu?: OverflowMenuItem[];
}) {
    const api = useHoneymoonApi();
    const { openPlace } = usePlaceSheet();
    const onDays = api.dayOfPlace.get(place.id) ?? [];
    return (
        <li
            data-place-row={place.id}
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(PLACE_DRAG, String(place.id));
                event.dataTransfer.effectAllowed = 'copy';
            }}
            className={`flex items-center gap-3 px-3 hover:bg-gray-50 ${dense ? 'py-1' : 'py-2.5'}`}
        >
            {onToggleSelect && (
                <label className="-m-2 flex size-11 md:size-8 shrink-0 cursor-pointer items-center justify-center">
                    <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={onToggleSelect}
                        className="size-4 rounded accent-accent"
                        aria-label={`Select ${place.name}`}
                    />
                </label>
            )}
            {!dense && place.photos.length > 0 && (
                <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    <Image src={`/api/photos/${place.photos[0]}`} alt="" fill unoptimized className="object-cover" />
                </div>
            )}
            <button
                type="button"
                onClick={() => openPlace(place.id)}
                className="min-h-11 md:min-h-0 min-w-0 flex-1 text-left"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{place.name}</span>
                    {!hasCoords(place) && (
                        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">no pin</span>
                    )}
                    {place.needs_review && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">⚠ review</span>
                    )}
                    {onDays.length > 0 && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
                            day {onDays.join(', ')}
                        </span>
                    )}
                </div>
                {!dense && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <CategoryChip category={place.category} />
                        <StatusChip status={place.status} />
                        {place.region_id != null && (
                            <span className="text-[11px] text-gray-400">{api.regionById.get(place.region_id)}</span>
                        )}
                    </div>
                )}
            </button>
            {trailing}
            {menu.length > 0 && <OverflowMenu items={menu} />}
        </li>
    );
}
