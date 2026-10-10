import { NextResponse } from 'next/server';

/**
 * A write sent twice is applied once.
 *
 * The offline outbox (`public/sw.js`) sends every edit with an `X-Outbox-Key`.
 * On a bad connection a save can reach the server and lose its answer on the way
 * back; the phone, hearing nothing, sends it again. For an edit or a delete that
 * is harmless, but for something new it would make two. So a route that creates
 * rows wraps its handler in `once`: the first answer for a key is kept for a day
 * and a repeat gets that answer back without running the handler again.
 *
 * In memory, because the window that matters is minutes (a resend after a lost
 * answer), the app is one process, and a restart in between only means the rare
 * duplicate this would have caught.
 */

interface Kept { at: number; status: number; body: string }

const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_KEYS = 5000;
const answers = new Map<string, Kept>();
const running = new Map<string, Promise<Kept | null>>();

function forgetOld(now: number) {
    for (const [key, kept] of answers) {
        if (now - kept.at < KEEP_MS && answers.size <= MAX_KEYS) break;
        answers.delete(key);
    }
}

const replay = (kept: Kept) => new NextResponse(kept.body, {
    status: kept.status,
    headers: { 'Content-Type': 'application/json', 'X-Outbox-Replayed': '1' },
});

export async function once(request: Request, handler: () => Promise<Response>): Promise<Response> {
    const key = request.headers.get('x-outbox-key');
    if (!key || key.length > 100) return handler();

    const kept = answers.get(key);
    if (kept) return replay(kept);
    // The same key twice at once (two copies of the worker): the second waits
    // for the first and gets its answer.
    const inFlight = running.get(key);
    if (inFlight) {
        const first = await inFlight;
        if (first) return replay(first);
        return handler();
    }

    let response: Response | null = null;
    const work = (async (): Promise<Kept | null> => {
        response = await handler();
        if (!response.ok) return null;
        const result = { at: Date.now(), status: response.status, body: await response.clone().text() };
        forgetOld(result.at);
        answers.set(key, result);
        return result;
    })();
    running.set(key, work);
    try {
        await work;
    } finally {
        running.delete(key);
    }
    return response as unknown as Response;
}

/** A route's POST handler, made safe to receive twice: `export const POST = replayable(create)`. */
export function replayable<R extends Request, A extends unknown[]>(
    handler: (request: R, ...rest: A) => Promise<Response>,
): (request: R, ...rest: A) => Promise<Response> {
    return (request, ...rest) => once(request, () => handler(request, ...rest));
}
