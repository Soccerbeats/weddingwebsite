'use client';

import { isWarmStale, type WarmRecord } from '@/lib/offline';

/**
 * The offline warm-up, as a tiny store any component can read.
 *
 * One pass at a time for the whole page: the admin sidebar shows its progress
 * and has the button that starts it, and the app shell starts it on its own in
 * the installed app. The pass saves the build's code and every page through the
 * worker, then opens each page once in a hidden frame so the data and photos it
 * loads are saved exactly as it uses them. The worker refuses every write from
 * that frame, so the pass only reads.
 */

export type WarmPhase = 'idle' | 'saving' | 'done' | 'failed';

export interface OfflineState {
    phase: WarmPhase;
    done: number;
    total: number;
    /** The last completed save. */
    record: WarmRecord | null;
    /** Admin pages were part of it (a signed-in save). */
    admin: boolean;
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

let state: OfflineState = { phase: 'idle', done: 0, total: 0, record: null, admin: false };
const listeners = new Set<() => void>();
let hydrated = false;

function set(next: Partial<OfflineState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    if (!hydrated && typeof window !== 'undefined') {
        hydrated = true;
        const record = readRecord();
        state = { ...state, record, admin: !!record?.admin };
    }
    return () => { listeners.delete(listener); };
}

export function getState() { return state; }
const SERVER_STATE: OfflineState = { phase: 'idle', done: 0, total: 0, record: null, admin: false };
export function getServerState() { return SERVER_STATE; }

/** True inside the hidden warm-up frame (or any frame): never warm from there. */
export function inFrame(): boolean {
    try { return window.self !== window.top; } catch { return true; }
}

export function isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface Manifest { buildId: string; admin: boolean; pages: string[]; assets: string[] }

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
        frame.addEventListener('load', () => setTimeout(() => { clearTimeout(cap); finish(); }, PAGE_SETTLE_MS));
        frame.src = path;
        document.body.appendChild(frame);
    });
}

let running: Promise<void> | null = null;

/**
 * Save the whole site for offline use.
 *
 * `onlyIfStale` is the automatic path: it does nothing when the saved copy is
 * from this build and under twelve hours old.
 */
export function saveForOffline({ onlyIfStale = false } = {}): Promise<void> {
    if (running) return running;
    if (typeof window === 'undefined' || inFrame() || !navigator.onLine) return Promise.resolve();
    running = (async () => {
        try {
            const res = await fetch('/api/offline/manifest', { cache: 'no-store' });
            if (!res.ok) throw new Error('manifest');
            const manifest: Manifest = await res.json();
            const record = readRecord();
            // A save made signed-out does not cover the admin pages, so signing
            // in makes it stale even inside the twelve hours.
            const coversAdmin = !manifest.admin || !!record?.admin;
            if (onlyIfStale && coversAdmin && !isWarmStale(record, manifest.buildId, Date.now())) return;

            const worker = await controller();
            if (!worker) throw new Error('no worker');
            const total = manifest.assets.length + manifest.pages.length * 2;
            set({ phase: 'saving', done: 0, total });
            await precacheThroughWorker(worker, manifest);

            let done = manifest.assets.length + manifest.pages.length;
            set({ done });
            for (const page of manifest.pages) {
                if (!navigator.onLine) throw new Error('went offline');
                await visit(page);
                done += 1;
                set({ done });
            }

            const saved = { at: Date.now(), buildId: manifest.buildId, admin: manifest.admin };
            try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* the save still happened */ }
            set({ phase: 'done', record: saved, admin: manifest.admin, done: total });
        } catch {
            set({ phase: 'failed' });
        } finally {
            running = null;
        }
    })();
    return running;
}

/** Forget everything saved on this device — on logout. */
export async function clearOffline(): Promise<void> {
    try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
    set({ phase: 'idle', record: null, admin: false, done: 0, total: 0 });
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
