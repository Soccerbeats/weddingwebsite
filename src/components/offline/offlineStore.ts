'use client';

import { updateNeeded, type WarmRecord } from '@/lib/offline';

/**
 * The offline warm-up, as a tiny store any component can read.
 *
 * One pass at a time for the whole page: the admin sidebar shows its progress
 * and has the button that starts it, and the app shell starts it on its own in
 * the installed app. The pass saves the build's code and every page through the
 * worker, then opens each page once in a hidden frame so the data and photos it
 * loads are saved exactly as it uses them. The worker refuses every write from
 * that frame, so the pass only reads.
 *
 * It also carries the outbox's state — edits made offline that the worker is
 * holding until it can send them — so the offline bar can say so.
 */

export type WarmPhase = 'idle' | 'saving' | 'done' | 'failed';

/** An edit the server refused when the outbox sent it. */
export interface FailedWrite {
    seq: number;
    method: string;
    url: string;
    status: number;
    error: string;
    at: number;
}

export interface OfflineState {
    phase: WarmPhase;
    done: number;
    total: number;
    /** The last completed save. */
    record: WarmRecord | null;
    /** Admin pages were part of it (a signed-in save). */
    admin: boolean;
    /** Edits made offline, still waiting to be sent. */
    pending: number;
    /** The server answered the outbox with "sign in first". */
    needsLogin: boolean;
    /** Edits the server refused; shown until dismissed. */
    failed: FailedWrite[];
}

const KEY = 'site-offline-saved';
/** How long one page gets in the hidden frame to load its data and photos. */
const PAGE_SETTLE_MS = 2500;
const PAGE_MAX_MS = 15000;

function readRecord(): (WarmRecord & { admin?: boolean }) | null {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

let state: OfflineState = {
    phase: 'idle', done: 0, total: 0, record: null, admin: false, pending: 0, needsLogin: false, failed: [],
};
const listeners = new Set<() => void>();
let hydrated = false;

function set(next: Partial<OfflineState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

/** Window events the honeymoon portal (and anything else) can refresh on. */
export const SYNCED_EVENT = 'site-offline:synced';
export const REFRESHED_EVENT = 'site-offline:refreshed';

interface OutboxMessage {
    type: 'site-sw:outbox';
    pending: number;
    needsLogin: boolean;
    failed: FailedWrite[];
    sent?: number;
}

function onWorkerMessage(event: MessageEvent) {
    const data = event.data as OutboxMessage | undefined;
    if (data?.type !== 'site-sw:outbox') return;
    set({ pending: data.pending, needsLogin: data.needsLogin, failed: data.failed ?? [] });
    if (data.sent) window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { sent: data.sent } }));
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    if (!hydrated && typeof window !== 'undefined') {
        hydrated = true;
        const record = readRecord();
        state = { ...state, record, admin: !!record?.admin };
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', onWorkerMessage);
            navigator.serviceWorker.startMessages?.();
            void controller().then((worker) => worker?.postMessage({ type: 'site-sw:outbox-status' }));
        }
    }
    return () => { listeners.delete(listener); };
}

export function getState() { return state; }
const SERVER_STATE: OfflineState = {
    phase: 'idle', done: 0, total: 0, record: null, admin: false, pending: 0, needsLogin: false, failed: [],
};
export function getServerState() { return SERVER_STATE; }

/** True inside the hidden warm-up frame (or any frame): never warm from there. */
export function inFrame(): boolean {
    try { return window.self !== window.top; } catch { return true; }
}

export function isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface Manifest { buildId: string; data: string; admin: boolean; pages: string[]; assets: string[] }

async function controller(): Promise<ServiceWorker | null> {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.active;
}

function precacheThroughWorker(worker: ServiceWorker, manifest: Manifest): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(done, 180_000);
        function onMessage(event: MessageEvent) {
            if (event.data?.type === 'site-sw:precache-progress') {
                set({ done: Math.min(event.data.saved, state.total), total: state.total });
            }
            if (event.data?.type === 'site-sw:precache-done') done();
        }
        function done() {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
        }
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'site-sw:precache', pages: manifest.pages, assets: manifest.assets });
    });
}

/** Re-ask for everything already saved; resolves when the worker is done. */
function refreshThroughWorker(worker: ServiceWorker): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(done, 120_000);
        function onMessage(event: MessageEvent) {
            if (event.data?.type === 'site-sw:refresh-done') done();
        }
        function done() {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
        }
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'site-sw:refresh' });
    });
}

/**
 * Ask for every photo on a page, not just the ones a reader would scroll to.
 *
 * Photos load lazily — only as they near the screen — and the hidden frame is
 * never on screen, so the gallery's lower rows were never saved. Fetching each
 * one from inside the frame goes through the worker exactly as the image would
 * (same address, same frame), so it is saved under the key the page will ask
 * for offline. The worker leaves out the photo library's own page, so only
 * photos the site actually shows are kept. Other sites' pictures on the page (a
 * hotel's photo) are kept too, in their own capped cache.
 */
async function loadEveryImage(frame: HTMLIFrameElement): Promise<void> {
    try {
        const win = frame.contentWindow;
        const doc = frame.contentDocument;
        if (!win || !doc) return;
        const urls = new Set<string>();
        for (const img of Array.from(doc.images)) {
            const src = img.currentSrc || img.src;
            if (src && /^https?:/.test(src)) urls.add(src);
        }
        // Another site's picture is loaded as a picture (a fetch would be refused
        // by that site); the worker keeps it all the same.
        const fetches = [...urls].map((url) => (new URL(url).origin === location.origin
            ? win.fetch(url).then((res) => res.blob()).catch(() => undefined)
            : new Promise<void>((resolve) => {
                const probe = new (win as Window & typeof globalThis).Image();
                probe.onload = () => resolve();
                probe.onerror = () => resolve();
                probe.src = url;
            })));
        await Promise.race([Promise.all(fetches), new Promise((resolve) => setTimeout(resolve, 10_000))]);
    } catch {
        /* the frame went away: nothing more to save from it */
    }
}

/** Open a page once in a hidden frame, so everything it loads is saved. */
function visit(path: string): Promise<void> {
    return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.title = 'Saving for offline';
        // Same size as this window, so the page loads what it would load here.
        Object.assign(frame.style, {
            position: 'fixed', left: '-20000px', top: '0', width: `${window.innerWidth}px`,
            height: `${window.innerHeight}px`, border: '0', opacity: '0', pointerEvents: 'none',
        });
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            frame.remove();
            resolve();
        };
        const cap = setTimeout(finish, PAGE_MAX_MS);
        frame.addEventListener('load', () => setTimeout(async () => {
            await loadEveryImage(frame);
            clearTimeout(cap);
            finish();
        }, PAGE_SETTLE_MS));
        frame.src = path;
        document.body.appendChild(frame);
    });
}

let running: Promise<void> | null = null;

/**
 * Save the whole site for offline use.
 *
 * `onlyIfStale` is the automatic path: it asks the server what has changed
 * (`updateNeeded`) and does only that — nothing when the saved copy is current,
 * a quick refresh of what is saved plus one pass over the pages when only the
 * data moved, everything when the site itself is a new release. The button in
 * the admin sidebar always saves everything.
 */
export function saveForOffline({ onlyIfStale = false } = {}): Promise<void> {
    if (running) return running;
    if (typeof window === 'undefined' || inFrame() || !navigator.onLine) return Promise.resolve();
    running = (async () => {
        let worker: ServiceWorker | null = null;
        let passStarted = false;
        try {
            const res = await fetch('/api/offline/manifest', { cache: 'no-store' });
            if (!res.ok) throw new Error('manifest');
            const manifest: Manifest = await res.json();
            const need = onlyIfStale ? updateNeeded(readRecord(), manifest, Date.now()) : 'full';
            if (!need) return;

            worker = await controller();
            if (!worker) throw new Error('no worker');
            let done: number;
            let total: number;
            if (need === 'full') {
                total = manifest.assets.length + manifest.pages.length * 2;
                set({ phase: 'saving', done: 0, total });
                await precacheThroughWorker(worker, manifest);
                done = manifest.assets.length + manifest.pages.length;
            } else {
                total = manifest.pages.length + 1;
                set({ phase: 'saving', done: 0, total });
                await refreshThroughWorker(worker);
                done = 1;
                // The data is current now; open pages can show it straight away.
                window.dispatchEvent(new CustomEvent(REFRESHED_EVENT));
            }
            set({ done });

            worker.postMessage({ type: 'site-sw:pass-start' });
            passStarted = true;
            for (const page of manifest.pages) {
                if (!navigator.onLine) throw new Error('went offline');
                await visit(page);
                done += 1;
                set({ done });
            }
            worker.postMessage({ type: 'site-sw:pass-end', complete: true });
            passStarted = false;

            const saved = { at: Date.now(), buildId: manifest.buildId, data: manifest.data, admin: manifest.admin };
            try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* the save still happened */ }
            set({ phase: 'done', record: saved, admin: manifest.admin, done: total });
            window.dispatchEvent(new CustomEvent(REFRESHED_EVENT));
        } catch {
            if (passStarted) worker?.postMessage({ type: 'site-sw:pass-end', complete: false });
            set({ phase: 'failed' });
        } finally {
            running = null;
        }
    })();
    return running;
}

/**
 * Send the outbox now, and resolve once the worker has reported back (or
 * after a while — a hung request must not hold up the update check behind it).
 */
export async function syncOutbox(): Promise<void> {
    if (typeof window === 'undefined' || inFrame() || !('serviceWorker' in navigator)) return;
    const worker = await Promise.race([
        controller(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!worker) return;
    await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 30_000);
        function onMessage(event: MessageEvent) {
            if (event.data?.type === 'site-sw:outbox') done();
        }
        function done() {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
        }
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'site-sw:flush' });
    });
}

/** Stop showing the edits the server refused. */
export async function dismissFailed(): Promise<void> {
    set({ failed: [] });
    (await controller())?.postMessage({ type: 'site-sw:dismiss-failed' });
}

let lastCheck = 0;

/**
 * What the installed app does whenever it opens or comes back: send anything
 * edited offline, then ask the server whether anything changed and bring the
 * saved copy up to date. In an ordinary browser tab only the sending happens —
 * a guest's phone should not download the whole site because they opened the
 * RSVP page.
 */
export async function checkForUpdates({ force = false } = {}): Promise<void> {
    if (typeof window === 'undefined' || inFrame()) return;
    const now = Date.now();
    if (!force && now - lastCheck < 30_000) return;
    lastCheck = now;
    await syncOutbox();
    if (isStandalone()) await saveForOffline({ onlyIfStale: true });
}

/** Forget everything saved on this device — on logout. */
export async function clearOffline(): Promise<void> {
    try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
    set({ phase: 'idle', record: null, admin: false, done: 0, total: 0 });
    // The outbox is not cleared: edits not yet sent are sent after the next sign-in.
    try {
        const worker = await Promise.race([
            controller(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        worker?.postMessage({ type: 'site-sw:clear' });
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.filter((n) => n.startsWith('site-') || n.startsWith('honeymoon-')).map((n) => caches.delete(n)));
        }
    } catch { /* no worker, nothing saved */ }
}
