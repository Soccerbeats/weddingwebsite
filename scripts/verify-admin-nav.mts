/**
 * The admin sidebar's fit-the-height rule, with no browser:
 *
 *   npm run check:nav
 *
 * Dashboard and Planning are never folded; everything shows while it fits;
 * tighter spacing comes before folding; Settings folds before Pages; touch
 * screens never get the compact rows; and when nothing fits it says so (the
 * list scrolls) rather than pretending.
 */
import { chooseNavLayout, groupHeight, navHeight, DENSITY, NAV_PADDING, GROUP_GAP, type NavGroupShape } from '../src/lib/adminNavLayout';

let failures = 0;
let checks = 0;
function check(label: string, condition: boolean, detail = '') {
    checks += 1;
    if (condition) console.log(`  ✓ ${label}`);
    else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// The sidebar's real shape (AdminSidebar.tsx → NAV_GROUPS).
const GROUPS: NavGroupShape[] = [
    { id: 'top', items: 1, titled: false, pinned: true },
    { id: 'planning', items: 4, titled: true, pinned: true },
    { id: 'pages', items: 9, titled: true, pinned: false },
    { id: 'settings', items: 3, titled: true, pinned: false },
];
const ORDER = ['settings', 'pages'];
const none = new Set<string>();
const both = new Set(['settings', 'pages']);

console.log('\nHeights');
const c = DENSITY.comfortable;
check('first group has no gap above it', groupHeight(GROUPS[0], 'comfortable', false, true) === c.item);
check('a titled group: gap + heading + rows + gaps between',
    groupHeight(GROUPS[1], 'comfortable', false, false) === GROUP_GAP + c.title + 4 * c.item + 3 * c.gap);
check('a folded group is one row and its gap', groupHeight(GROUPS[2], 'comfortable', true, false) === GROUP_GAP + c.item);
const full = navHeight(GROUPS, 'comfortable', none);
check('the full list adds up (956px)', full === 956, String(full));
check('compact is shorter than comfortable', navHeight(GROUPS, 'compact', none) < full);
check('a pinned group ignores being asked to fold',
    navHeight(GROUPS, 'comfortable', new Set(['planning'])) === full);
check('padding is counted top and bottom', navHeight([], 'comfortable', none) === NAV_PADDING * 2);

console.log('\nThe ladder');
const tall = chooseNavLayout(GROUPS, 2000, ORDER);
check('room for everything: nothing folds, comfortable', tall.folded.length === 0 && tall.density === 'comfortable' && tall.fits);
const exact = chooseNavLayout(GROUPS, full, ORDER);
check('exactly enough room still shows everything', exact.folded.length === 0 && exact.density === 'comfortable');
const tighter = chooseNavLayout(GROUPS, full - 1, ORDER);
check('a pixel short: everything, compact — before anything folds', tighter.folded.length === 0 && tighter.density === 'compact');
const compactFull = navHeight(GROUPS, 'compact', none);
const one = chooseNavLayout(GROUPS, compactFull - 1, ORDER);
check('compact does not fit: Settings folds first', one.folded.join() === 'settings', one.folded.join());
check('… still compact: Settings folded at full spacing would not fit', one.density === 'compact');
const settingsComfy = navHeight(GROUPS, 'comfortable', new Set(['settings']));
const between = chooseNavLayout(GROUPS, settingsComfy, ORDER);
check('every page tighter beats hiding some at full size',
    compactFull < settingsComfy && between.folded.length === 0 && between.density === 'compact');
const bothComfy = navHeight(GROUPS, 'comfortable', both);
const short = chooseNavLayout(GROUPS, bothComfy, ORDER);
check('short: Pages folds too', short.folded.join() === 'settings,pages' && short.fits, short.folded.join());
check('Dashboard and Planning are never folded', !short.folded.includes('top') && !short.folded.includes('planning'));
const tiny = chooseNavLayout(GROUPS, 100, ORDER);
check('nothing fits: everything folded, compact, and it says it does not fit',
    tiny.folded.length === 2 && tiny.density === 'compact' && !tiny.fits);
check('… with the height the list will scroll over', tiny.height === navHeight(GROUPS, 'compact', both));
check('the layout never folds a group not in the fold order',
    chooseNavLayout(GROUPS, 100, ['settings']).folded.join() === 'settings');

console.log('\nTouch screens');
const touch = chooseNavLayout(GROUPS, full - 1, ORDER, false);
check('no compact rows: folds Settings instead', touch.density === 'comfortable' && touch.folded.join() === 'settings');
const touchTiny = chooseNavLayout(GROUPS, 100, ORDER, false);
check('nothing fits: comfortable rows, still scrolls', touchTiny.density === 'comfortable' && !touchTiny.fits);

console.log('\nMonotone');
let previous = -1;
let monotone = true;
const rank = (l: ReturnType<typeof chooseNavLayout>) => l.folded.length * 2 + (l.density === 'compact' ? 1 : 0);
for (let h = 1200; h >= 200; h -= 4) {
    const r = rank(chooseNavLayout(GROUPS, h, ORDER));
    if (r < previous) monotone = false;
    previous = r;
}
check('a shorter screen never shows more than a taller one', monotone);

console.log(`\n${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
