'use client';

import { useMemo } from 'react';
import {
    RATINGS, distanceKm, formatDistance, formatPerNight, hasCoords, priceValue,
} from '@/lib/honeymoon';
import type { Place } from '@/lib/honeymoon';
import { formatMoney } from '@/lib/honeymoonBudget';
import { providerOf } from '@/lib/honeymoonPlaces';
import type { HoneymoonApi } from './useHoneymoon';

/**
 * The shortlist as a table.
 *
 * Ranking answers *which order*; this answers *why*. Six villas side by side
 * with the four things you actually decide on — what it costs, where it is, how
 * far it is from the excursions you have said yes to, and what you two thought
 * — is a comparison you cannot make from cards, because cards only ever show one
 * pair at a time.
 *
 * The distance column is the useful trick: the average distance from this stay to
 * every excursion rated 👍, which is the number that quietly decides how much of
 * the trip is spent in a car.
 */
export default function CompareTable({ api, stays, onPick }: {
    api: HoneymoonApi;
    stays: Place[];
    onPick: (place: Place) => void;
}) {
    const currency = api.data?.trip.home_currency || 'USD';

    /** Excursions you have said yes to — the things the stay has to be near. */
    const wanted = useMemo(
        () => (api.data?.places ?? []).filter(
            (place) => place.is_excursion && !place.archived && place.rating === 'yes'
                && hasCoords(place),
        ),
        [api.data?.places],
    );

    const rows = useMemo(() => stays.map((stay) => {
        const distances = hasCoords(stay)
            ? wanted.map((place) => distanceKm(
                { lat: stay.lat as number, lng: stay.lng as number },
                { lat: place.lat as number, lng: place.lng as number },
            ))
            : [];
        const average = distances.length
            ? distances.reduce((sum, km) => sum + km, 0) / distances.length
            : null;
        return {
            stay,
            average,
            nearest: distances.length ? Math.min(...distances) : null,
            nightly: stay.cost != null && stay.cost_per === 'night'
                ? stay.cost
                : priceValue(stay.price_note),
        };
    }), [stays, wanted]);

    if (!stays.length) {
        return (
            <p className="px-1 py-4 text-sm text-gray-500">
                Nothing to compare in this bucket.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
                <thead>
                    <tr className="border-b border-gray-200 text-left">
                        <Th>Stay</Th>
                        <Th>Rank</Th>
                        <Th>Per night</Th>
                        <Th>Area</Th>
                        <Th>
                            To your excursions
                            <span className="block text-[10px] font-normal text-gray-400">
                                {wanted.length
                                    ? `average of ${wanted.length} rated 👍`
                                    : 'rate some excursions first'}
                            </span>
                        </Th>
                        <Th>Verdict</Th>
                        <Th>Links</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ stay, average, nearest, nightly }) => {
                        const rating = RATINGS.find((entry) => entry.key === stay.rating);
                        return (
                            <tr
                                key={stay.id}
                                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                            >
                                <td className="py-2 pr-3">
                                    <button
                                        onClick={() => onPick(stay)}
                                        className="text-left font-medium text-gray-900
                                            hover:text-accent hover:underline decoration-dotted"
                                    >
                                        {stay.name}
                                    </button>
                                    {stay.star_rating != null && (
                                        <span className="ml-1.5 text-[11px] text-amber-600">
                                            {stay.star_rating}★
                                        </span>
                                    )}
                                </td>
                                <td className="py-2 pr-3 tabular-nums text-gray-500">
                                    {stay.rank != null ? `#${stay.rank}` : '—'}
                                </td>
                                <td className="py-2 pr-3 tabular-nums">
                                    {stay.cost != null
                                        ? (
                                            <span className="text-gray-900">
                                                {formatMoney(stay.cost, stay.cost_currency || currency)}
                                                {stay.cost_per !== 'night' && (
                                                    <span className="text-[11px] text-gray-400">
                                                        {stay.cost_per === 'person'
                                                            ? ' pp' : ' total'}
                                                    </span>
                                                )}
                                            </span>
                                        )
                                        : nightly != null
                                            ? (
                                                <span className="text-gray-500">
                                                    {formatPerNight(stay.price_note ?? '', currency)}
                                                </span>
                                            )
                                            : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 pr-3 text-gray-600">
                                    {stay.region_id != null
                                        ? api.regionById.get(stay.region_id) ?? '—'
                                        : <span className="text-gray-300">no area</span>}
                                </td>
                                <td className="py-2 pr-3 tabular-nums">
                                    {average != null ? (
                                        <>
                                            <span className="text-gray-900">
                                                {formatDistance(average)}
                                            </span>
                                            {nearest != null && (
                                                <span className="text-[11px] text-gray-400">
                                                    {' '}· nearest {formatDistance(nearest)}
                                                </span>
                                            )}
                                        </>
                                    ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 pr-3">
                                    {rating ? (
                                        <span
                                            className="rounded-full px-2 py-0.5 text-[11px]
                                                font-medium text-white"
                                            style={{ backgroundColor: rating.color }}
                                        >
                                            {rating.icon}
                                        </span>
                                    ) : <span className="text-gray-300">—</span>}
                                    {/* Per-person marks, when they disagree with
                                        each other, are the whole point of showing
                                        this column at all. */}
                                    {Object.entries(stay.ratings ?? {}).length > 0 && (
                                        <span className="ml-1.5 text-[11px] text-gray-500">
                                            {Object.entries(stay.ratings).map(([person, value]) => (
                                                `${person[0]}${value === 'yes' ? '👍' : value === 'no' ? '👎' : '😐'}`
                                            )).join(' ')}
                                        </span>
                                    )}
                                </td>
                                <td className="py-2">
                                    <div className="flex flex-wrap gap-1">
                                        {stay.links.slice(0, 3).map((link) => (
                                            <a
                                                key={link.url}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-full bg-gray-100 px-2 py-0.5
                                                    text-[10px] text-gray-600 hover:bg-gray-200"
                                            >
                                                {providerOf(link.url) ?? 'Link'}
                                            </a>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function Th({ children }: { children: React.ReactNode }) {
    return (
        <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {children}
        </th>
    );
}
