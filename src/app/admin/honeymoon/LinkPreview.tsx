'use client';

import { useEffect, useState } from 'react';
import { RATINGS, type PlaceRating } from '@/lib/honeymoon';
import { Modal } from './ui';

/**
 * Preview a linked page without leaving the portal.
 *
 * Booking and tour sites increasingly send `frame-ancestors 'none'` — Booking.com
 * already does, in report-only mode, so framing works today and is one config
 * flip from not. The frame is therefore best-effort: if it hasn't reported a load
 * shortly after opening, the fallback and the open-in-a-tab button take over. The
 * button is always present regardless.
 *
 * Mount this with a `key` per item so it starts fresh; it has no reset logic.
 */
export default function LinkPreview({ title, url, rating, onRate, onClose }: {
    title: string;
    url: string | null;
    rating: PlaceRating;
    onRate: (rating: PlaceRating | '') => void;
    onClose: () => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);

    // Patience clock only — keyed by item, so it always mounts fresh.
    useEffect(() => {
        const timer = setTimeout(() => setGaveUp(true), 6000);
        return () => clearTimeout(timer);
    }, []);

    if (!url) return null;

    return (
        <Modal open onClose={onClose} title={title} wide>
            <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                    <iframe
                        src={url}
                        title={title}
                        className="w-full h-[60vh]"
                        onLoad={() => setLoaded(true)}
                        // Same-origin is deliberately withheld: this is a third-party
                        // page and it has no business touching this admin session.
                        sandbox="allow-scripts allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                    {!loaded && gaveUp && (
                        <div className="absolute inset-0 bg-white flex items-center justify-center p-6">
                            <div className="text-center max-w-sm">
                                <p className="text-sm font-medium text-gray-700">
                                    This site won&apos;t display inside the portal
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Some sites block being embedded. Open it in a tab instead —
                                    your notes and rating stay here.
                                </p>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block mt-3 rounded-full bg-accent text-white
                                        px-4 py-1.5 text-sm font-medium hover:opacity-90"
                                >
                                    Open the page ↗
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {RATINGS.map((r) => (
                        <button
                            key={r.key}
                            onClick={() => { onRate(rating === r.key ? '' : r.key); onClose(); }}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium border transition
                                ${rating === r.key
                                ? 'text-white border-transparent'
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                            style={rating === r.key ? { backgroundColor: r.color } : undefined}
                        >
                            {r.icon} {r.label}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                    >
                        Open in a tab ↗
                    </a>
                </div>
            </div>
        </Modal>
    );
}
