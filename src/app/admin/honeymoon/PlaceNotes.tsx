'use client';

import { useState } from 'react';
import { RATINGS } from '@/lib/honeymoon';
import type { Place, PlaceRating } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, TextArea } from './ui';

/** The names on the trip, from settings, or a sensible pair of placeholders. */
export function partnersOf(names: string | undefined): string[] {
    const list = (names ?? '').split(',').map((name) => name.trim()).filter(Boolean);
    return list.length ? list.slice(0, 4) : [];
}

/**
 * Who liked it, and what they said.
 *
 * With two people rating one shortlist, a single `rating` column means the last
 * person to tap decides — and a disagreement, which is the interesting case, is
 * invisible. Per-person ratings make it visible; `rating` stays as the shared
 * verdict so nothing that already reads it changes.
 */
export function PersonRatings({ api, place }: { api: HoneymoonApi; place: Place }) {
    const partners = partnersOf(api.data?.trip.partner_names);
    if (!partners.length) return null;

    const set = (person: string, rating: PlaceRating | '') => {
        const next = { ...(place.ratings ?? {}) };
        if (!rating) delete next[person];
        else next[person] = rating;
        api.patchPlace(place.id, { ratings: next });
    };

    const values = partners.map((person) => place.ratings?.[person]);
    const disagree = values.includes('yes') && values.includes('no');

    return (
        <div className="space-y-1.5">
            {partners.map((person) => {
                const current = place.ratings?.[person];
                return (
                    <div key={person} className="flex items-center gap-1.5">
                        <span className="w-16 shrink-0 truncate text-[11px] font-medium
                            text-gray-500">
                            {person}
                        </span>
                        {RATINGS.map((rating) => {
                            const on = current === rating.key;
                            return (
                                <button
                                    key={rating.key}
                                    type="button"
                                    onClick={() => set(person, on ? '' : rating.key)}
                                    className={`rounded-full border px-2 py-0.5 text-[11px]
                                        transition ${on
                                        ? 'border-transparent text-white'
                                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                    style={on ? { backgroundColor: rating.color } : undefined}
                                    title={`${person}: ${rating.label}`}
                                >
                                    {rating.icon}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
            {disagree && (
                <p className="rounded-xl bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    You two disagree about this one.
                </p>
            )}
        </div>
    );
}

/**
 * Short notes on a place, from one of you to the other.
 *
 * Deliberately not threaded: the conversation about a hotel is four lines long,
 * and a reply model would cost more to build and read than it is worth.
 */
export function PlaceComments({ api, place }: { api: HoneymoonApi; place: Place }) {
    const partners = partnersOf(api.data?.trip.partner_names);
    const comments = (api.data?.comments ?? []).filter((row) => row.place_id === place.id);
    const [body, setBody] = useState('');
    const [author, setAuthor] = useState(partners[0] ?? '');
    const [busy, setBusy] = useState(false);

    const add = async () => {
        if (!body.trim()) return;
        setBusy(true);
        try {
            const ok = await api.create('comments', {
                place_id: place.id, author: author.trim(), body: body.trim(),
            });
            if (ok) setBody('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            {comments.length > 0 && (
                <ul className="space-y-1.5">
                    {comments.map((comment) => (
                        <li key={comment.id} className="rounded-xl bg-gray-50 px-2.5 py-1.5">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-semibold text-gray-700">
                                    {comment.author || 'Someone'}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    {comment.created_at
                                        ? new Date(comment.created_at).toLocaleDateString()
                                        : ''}
                                </span>
                                <div className="flex-1" />
                                <button
                                    type="button"
                                    onClick={() => api.removeRow(
                                        'comments', comment, 'Removed a comment',
                                    )}
                                    className="text-[10px] text-gray-400 hover:text-rose-600"
                                >
                                    ×
                                </button>
                            </div>
                            <p className="whitespace-pre-wrap text-xs text-gray-700">
                                {comment.body}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex items-end gap-2">
                {partners.length > 1 && (
                    <select
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-1.5
                            text-xs text-gray-700"
                    >
                        {partners.map((person) => (
                            <option key={person} value={person}>{person}</option>
                        ))}
                    </select>
                )}
                <TextArea
                    rows={2}
                    value={body}
                    placeholder="Too far from the beach?"
                    onChange={(e) => setBody(e.target.value)}
                />
                <Button onClick={add} disabled={!body.trim() || busy}>Add</Button>
            </div>
        </div>
    );
}
