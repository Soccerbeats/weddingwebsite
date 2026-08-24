import { demoStatus } from '@/lib/demo';

/**
 * Says "this is the demo" on every page, public and admin.
 *
 * A server component, and safe as one only because the root layout is
 * `force-dynamic` — it re-reads the site config per request, so this re-reads
 * the flag per request too. In a statically pre-rendered layout the answer
 * would be baked in at build time, when `DEMO_MODE` is not set, and the banner
 * would never appear on the instance that needs it. (`/api/demo-status` exists
 * for client code that needs the same answer.)
 *
 * Renders nothing at all on a normal instance — no layout shift, no reserved
 * space, and no class of bug where a real wedding site warns guests that
 * nothing they do is saved.
 */
export default function DemoBanner() {
    const { demo, notice } = demoStatus();
    if (!demo) return null;

    /*
     * Exactly `--demo-banner-h` tall, and in the normal flow.
     *
     * In flow, so the page below it starts lower rather than being covered. It
     * is the fixed things that need telling: the nav bar sets its own `top` in
     * JS and the admin shell is a fixed box, and both read the same variable —
     * so the banner's height is stated once, in the layout, and everything that
     * has to make room for it agrees. Sticky, so it stays legible as you scroll
     * rather than being a thing you saw once at the top of the page.
     */
    return (
        <div
            role="status"
            className="sticky top-0 z-[100] h-[var(--demo-banner-h)] flex items-center
                justify-center gap-1.5 bg-slate-900 text-white text-center text-[11px]
                sm:text-xs px-3 leading-none"
        >
            <span aria-hidden>🎭</span>
            <span className="truncate">{notice}</span>
        </div>
    );
}
