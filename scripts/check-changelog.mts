/**
 * Verifies the changelog parser against the real CHANGELOG.md.
 *
 *   npm run check:changelog
 *
 * No database and no network. Runs against the actual file as well as fixtures,
 * so a change to how the file is written that the parser cannot read is caught
 * here rather than by an empty panel.
 */
import fs from 'fs';
import path from 'path';
import { parseChangelog, parseInline, leadOf, plainOf, formatReleaseDate } from '../src/lib/changelog';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = '') {
    checks += 1;
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        failures += 1;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

console.log('\nStructure');
{
    const sample = [
        '# Changelog',
        '',
        'Preamble that is not a release.',
        '',
        '## v0.9.1 — [Unreleased] A thing and another (`main`, 2026-08-17 16:05)',
        '',
        '### Added',
        '- **A thing** that happened.',
        '  Continued on the next line.',
        '  - a nested detail',
        '  - another nested detail',
        '- **A second thing**.',
        '',
        '### Fixed',
        '- **Something broken** is no longer broken.',
        '',
        '## v0.9.0 — [Released] RSVP attendance choice (2026-07-27)',
        '',
        '### Changed',
        '- One change.',
        '',
        '## v0.1.0 — [Released] Initial launch (2025-12-31)',
        '',
        '### Added',
        '- Another change.',
    ].join('\n');

    const releases = parseChangelog(sample);
    check('finds every release', releases.length === 3, `${releases.length}`);
    check('reads the version', releases[0].version === 'v0.9.1', releases[0].version);
    check('reads the tag', releases[0].tag === 'Unreleased' && releases[1].tag === 'Released');
    check('reads the title', releases[1].title === 'RSVP attendance choice', releases[1].title);
    check('peels the decoration off the title',
        !releases[0].title.includes('(') && releases[0].title === 'A thing and another',
        releases[0].title);
    check('keeps the decoration as the date',
        releases[0].date === 'main, 2026-08-17 16:05', releases[0].date);
    check('a date-only decoration works too', releases[1].date === '2026-07-27', releases[1].date);
    check('groups by heading', releases[0].groups.map((g) => g.heading).join(',') === 'Added,Fixed',
        releases[0].groups.map((g) => g.heading).join(','));
    check('collects the bullets', releases[0].groups[0].entries.length === 2,
        `${releases[0].groups[0].entries.length}`);
    check('joins a wrapped line onto its bullet',
        releases[0].groups[0].entries[0].text.includes('Continued on the next line'));
    check('nests indented bullets', releases[0].groups[0].entries[0].children.length === 2);
    check('a nested bullet does not become a top-level one',
        releases[0].groups[0].entries.every((e) => !e.text.startsWith('a nested')));
    check('counts every bullet including nested', releases[0].count === 5, `${releases[0].count}`);
    check('the preamble is not a release', !releases.some((r) => r.version === 'Changelog'));

    // A heading appearing twice in one release must not split into two groups.
    const split = parseChangelog([
        '## v1.0.0 — [Released] T', '### Added', '- one', '### Fixed', '- two', '### Added', '- three',
    ].join('\n'));
    check('a repeated heading is one group', split[0].groups.length === 2,
        split[0].groups.map((g) => g.heading).join(','));
    check('and keeps both of its bullets', split[0].groups[0].entries.length === 2);

    check('an empty file yields nothing', parseChangelog('').length === 0);
    check('a release with no bullets is dropped',
        parseChangelog('## v1.0.0 — [Released] T\n\n### Added\n').length === 0);
    // An unversioned heading is not an entry: the format is the contract.
    check('an old-style heading is ignored',
        parseChangelog('## [Unreleased]\n\n### Added\n- one').length === 0);
}

console.log('\nInline markup');
{
    const tokens = parseInline('A **bold** bit, `some code`, *stress*, and a [link](https://x.dev).');
    const kinds = tokens.map((t) => t.kind).join(',');
    check('finds every kind', kinds.includes('strong') && kinds.includes('code')
        && kinds.includes('em') && kinds.includes('link'), kinds);
    check('strips the bold markers',
        tokens.some((t) => t.kind === 'strong' && t.value === 'bold'));
    check('strips the backticks',
        tokens.some((t) => t.kind === 'code' && t.value === 'some code'));
    check('splits a link into text and href',
        tokens.some((t) => t.kind === 'link' && t.value === 'link' && t.href === 'https://x.dev'));
    check('keeps the plain text between',
        tokens.filter((t) => t.kind === 'text').map((t) => t.value).join('').includes(' bit, '));
    check('round-trips the whole line',
        tokens.map((t) => t.value).join('').length > 40);

    // Markup inside a code span is literal — this file quotes code constantly.
    const literal = parseInline('use `**not bold**` here');
    check('markup inside code stays literal',
        literal.some((t) => t.kind === 'code' && t.value === '**not bold**')
        && !literal.some((t) => t.kind === 'strong'), literal.map((t) => t.kind).join(','));

    check('plain text is one token', parseInline('nothing special').length === 1);
    check('an empty line is no tokens', parseInline('').length === 0);
    check('an unclosed marker is left alone',
        parseInline('a **dangling start').every((t) => t.kind === 'text'));
}

console.log('\nSummaries');
{
    check('a bold headline becomes the lead',
        leadOf('**The headline.** Then a long explanation.') === 'The headline');
    check('trailing punctuation is trimmed',
        leadOf('**Another one —** more text') === 'Another one');
    check('without bold it takes the first sentence',
        leadOf('First sentence. Second sentence.') === 'First sentence');
    check('a long unpunctuated line is cut', leadOf('x'.repeat(400)).length <= 120);

    check('a bare date is written out',
        formatReleaseDate('2026-07-27') === 'Jul 27, 2026', formatReleaseDate('2026-07-27'));
    check('a branch and time keeps the time',
        formatReleaseDate('main, 2026-08-17 16:05') === 'Aug 17, 2026 · 16:05 UTC',
        formatReleaseDate('main, 2026-08-17 16:05'));
    check('an empty decoration is empty', formatReleaseDate('') === '');
    check('something unparseable is shown as-is', formatReleaseDate('soon') === 'soon');
    check('markup is stripped recursively',
        plainOf('**Portal (`/admin/x`)** and *more*') === 'Portal (/admin/x) and more',
        plainOf('**Portal (`/admin/x`)** and *more*'));
}

console.log('\nThe real CHANGELOG.md');
{
    const file = path.join(process.cwd(), 'CHANGELOG.md');
    const releases = parseChangelog(fs.readFileSync(file, 'utf8'));
    check('parses', releases.length > 5, `${releases.length} releases`);
    check('the newest carries a version', /^v\d+\.\d+\.\d+$/.test(releases[0].version),
        releases[0].version);
    check('every release is version-stamped',
        releases.every((r) => /^v\d+\.\d+\.\d+$/.test(r.version)),
        releases.filter((r) => !/^v\d+\.\d+\.\d+$/.test(r.version)).map((r) => r.version).join(','));
    check('versions are unique',
        new Set(releases.map((r) => r.version)).size === releases.length);
    check('versions descend, newest first', releases.every((r, i) => i === 0
        || compareVersions(releases[i - 1].version, r.version) > 0),
        releases.map((r) => r.version).join(' '));
    check('every release is tagged',
        releases.every((r) => r.tag === 'Released' || r.tag === 'Unreleased'));
    check('every release has a title', releases.every((r) => r.title.length > 0),
        releases.filter((r) => !r.title).map((r) => r.version).join(','));
    check('every release has a date', releases.every((r) => r.date.length > 0),
        releases.filter((r) => !r.date).map((r) => r.version).join(','));
    check('no title still carries its decoration',
        releases.every((r) => !/\(\s*\d{4}-/.test(r.title)));
    check('the newest release has content', releases[0].count > 0, `${releases[0].count} changes`);
    check('every release has at least one change', releases.every((r) => r.count > 0),
        releases.filter((r) => !r.count).map((r) => r.version).join(','));
    check('every release has at least one group',
        releases.every((r) => r.groups.length > 0));
    check('every group has at least one bullet',
        releases.every((r) => r.groups.every((g) => g.entries.length > 0)));
    check('no bullet is empty',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => e.text.trim().length > 0))));

    check('every bullet yields a lead',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => leadOf(e.text).length > 0))));
    check('every bullet tokenises',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => parseInline(e.text).length > 0))));
    // The honeymoon work should be findable in there.
    // Nested backticks cannot parse, and the result is raw ** or ` on screen. The
    // file is hand-written, so this is a real hazard rather than a theoretical one.
    const raw: string[] = [];
    for (const release of releases) {
        for (const group of release.groups) {
            for (const bullet of group.entries) {
                for (const text of [bullet.text, ...bullet.children]) {
                    const flat = plainOf(text);
                    if (flat.includes('**') || flat.includes('`')) raw.push(`${release.version}: ${flat.slice(0, 60)}`);
                }
            }
        }
    }
    check('no bullet renders raw markdown markers', raw.length === 0, raw[0] ?? '');

    // The portal is the biggest thing in here; if it is missing, the parse is wrong.
    check('the honeymoon portal is in there somewhere',
        releases.some((r) => r.groups.some((g) => g.entries.some((e) => /honeymoon/i.test(e.text)))));
}

function compareVersions(a: string, b: string): number {
    const pa = a.slice(1).split('.').map(Number);
    const pb = b.slice(1).split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
