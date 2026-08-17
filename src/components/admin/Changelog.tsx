'use client';

import { useEffect, useState } from 'react';
import {
    formatReleaseDate, leadOf, parseInline,
    type ChangelogEntry, type ChangelogRelease, type InlineToken,
} from '@/lib/changelog';
import { Modal } from './Modal';

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
 * "What's new" for the admin panel.
 *
 * The project keeps a real CHANGELOG.md — every change, why it was made, and
 * what broke — and until now the only way to read it was to open the repository.
 * The person actually using this panel is the person that file is written for,
 * so it belongs in here, next to the panel's own name.
 *
 * A dot appears when the newest release is one this browser hasn't opened yet.
 * Deliberately per-browser and not a database column: "have I read the release
 * notes" is a fact about a reader, not about the wedding.
 */
export default function Changelog() {
    const [open, setOpen] = useState(false);
    const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
    const [error, setError] = useState('');
    const [seen, setSeen] = useState<string | null>(null);
    const [latest, setLatest] = useState<string | null>(null);

    // After mount, not in the initial state: the server has no localStorage, and
    // seeding from it directly would render a dot on the server and none on the
    // client (or the reverse) and break hydration.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeen(localStorage.getItem(SEEN_KEY));
    }, []);

    /*
     * Ask only which release is newest, on mount.
     *
     * The dot has to be able to appear before anyone clicks, and it can't know
     * whether there is something unread without knowing the newest version — but
     * fetching the entire history on every admin page load to answer one string
     * would be absurd. `?latest=1` is that one string.
     */
    useEffect(() => {
        let alive = true;
        probeLatest().then((version) => { if (alive && version) setLatest(version); });
        return () => { alive = false; };
    }, []);

    // Fetched on first open, not on mount: this sits on every admin page and
    // nobody should pay for a request they didn't ask for.
    useEffect(() => {
        if (!open || releases) return;
        let alive = true;
        (async () => {
            try {
                const res = await fetch('/api/admin/changelog', { cache: 'no-store' });
                const body = await res.json();
                if (!alive) return;
                setReleases(body.releases ?? []);
                if (body.error) setError(body.error);
            } catch {
                if (alive) setError('Could not load the changelog.');
            }
        })();
        return () => { alive = false; };
    }, [open, releases]);

    const unread = latest != null && seen !== latest;

    const show = () => {
        setOpen(true);
        // Marked read on opening rather than on closing: opening is the read.
        if (latest) { localStorage.setItem(SEEN_KEY, latest); setSeen(latest); }
    };

    return (
        <>
            <button
                onClick={show}
                title="What's new in the admin panel"
                aria-label="What's new"
                className="relative shrink-0 rounded-full border border-gray-200 bg-white w-7 h-7
                    flex items-center justify-center text-gray-400 hover:text-gray-700
                    hover:bg-gray-50 transition"
            >
                {/* Drawn rather than an emoji: at 28px a font without the glyph
                    shows a tofu box, which reads as a broken button. */}
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
                    <path d="M12 2l1.6 4.9L18.5 8.5l-4.9 1.6L12 15l-1.6-4.9L5.5 8.5l4.9-1.6L12 2z" />
                    <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
                </svg>
                {unread && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent
                        ring-2 ring-white" />
                )}
            </button>

            <Modal open={open} onClose={() => setOpen(false)} title="What's new" wide>
                {releases == null ? (
                    <div className="animate-pulse space-y-3">
                        <div className="h-5 bg-gray-100 rounded-full w-40" />
                        <div className="h-20 bg-gray-100 rounded-2xl" />
                        <div className="h-20 bg-gray-100 rounded-2xl" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {error && (
                            <p className="text-sm text-amber-700 bg-amber-50 rounded-2xl px-3 py-2">
                                {error}
                            </p>
                        )}
                        {releases.map((release, index) => (
                            <Release key={release.id} release={release} startOpen={index === 0} />
                        ))}
                        {!releases.length && !error && (
                            <p className="text-sm text-gray-500">Nothing recorded yet.</p>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}

const GROUP_TONE: Record<string, string> = {
    Added: 'bg-emerald-50 text-emerald-800',
    Fixed: 'bg-amber-50 text-amber-800',
    Changed: 'bg-sky-50 text-sky-800',
    Removed: 'bg-rose-50 text-rose-800',
};

/**
 * One release, collapsed by default apart from the newest.
 *
 * Some of these releases run to forty long bullets. Everything open at once is a
 * wall; the headline of each change is what you scan, and the reasoning is there
 * when a particular one turns out to matter.
 */
function Release({ release, startOpen }: { release: ChangelogRelease; startOpen: boolean }) {
    const [open, setOpen] = useState(startOpen);

    return (
        <section className="rounded-2xl border border-gray-100 overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 transition
                    flex items-baseline gap-3"
            >
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">
                        {formatReleaseDate(release.version, release.date)}
                    </span>
                    {release.title && (
                        <span className="block text-xs text-gray-500 mt-0.5">{release.title}</span>
                    )}
                </span>
                <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                    {release.count} change{release.count === 1 ? '' : 's'}
                </span>
                <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="p-4 space-y-4">
                    {release.groups.map((group) => (
                        <div key={group.heading}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px]
                                font-semibold mb-2 ${GROUP_TONE[group.heading] ?? 'bg-gray-100 text-gray-700'}`}>
                                {group.heading}
                            </span>
                            <ul className="space-y-2">
                                {group.entries.map((entry, i) => (
                                    <Entry key={i} entry={entry} />
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

/** A single change: its headline always, the rest on request. */
function Entry({ entry }: { entry: ChangelogEntry }) {
    const [open, setOpen] = useState(false);
    const lead = leadOf(entry.text);
    // Nothing to expand when the headline already is the whole bullet.
    const hasMore = entry.children.length > 0 || entry.text.length > lead.length + 6;

    return (
        <li className="text-sm">
            <button
                onClick={() => hasMore && setOpen((v) => !v)}
                className={`text-left w-full flex items-baseline gap-2 rounded-xl px-2 py-1 -mx-2
                    ${hasMore ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
            >
                <span className="text-gray-300 shrink-0 text-xs mt-0.5">
                    {hasMore ? (open ? '▾' : '▸') : '·'}
                </span>
                <span className="font-medium text-gray-900">{lead}</span>
            </button>
            {open && (
                <div className="pl-6 pr-2 pt-1 space-y-1.5">
                    <p className="text-[13px] text-gray-600 leading-relaxed">
                        <Inline text={entry.text} />
                    </p>
                    {entry.children.map((child, i) => (
                        <p key={i} className="text-[13px] text-gray-600 leading-relaxed pl-3
                            border-l-2 border-gray-100">
                            <Inline text={child} />
                        </p>
                    ))}
                </div>
            )}
        </li>
    );
}

/**
 * Inline markup as React elements.
 *
 * Never `dangerouslySetInnerHTML`: this text is a file on disk, and rendering it
 * as elements means nothing in it can ever be interpreted as markup even if
 * someone pastes a `<script>` into a bullet.
 */
function Inline({ text }: { text: string }) {
    return (
        <>
            {parseInline(text).map((token, i) => <Token key={i} token={token} />)}
        </>
    );
}

function Token({ token }: { token: InlineToken }) {
    switch (token.kind) {
        // Bold and italic can wrap other markup — "**Portal (`/admin/x`)**" is
        // everywhere in this file — so their contents go back through the
        // tokeniser rather than being printed with the backticks still in.
        case 'strong':
            return (
                <strong className="font-semibold text-gray-800">
                    <Inline text={token.value} />
                </strong>
            );
        case 'em':
            return <em><Inline text={token.value} /></em>;
        case 'code':
            return (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] text-gray-800
                    font-mono break-words">
                    {token.value}
                </code>
            );
        case 'link':
            return (
                <a
                    href={token.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                >
                    {token.value}
                </a>
            );
        default:
            return <>{token.value}</>;
    }
}
