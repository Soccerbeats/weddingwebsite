/**
 * The home page's hero collapse, driven by the input a real device actually
 * sends, at the widths real devices actually have.
 *
 * The hero renders two layouts — a narrow one and a wide one — and that choice is
 * a question about width. Which *input* drives the animation is a different
 * question, about the pointer, and the two were conflated once: above 768px the
 * hero listened only for `wheel`, so a tablet, or a phone turned on its side, got
 * no handler at all. The finger scrolled the page instead and the hero snapped
 * straight to the collage with no animation. Nothing caught it, because every
 * check drove a mouse.
 *
 * So each case below pairs a viewport with the input that viewport would really
 * use. Run against a server with hero photos configured:
 *
 *   BASE=http://10.0.0.253:3588 npx tsx scripts/verify-hero.mts
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://10.0.0.253:3399';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

interface Case {
    label: string;
    width: number;
    height: number;
    /** A finger, rather than a wheel. */
    touch: boolean;
}

const CASES: Case[] = [
    { label: 'phone portrait   (390x844)', width: 390, height: 844, touch: true },
    // The one that was broken: wide enough for the desktop layout, but there is
    // no wheel on a phone.
    { label: 'phone landscape  (844x390)', width: 844, height: 390, touch: true },
    { label: 'tablet portrait  (820x1180)', width: 820, height: 1180, touch: true },
    { label: 'tablet landscape (1180x820)', width: 1180, height: 820, touch: true },
    { label: 'desktop          (1280x900)', width: 1280, height: 900, touch: false },
];

/** Dispatched as a string: the test runner's transform injects helpers into a
 *  function argument that the page does not have. */
const WATCH = `(() => {
    window.__hero = [];
    window.addEventListener('hero-collapsing', () => window.__hero.push('collapsing'));
    window.addEventListener('hero-expanded', () => window.__hero.push('expanded'));
})()`;

const swipeDown = (cx: number, height: number) => `(() => {
    const start = ${height * 0.3};
    const mk = (y) => [new Touch({ identifier: 1, target: document.body, clientX: ${cx}, clientY: y })];
    document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: mk(start), changedTouches: mk(start) }));
    for (let i = 1; i <= 10; i++) {
        const y = start + i * 12;
        document.body.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: mk(y), changedTouches: mk(y) }));
    }
    document.body.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: mk(start + 120) }));
})()`;

const swipeUp = (cx: number, height: number) => `(() => {
    const start = ${height * 0.7};
    const mk = (y) => [new Touch({ identifier: 1, target: document.body, clientX: ${cx}, clientY: y })];
    document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: mk(start), changedTouches: mk(start) }));
    for (let i = 1; i <= 10; i++) {
        const y = start - i * 12;
        document.body.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: mk(y), changedTouches: mk(y) }));
    }
    document.body.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: mk(start - 120) }));
})()`;

const browser = await chromium.launch();

for (const c of CASES) {
    const context = await browser.newContext({
        viewport: { width: c.width, height: c.height },
        hasTouch: c.touch,
        isMobile: c.touch,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const placeholder = (await page.textContent('body'))?.includes('[Add hero photos in admin]');
    if (placeholder) {
        check(`${c.label} has hero photos to animate`, false,
            'the server has no hero images configured — configure one before trusting this run');
        await context.close();
        continue;
    }

    await page.evaluate(WATCH);

    const cx = Math.round(c.width / 2);
    if (c.touch) {
        await page.evaluate(swipeUp(cx, c.height));
    } else {
        await page.mouse.move(cx, Math.round(c.height / 2));
        await page.mouse.wheel(0, 120);
    }

    // The animation runs for ~900ms with the page deliberately pinned, then the
    // scroll room is reclaimed in one jump. Sampling across that window tells
    // the two outcomes apart: an animation holds still and then moves; a snap
    // has already moved by the first sample.
    const samples: number[] = [];
    for (let i = 0; i < 12; i++) {
        samples.push(await page.evaluate('Math.round(window.scrollY)') as number);
        await page.waitForTimeout(100);
    }
    const events = await page.evaluate('window.__hero') as string[];

    check(`${c.label} starts the collapse`, events.includes('collapsing'),
        events.length ? events.join(', ') : 'no hero event fired — nothing is listening for this input');
    check(`${c.label} holds the page still while it animates`, samples[0] === 0,
        `first sample ${samples[0]}px — a jump means the scroll was never intercepted`);
    check(`${c.label} lands past the hero when it finishes`, samples.at(-1)! > 0,
        `ended at ${samples.at(-1)}px`);

    // And back: scrolling up at the boundary reopens the hero. The same branch,
    // the other direction — it was written at the same time as the collapse and
    // deserves the same proof.
    if (c.touch) {
        await page.evaluate(swipeDown(cx, c.height));
    } else {
        await page.mouse.wheel(0, -120);
    }
    await page.waitForTimeout(1400);
    const back = await page.evaluate('window.__hero') as string[];
    check(`${c.label} reopens when scrolled back up`, back.includes('expanded'),
        back.join(', ') || 'no event');
    check(`${c.label} returns to the top of the page`,
        (await page.evaluate('Math.round(window.scrollY)') as number) === 0,
        `at ${await page.evaluate('Math.round(window.scrollY)')}px`);

    await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL HERO CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
