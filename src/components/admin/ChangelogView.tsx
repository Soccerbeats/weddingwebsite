'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    formatReleaseDate, parseInline,
    type ChangelogGroup, type ChangelogRelease, type InlineToken,
} from '@/lib/changelog';

/**
 * The changelog, in Jarvis's two-column design.
 *
 * Carried over from Jarvis's `#changelog` view class-for-class — a version nav
 * down the left beside a reading pane, version and Released/Unreleased pills on
 * every entry, Added/Changed/Fixed as coloured badges, and a scrollspy that
 * highlights the version you are reading. Only the palette is translated.
 *
 * A whole page rather than a dialog: two columns and a scrollspy need the width,
 * and this is a thing you *read* rather than a thing you dismiss.
 */
export default function ChangelogView() {
    const router = useRouter();
    const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
    const [error, setError] = useState('');
    const [active, setActive] = useState(0);

    /** The scroller, and the observer root — the page owns its own scrolling. */
    const paneRef = useRef<HTMLDivElement | null>(null);
    const navRef = useRef<HTMLElement | null>(null);
    const sectionRefs = useRef<(HTMLElement | null)[]>([]);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Inter for titles, DM Mono for versions — the same two faces Jarvis uses,
    // loaded lazily here so the request belongs to this view rather than the
    // whole admin panel, and so a blocked request just falls back to system.
    useEffect(() => {
        if (document.getElementById('cl-fonts')) return;
        const link = document.createElement('link');
        link.id = 'cl-fonts';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700'
            + '&family=Inter:wght@600;700&display=swap';
        document.head.appendChild(link);
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch('/api/admin/changelog', { cache: 'no-store' });
                if (!res.ok) throw new Error(`http ${res.status}`);
                const body = await res.json();
                if (!alive) return;
                setReleases(body.releases ?? []);
                if (body.error) setError(body.error);
            } catch {
                if (alive) setError('Could not load the changelog.');
            }
        })();
        return () => { alive = false; };
    }, []);

    /**
     * Keep the active version visible by scrolling the NAV only.
     *
     * Guarded so it moves solely when the item is outside the nav's visible
     * range — otherwise reading down the pane drags the nav on every entry.
     */
    const revealItem = useCallback((index: number) => {
        const nav = navRef.current;
        const item = itemRefs.current[index];
        if (!nav || !item) return;
        const navBox = nav.getBoundingClientRect();
        const itemBox = item.getBoundingClientRect();
        if (itemBox.top >= navBox.top && itemBox.bottom <= navBox.bottom) return;
        const delta = (itemBox.top + itemBox.height / 2) - (navBox.top + navBox.height / 2);
        nav.scrollTo({ top: nav.scrollTop + delta, behavior: 'smooth' });
    }, []);

    /*
     * Scrollspy: the entry sitting in the band near the top of the reading area
     * is "current". Among the entries overlapping that band we take the topmost
     * — the smallest index, i.e. the newest — which is the one whose header is
     * nearest the top.
     */
    useEffect(() => {
        if (!releases?.length) return;
        const root = paneRef.current;
        if (!root) return;
        const visible = new Map<number, boolean>();
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const index = sectionRefs.current.indexOf(entry.target as HTMLElement);
                if (index >= 0) visible.set(index, entry.isIntersecting);
            }
            let pick = -1;
            for (const [index, seen] of visible) if (seen && (pick === -1 || index < pick)) pick = index;
            if (pick !== -1) {
                setActive(pick);
                revealItem(pick);
            }
        }, { root, rootMargin: '0px 0px -55% 0px', threshold: 0 });

        for (const section of sectionRefs.current) if (section) observer.observe(section);
        return () => observer.disconnect();
    }, [releases, revealItem]);

    return (
        <div ref={paneRef} className="cl-scope flex-1 min-h-0 overflow-auto px-4 md:px-6 pt-4 md:pt-6">
            <div className="cl-header mb-4">
                <button
                    onClick={() => router.push('/admin')}
                    className="cl-back"
                    aria-label="Back to the admin panel"
                >
                    ‹
                </button>
                <h1 className="text-2xl font-semibold text-gray-900">Changelog</h1>
                {releases?.[0] && (
                    <span className="cl-ver-pill ml-2">{releases[0].version}</span>
                )}
            </div>

            {releases == null ? (
                <div className="cl-loading">Loading…</div>
            ) : error && !releases.length ? (
                <div className="cl-error">{error}</div>
            ) : !releases.length ? (
                <div className="cl-error">No changelog entries found.</div>
            ) : (
                <div className="cl-body">
                    <aside className="cl-toc" ref={navRef}>
                        {releases.map((release, index) => (
                            <button
                                key={release.version}
                                ref={(el) => { itemRefs.current[index] = el; }}
                                className={`cl-toc-item${index === active ? ' active' : ''}`}
                                onClick={() => {
                                    sectionRefs.current[index]?.scrollIntoView({
                                        behavior: 'smooth', block: 'start',
                                    });
                                    setActive(index);
                                }}
                            >
                                <span className="cl-toc-ver">{release.version}</span>
                                <span className={`cl-toc-tag ${release.tag.toLowerCase()}`}>
                                    {release.tag}
                                </span>
                                <span className="cl-toc-title">{release.title}</span>
                            </button>
                        ))}
                    </aside>

                    <div className="cl-pane">
                        {releases.map((release, index) => (
                            <section
                                key={release.version}
                                ref={(el) => { sectionRefs.current[index] = el; }}
                                className="cl-entry"
                            >
                                <div className="cl-entry-titleline">
                                    <span className="cl-ver-pill">{release.version}</span>
                                    <span className={`cl-tag-pill ${release.tag.toLowerCase()}`}>
                                        {release.tag}
                                    </span>
                                    {release.date && (
                                        <span className="cl-entry-date">
                                            {formatReleaseDate(release.date)}
                                        </span>
                                    )}
                                </div>
                                {release.title && <h2 className="cl-entry-title">{release.title}</h2>}
                                <div className="cl-entry-content">
                                    {release.groups.map((group) => (
                                        <Group key={group.heading} group={group} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Added / Changed / Fixed render as coloured badges; anything else stays plain. */
const BADGED = new Set(['added', 'changed', 'fixed']);

function Group({ group }: { group: ChangelogGroup }) {
    const key = group.heading.toLowerCase();
    return (
        <div>
            <h3 className={`cl-group${BADGED.has(key) ? ` ${key}` : ''}`}>{group.heading}</h3>
            <ul className="list-disc pl-5 space-y-1.5">
                {group.entries.map((entry, i) => (
                    <li key={i}>
                        <Inline text={entry.text} />
                        {entry.children.length > 0 && (
                            <ul className="list-[circle] pl-5 mt-1 space-y-1">
                                {entry.children.map((child, j) => (
                                    <li key={j}><Inline text={child} /></li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Inline markup as React elements.
 *
 * Never `dangerouslySetInnerHTML`: rendering as elements means nothing in the
 * file can be interpreted as markup, even if a bullet ever quotes a `<script>`.
 */
function Inline({ text }: { text: string }) {
    const tokens = useMemo(() => parseInline(text), [text]);
    return <>{tokens.map((token, i) => <Token key={i} token={token} />)}</>;
}

function Token({ token }: { token: InlineToken }) {
    switch (token.kind) {
        // Bold and italic can wrap other markup — "**Portal (`/admin/x`)**" is
        // everywhere in this file — so their contents go back through the
        // tokeniser rather than being printed with the backticks still in.
        case 'strong':
            return <strong className="font-semibold text-gray-900"><Inline text={token.value} /></strong>;
        case 'em':
            return <em><Inline text={token.value} /></em>;
        case 'code':
            return (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] text-gray-800 font-mono">
                    {token.value}
                </code>
            );
        case 'link':
            return (
                <a href={token.href} target="_blank" rel="noopener noreferrer"
                    className="text-accent underline">
                    {token.value}
                </a>
            );
        default:
            return <>{token.value}</>;
    }
}
