import { NextResponse } from 'next/server';
import { describeWebhook, normaliseWebhook, setWebhook } from '@/lib/updates';

/**
 * Save or clear the Portainer webhook. `{ url: '' }` clears it.
 *
 * The answer says only that it is set and on which host — the URL carries the
 * token, so once saved it never comes back to the browser.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const raw = typeof body?.url === 'string' ? body.url.trim() : '';
        if (!raw) {
            await setWebhook(null);
            return NextResponse.json({ success: true, webhook: describeWebhook(null) });
        }
        const url = normaliseWebhook(raw);
        if (!url) {
            return NextResponse.json(
                { error: 'That is not a Portainer webhook. It should look like https://portainer:9443/api/stacks/webhooks/…' },
                { status: 400 },
            );
        }
        await setWebhook(url);
        return NextResponse.json({ success: true, webhook: describeWebhook(url) });
    } catch (error) {
        console.error('Saving the update webhook failed:', error);
        return NextResponse.json({ error: 'Could not save the webhook' }, { status: 500 });
    }
}
