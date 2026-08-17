/**
 * Parser for the repository's CHANGELOG.md.
 *
 * The file is the record of what changed and why, written for whoever comes
 * back to it later — including whoever is using the admin panel and wondering
 * what moved since last week. Rather than maintain a second copy of that story
 * in the UI, the panel reads this one.
 *
 * Deliberately a parser for *this* file's shape rather than a general Markdown
 * engine: `## [date] — title`, `### Added`, and one bullet per change, some
 * nested. A dependency that renders arbitrary Markdown would be a lot of weight
 * (and a lot of HTML-injection surface) for four constructs.
 */

export interface ChangelogEntry {
    /** Bullet text, still carrying its inline markup. */
    text: string;
    /** Nested bullets beneath it, if any. */
    children: string[];
}

export interface ChangelogGroup {
    /** "Added", "Fixed", "Changed", "Verification"… */
    heading: string;
    entries: ChangelogEntry[];
}

export interface ChangelogRelease {
    /**
     * Unique across the file, unlike `version`.
     *
     * The changelog has four separate `## [2026-05-25]` headings — different
     * sessions on one day, written without a qualifier — so the version alone
     * cannot identify a release or key a list.
     */
    id: string;
    /** The bracketed part: "Unreleased", "2026-07-27", "2026-06-01 session 2". */
    version: string;
    /** The em-dashed summary after it, if the release has one. */
    title: string;
    /** `YYYY-MM-DD` when the version starts with a date, else null. */
    date: string | null;
    groups: ChangelogGroup[];
    /** Every bullet across every group — for a count without walking the tree. */
    count: number;
}

const RELEASE = /^##\s+\[([^\]]+)\]\s*(?:[—-]\s*(.*))?$/;
const GROUP = /^###\s+(.+)$/;
const BULLET = /^-\s+(.*)$/;
const NESTED = /^\s{2,}-\s+(.*)$/;
/** A continuation line: an indented paragraph belonging to the bullet above. */
const CONTINUATION = /^\s{2,}(\S.*)$/;

export function parseChangelog(markdown: string): ChangelogRelease[] {
    const releases: ChangelogRelease[] = [];
    let release: ChangelogRelease | null = null;
    let group: ChangelogGroup | null = null;
    let entry: ChangelogEntry | null = null;

    const seenVersions = new Map<string, number>();

    for (const raw of markdown.split(/\r?\n/)) {
        const releaseMatch = RELEASE.exec(raw);
        if (releaseMatch) {
            const version = releaseMatch[1].trim();
            const nth = (seenVersions.get(version) ?? 0) + 1;
            seenVersions.set(version, nth);
            release = {
                id: nth === 1 ? version : `${version} #${nth}`,
                version,
                title: (releaseMatch[2] ?? '').trim(),
                date: /^\d{4}-\d{2}-\d{2}/.test(version) ? version.slice(0, 10) : null,
                groups: [],
                count: 0,
            };
            releases.push(release);
            group = null;
            entry = null;
            continue;
        }

        const groupMatch = GROUP.exec(raw);
        if (groupMatch && release) {
            // The same heading twice in one release is one group, not two — an
            // "### Added" that got split by an interleaved "### Fixed" should
            // still read as a single list.
            const heading = groupMatch[1].trim();
            group = release.groups.find((g) => g.heading === heading) ?? null;
            if (!group) {
                group = { heading, entries: [] };
                release.groups.push(group);
            }
            entry = null;
            continue;
        }

        if (!release) continue;

        // A bullet with no ### above it still belongs somewhere.
        const nested = NESTED.exec(raw);
        if (nested && entry) {
            entry.children.push(nested[1].trim());
            release.count += 1;
            continue;
        }

        const bullet = BULLET.exec(raw);
        if (bullet) {
            if (!group) {
                group = { heading: 'Changes', entries: [] };
                release.groups.push(group);
            }
            entry = { text: bullet[1].trim(), children: [] };
            group.entries.push(entry);
            release.count += 1;
            continue;
        }

        // Wrapped prose under a bullet — join it back onto one line.
        const continuation = CONTINUATION.exec(raw);
        if (continuation && entry) {
            if (entry.children.length) {
                entry.children[entry.children.length - 1] += ` ${continuation[1].trim()}`;
            } else {
                entry.text += ` ${continuation[1].trim()}`;
            }
        }
    }

    // Drop anything that ended up empty (a heading with nothing under it yet).
    for (const item of releases) item.groups = item.groups.filter((g) => g.entries.length);
    return releases.filter((r) => r.groups.length);
}

/* ------------------------------------------------------------------ */
/* Inline markup                                                       */
/* ------------------------------------------------------------------ */

export type InlineToken =
    | { kind: 'text'; value: string }
    | { kind: 'strong'; value: string }
    | { kind: 'em'; value: string }
    | { kind: 'code'; value: string }
    | { kind: 'link'; value: string; href: string };

/**
 * Split a line into inline tokens.
 *
 * Tokens, not HTML: the renderer turns these into React elements, so nothing
 * from the file can ever be interpreted as markup. `**bold**`, `` `code` ``,
 * `*italic*` and `[text](url)` are the four the changelog actually uses.
 *
 * Code spans are matched first and their contents are never re-scanned, so a
 * literal `**` inside backticks stays literal — which matters in a file that
 * quotes code for a living.
 */
export function parseInline(line: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    // Order matters: code first, then the longer `**` before the shorter `*`.
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
    let last = 0;

    for (const match of line.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at > last) tokens.push({ kind: 'text', value: line.slice(last, at) });
        const [whole] = match;

        if (whole.startsWith('`')) {
            tokens.push({ kind: 'code', value: whole.slice(1, -1) });
        } else if (whole.startsWith('**')) {
            tokens.push({ kind: 'strong', value: whole.slice(2, -2) });
        } else if (whole.startsWith('*')) {
            tokens.push({ kind: 'em', value: whole.slice(1, -1) });
        } else {
            const split = whole.indexOf('](');
            tokens.push({
                kind: 'link',
                value: whole.slice(1, split),
                href: whole.slice(split + 2, -1),
            });
        }
        last = at + whole.length;
    }

    if (last < line.length) tokens.push({ kind: 'text', value: line.slice(last) });
    return tokens;
}

/**
 * The first sentence of a bullet, for a collapsed summary.
 *
 * Changelog bullets here open with a bold headline and then explain themselves
 * at length; the headline alone is what you scan.
 */
export function leadOf(text: string): string {
    const bold = /^\*\*(.+?)\*\*/.exec(text);
    // Headlines end in all sorts of punctuation ("**Thing.**", "**Thing —**"),
    // and a heading shouldn't wear it.
    // The headline itself can contain markup — "**Portal (`/admin/x`)**" — and a
    // collapsed summary is plain text, so it is flattened rather than shown raw.
    if (bold) return plainOf(bold[1]).replace(/[\s.:;,—–-]+$/, '');
    const stop = text.search(/\.\s/);
    return (stop > 0 ? text.slice(0, stop) : text).slice(0, 120);
}

/**
 * Markup stripped, recursively.
 *
 * Bold can wrap code and code can contain anything, so one pass is not enough:
 * `**Portal (`/admin/x`)**` needs the bold markers gone *and* the backticks.
 */
export function plainOf(line: string): string {
    return parseInline(line)
        .map((token) => (token.kind === 'text' || token.kind === 'code' || token.kind === 'link'
            ? token.value
            : plainOf(token.value)))
        .join('');
}

/** "17 Aug 2026" from `YYYY-MM-DD`; anything else is passed through. */
export function formatReleaseDate(version: string, date: string | null): string {
    if (!date) return version;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return version;
    const nice = parsed.toLocaleDateString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    // "2026-06-01 session 2" keeps its qualifier.
    const extra = version.slice(10).trim();
    return extra ? `${nice} · ${extra}` : nice;
}
