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
import { parseChangelog, parseInline, leadOf, formatReleaseDate } from '../src/lib/changelog';

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
        '## [Unreleased]',
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
        '## [2026-07-27] — RSVP attendance choice',
        '',
        '### Changed',
        '- One change.',
        '',
        '## [2026-06-01 session 2] — Mobile hero polish',
        '',
        '### Added',
        '- Another change.',
    ].join('\n');

    const releases = parseChangelog(sample);
    check('finds every release', releases.length === 3, `${releases.length}`);
    check('reads the version', releases[0].version === 'Unreleased');
    check('reads the title', releases[1].title === 'RSVP attendance choice', releases[1].title);
    check('reads the date', releases[1].date === '2026-07-27', String(releases[1].date));
    check('Unreleased has no date', releases[0].date === null);
    check('keeps a session qualifier out of the date',
        releases[2].date === '2026-06-01' && releases[2].version === '2026-06-01 session 2');
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
    check('the preamble is not a release',
        !releases.some((r) => r.version === 'Changelog'));

    // A heading appearing twice in one release must not split into two groups.
    const split = parseChangelog([
        '## [Unreleased]', '### Added', '- one', '### Fixed', '- two', '### Added', '- three',
    ].join('\n'));
    check('a repeated heading is one group', split[0].groups.length === 2,
        split[0].groups.map((g) => g.heading).join(','));
    check('and keeps both of its bullets', split[0].groups[0].entries.length === 2);

    check('an empty file yields nothing', parseChangelog('').length === 0);
    check('a release with no bullets is dropped',
        parseChangelog('## [Unreleased]\n\n### Added\n').length === 0);
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

    check('a date is written out', formatReleaseDate('2026-07-27', '2026-07-27') === 'Jul 27, 2026',
        formatReleaseDate('2026-07-27', '2026-07-27'));
    check('a qualifier survives',
        formatReleaseDate('2026-06-01 session 2', '2026-06-01') === 'Jun 1, 2026 · session 2',
        formatReleaseDate('2026-06-01 session 2', '2026-06-01'));
    check('Unreleased is passed through',
        formatReleaseDate('Unreleased', null) === 'Unreleased');
}

console.log('\nThe real CHANGELOG.md');
{
    const file = path.join(process.cwd(), 'CHANGELOG.md');
    const releases = parseChangelog(fs.readFileSync(file, 'utf8'));
    check('parses', releases.length > 5, `${releases.length} releases`);
    check('the newest is Unreleased', releases[0].version === 'Unreleased', releases[0].version);
    check('it has content', releases[0].count > 20, `${releases[0].count} changes`);
    check('every release has at least one group',
        releases.every((r) => r.groups.length > 0));
    check('every group has at least one bullet',
        releases.every((r) => r.groups.every((g) => g.entries.length > 0)));
    check('no bullet is empty',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => e.text.trim().length > 0))));
    check('every dated release parsed its date',
        releases.filter((r) => r.version !== 'Unreleased').every((r) => r.date !== null),
        releases.filter((r) => r.date === null).map((r) => r.version).join(','));
    check('every bullet yields a lead',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => leadOf(e.text).length > 0))));
    check('every bullet tokenises',
        releases.every((r) => r.groups.every((g) => g.entries.every((e) => parseInline(e.text).length > 0))));
    // The honeymoon work should be findable in there.
    check('this release mentions the honeymoon portal',
        releases[0].groups.some((g) => g.entries.some((e) => /honeymoon/i.test(e.text))));
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
