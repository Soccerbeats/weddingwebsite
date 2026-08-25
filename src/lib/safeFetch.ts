import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Fetch a URL the admin typed, without letting the server be used as a proxy
 * into the LAN.
 *
 * `fetch-meta` and the honeymoon geocoder fetch arbitrary URLs from the box
 * that also hosts Portainer and the reverse proxy. Without these checks a
 * pasted `http://10.0.0.188:9000/...` would be fetched from inside the network
 * and its title handed back. Every hostname is resolved first and refused if
 * any address is loopback, link-local, private or otherwise not a public
 * internet address; redirects are followed by hand so each hop gets the same
 * check; and bodies are capped so a hostile page cannot exhaust memory.
 */

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

function isPrivateIPv4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number);
    return a === 10
        || a === 127
        || a === 0
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 100 && b >= 64 && b <= 127)
        || a >= 224;
}

function isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
}

export function isPublicAddress(ip: string): boolean {
    const version = isIP(ip);
    if (version === 4) return !isPrivateIPv4(ip);
    if (version === 6) return !isPrivateIPv6(ip);
    return false;
}

/** Throws when the URL is not http(s) or points at a non-public address. */
export async function assertPublicUrl(raw: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('That is not a valid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only http and https links can be fetched');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new Error('That address is not reachable from here');
    }
    const addresses = isIP(host)
        ? [{ address: host }]
        : await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
        throw new Error('That address is not reachable from here');
    }
    return url;
}

export interface SafeFetchResult {
    status: number;
    ok: boolean;
    /** The URL the response finally came from, after redirects. */
    url: string;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
}

/**
 * `fetch` with the address check on the first request and on every redirect.
 * The body is read up to MAX_BODY_BYTES and then cut off.
 */
export async function safeFetch(raw: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<SafeFetchResult> {
    const { timeoutMs = 10_000, ...rest } = init;
    let url = await assertPublicUrl(raw);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const res = await fetch(url, {
            ...rest,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (!location || hop === MAX_REDIRECTS) break;
            url = await assertPublicUrl(new URL(location, url).toString());
            continue;
        }
        const body = res.body;
        const readText = async () => {
            if (!body) return '';
            const reader = body.getReader();
            const chunks: Uint8Array[] = [];
            let total = 0;
            while (total < MAX_BODY_BYTES) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                total += value.byteLength;
            }
            reader.cancel().catch(() => undefined);
            return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
        };
        let cached: Promise<string> | null = null;
        const text = () => (cached ??= readText());
        return {
            status: res.status,
            ok: res.ok,
            url: url.toString(),
            text,
            json: async () => JSON.parse(await text()),
        };
    }
    throw new Error('Too many redirects');
}
