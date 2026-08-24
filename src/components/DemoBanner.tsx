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

    return (
        <div
            role="status"
            className="sticky top-0 z-[100] bg-slate-900 text-white text-center text-xs
                sm:text-sm px-3 py-1.5"
        >
            <span aria-hidden>🎭</span> {notice}
        </div>
    );
}
