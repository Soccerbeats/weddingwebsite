import { NextResponse } from 'next/server';
import {
    callWebhook, compareVersions, currentVersion, describeWebhook,
    getWebhook, updateRepo, upstreamState,
} from '@/lib/updates';

/**
 * Whether a newer version exists, and the button that installs it.
 *
 * Network-only in the offline worker (`routeFor` in public/sw.js) — "am I up
 * to date" answered from a saved copy would be a lie — and its writes are in
 * NOT_QUEUED: an update pressed offline has nothing to retry later.
 */
export async function GET(request: Request) {
    try {
        const force = new URL(request.url).searchParams.has('refresh');
        const [upstream, webhook] = await Promise.all([upstreamState(force), getWebhook().catch(() => null)]);
        const current = currentVersion();
        const newer = Boolean(current && upstream.latest && compareVersions(upstream.latest, current) > 0);
        return NextResponse.json({
            success: true,
            current,
            latest: upstream.latest,
            available: newer && upstream.imageReady,
            building: newer && !upstream.imageReady,
            checkedAt: upstream.checkedAt,
            error: upstream.error,
            repo: updateRepo(),
            webhook: describeWebhook(webhook),
        });
    } catch (error) {
        console.error('Update check failed:', error);
        return NextResponse.json({ error: 'Update check failed' }, { status: 500 });
    }
}

/** Ask Portainer to pull the new image and recreate this stack. */
export async function POST() {
    try {
        const webhook = await getWebhook();
        if (!webhook) {
            return NextResponse.json({ error: 'No Portainer webhook is set. Add one under Settings → Updates.' }, { status: 400 });
        }
        const result = await callWebhook(webhook);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
        return NextResponse.json({ success: true, from: currentVersion() });
    } catch (error) {
        console.error('Update trigger failed:', error);
        return NextResponse.json({ error: 'Could not start the update' }, { status: 500 });
    }
}
