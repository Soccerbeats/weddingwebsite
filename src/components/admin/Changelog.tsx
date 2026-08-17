'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SEEN_KEY = 'admin.changelog.seen';

/**
 * One probe per page, shared.
 *
 * This renders twice — once in the desktop sidebar, once in the mobile top bar,
 * because on a phone the sidebar's header sits behind the site's floating nav
 * and is untappable. Two instances shouldn't mean two requests.
 */
let latestProbe: Promise<string | null> | null = null;

function probeLatest(): Promise<string | null> {
    latestProbe ??= fetch('/api/admin/changelog?latest=1', { cache: 'no-store' })
        .then((res) => res.json())
        .then((body) => body.latest ?? null)
        .catch(() => null);
    return latestProbe;
}

/**
 * The app's version, beside the panel's own name, linking to the changelog.
 *
 * The version is not stored anywhere but `CHANGELOG.md` — the topmost `vX.Y.Z`
 * heading is the app's version, exactly as in Jarvis, so there is no second copy
 * in `package.json` to fall out of step. A dot marks a version this browser has
 * not opened yet; per-browser on purpose, since "have I read the release notes"
 * is a fact about a reader, not about the wedding.
 */
export default function Changelog() {
    const [latest, setLatest] = useState<string | null>(null);
    const [seen, setSeen] = useState<string | null>(null);

    // After mount, not in the initial state: the server has no localStorage, and
    // seeding from it directly would render a dot on the server and none on the
    // client (or the reverse) and break hydration.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeen(localStorage.getItem(SEEN_KEY));
    }, []);

    useEffect(() => {
        let alive = true;
        probeLatest().then((version) => { if (alive && version) setLatest(version); });
        return () => { alive = false; };
    }, []);

    const unread = latest != null && seen !== latest;

    return (
        <Link
            href="/admin/changelog"
            onClick={() => {
                // Opening is the read.
                if (latest) { localStorage.setItem(SEEN_KEY, latest); setSeen(latest); }
            }}
            title="What's new — the full changelog"
            aria-label={latest ? `Changelog, version ${latest}` : 'Changelog'}
            className="relative shrink-0 rounded-full border border-gray-200 bg-white
                px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800
                hover:border-gray-300 transition tabular-nums"
            style={{ fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, monospace" }}
        >
            {/* Before the probe lands there is no version to show, and inventing
                a placeholder would make the panel look like it shipped one. */}
            {latest ?? '···'}
            {unread && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent
                    ring-2 ring-white" />
            )}
        </Link>
    );
}
