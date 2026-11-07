import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import pool from './db';
import { parseChangelog } from './changelog';
import { safeFetch } from './safeFetch';

/**
 * "Is there a newer version, and can I install it?" — for anyone running a copy
 * of this site, not only us. Server only.
 *
 * - **This version** is the topmost heading of the `CHANGELOG.md` baked into
 *   the image, the same place the version button reads.
 * - **The newest version** is the topmost heading of `CHANGELOG.md` on the
 *   repository's `main`, and it only counts once the registry holds an image
 *   tagged with it: CI pushes the changelog minutes before the image exists, and
 *   offering an update in that window would redeploy the old image.
 * - **Installing** is a Portainer webhook the admin pastes into Settings. The
 *   site cannot replace its own container, so something outside it has to pull
 *   and restart; a webhook can do exactly that and nothing else, unlike the
 *   Docker socket, which would hand the whole server to anyone who got into the
 *   admin panel.
 */

/** `owner/name` on GitHub. A fork that publishes its own image sets this. */
export function updateRepo(): string {
    const repo = (process.env.UPDATE_REPO || '').trim();
    return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : 'Soccerbeats/weddingwebsite';
}

/** CI publishes `ghcr.io/<owner>/<name>`, lower-cased as the registry requires. */
function imagePath(repo: string): string {
    return repo.toLowerCase();
}

export function currentVersion(): string | null {
    try {
        const file = path.join(process.cwd(), 'CHANGELOG.md');
        return parseChangelog(fs.readFileSync(file, 'utf8'))[0]?.version ?? null;
    } catch {
        return null;
    }
}

/** -1, 0 or 1, comparing `vX.Y.Z` numerically (`v0.10.2` < `v0.10.10`). */
export function compareVersions(a: string, b: string): number {
    const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i += 1) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
    }
    return 0;
}

export interface UpstreamState {
    /** The newest version on `main`, or null when GitHub could not be asked. */
    latest: string | null;
    /** Whether the registry holds an image tagged with `latest` yet. */
    imageReady: boolean;
    checkedAt: string;
    error: string | null;
}

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** A failed check is retried sooner, but not on every page load. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
let cached: { at: number; state: UpstreamState } | null = null;
let inFlight: Promise<UpstreamState> | null = null;

async function imageTagExists(repo: string, tag: string): Promise<boolean> {
    const image = imagePath(repo);
    const tokenRes = await safeFetch(
        `https://ghcr.io/token?scope=repository:${image}:pull`,
        { timeoutMs: 8000 },
    );
    if (!tokenRes.ok) return false;
    const { token } = (await tokenRes.json()) as { token?: string };
    if (!token) return false;
    const res = await safeFetch(`https://ghcr.io/v2/${image}/manifests/${tag}`, {
        timeoutMs: 8000,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: [
                'application/vnd.oci.image.index.v1+json',
                'application/vnd.docker.distribution.manifest.list.v2+json',
                'application/vnd.oci.image.manifest.v1+json',
                'application/vnd.docker.distribution.manifest.v2+json',
            ].join(', '),
        },
    });
    return res.ok;
}

async function askUpstream(): Promise<UpstreamState> {
    const repo = updateRepo();
    const checkedAt = new Date().toISOString();
    try {
        const res = await safeFetch(`https://raw.githubusercontent.com/${repo}/main/CHANGELOG.md`, { timeoutMs: 8000 });
        if (!res.ok) return { latest: null, imageReady: false, checkedAt, error: `GitHub answered ${res.status}` };
        const latest = parseChangelog(await res.text())[0]?.version ?? null;
        if (!latest) return { latest: null, imageReady: false, checkedAt, error: 'No version found upstream' };
        const imageReady = await imageTagExists(repo, latest).catch(() => false);
        return { latest, imageReady, checkedAt, error: null };
    } catch {
        return { latest: null, imageReady: false, checkedAt, error: 'Could not reach GitHub' };
    }
}

/** The upstream state, from memory unless it is stale or `force` is set. */
export async function upstreamState(force = false): Promise<UpstreamState> {
    if (!force && cached) {
        const age = Date.now() - cached.at;
        if (age < (cached.state.error ? RETRY_AFTER_MS : CHECK_EVERY_MS)) return cached.state;
    }
    inFlight ??= askUpstream().then((state) => {
        cached = { at: Date.now(), state };
        return state;
    }).finally(() => { inFlight = null; });
    return inFlight;
}

/* ───────────────────────────── the webhook ───────────────────────────── */

const WEBHOOK_KEY = 'update_webhook_url';

/**
 * A Portainer webhook, or null when this is not one.
 *
 * Only the two shapes Portainer issues are accepted — a stack's
 * (`/api/stacks/webhooks/<id>`) and a service's (`/api/webhooks/<id>`). The URL
 * usually points at a private address (Portainer on the LAN), so it cannot go
 * through `safeFetch`; holding it to Portainer's own paths is what stops the
 * setting from being a way to make the server POST anywhere it can reach.
 */
export function normaliseWebhook(raw: string): string | null {
    let url: URL;
    try { url = new URL(raw.trim()); } catch { return null; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    if (!/^\/api\/(stacks\/)?webhooks\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) return null;
    url.hash = '';
    return url.toString();
}

export async function getWebhook(): Promise<string | null> {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [WEBHOOK_KEY]);
    return rows[0]?.value ?? null;
}

export async function setWebhook(url: string | null): Promise<void> {
    if (url == null) {
        await pool.query('DELETE FROM app_settings WHERE key = $1', [WEBHOOK_KEY]);
        return;
    }
    await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [WEBHOOK_KEY, url],
    );
}

/** What the browser may see of the webhook: that it is set, and where. Never the token. */
export function describeWebhook(url: string | null): { set: boolean; host: string | null } {
    if (!url) return { set: false, host: null };
    try { return { set: true, host: new URL(url).host }; } catch { return { set: true, host: null }; }
}

export type WebhookResult =
    | { ok: true; status: number | null }
    | { ok: false; status: number | null; error: string };

/**
 * POST the webhook.
 *
 * Self-signed certificates are accepted: Portainer ships with one on :9443, and
 * refusing it would make the feature fail for nearly everyone. What that risks
 * is someone on the network path learning a token that can only redeploy this
 * stack. A timeout counts as started — Portainer may hold the request open
 * while it pulls, and the restart it causes ends this process anyway.
 */
export function callWebhook(url: string): Promise<WebhookResult> {
    return new Promise((resolve) => {
        const target = new URL(url);
        const lib = target.protocol === 'https:' ? https : http;
        const req = lib.request(target, {
            method: 'POST',
            timeout: 15_000,
            rejectUnauthorized: false,
            headers: { 'Content-Length': '0' },
        }, (res) => {
            res.resume();
            const status = res.statusCode ?? null;
            if (status != null && status >= 200 && status < 300) resolve({ ok: true, status });
            else if (status === 404) resolve({ ok: false, status, error: 'Portainer does not know this webhook. Copy it again from the stack page.' });
            else resolve({ ok: false, status, error: `Portainer answered ${status}.` });
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: true, status: null }); });
        req.on('error', (error) => resolve({ ok: false, status: null, error: `Could not reach Portainer (${error.message}).` }));
        req.end();
    });
}
