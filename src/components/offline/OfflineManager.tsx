'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { describeWrite } from './outbox';
import { checkForUpdates, dismissFailed, getServerState, getState, inFrame, subscribe } from './offlineStore';

/** "today 14:02", "yesterday 09:15", "Mon 5 Oct". */
export function savedLabel(at: number, now = Date.now()): string {
    const date = new Date(at);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    if (at >= startOfToday.getTime()) return `today ${time}`;
    if (at >= startOfToday.getTime() - 86_400_000) return `yesterday ${time}`;
    return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function useOfflineState() {
    return useSyncExternalStore(subscribe, getState, getServerState);
}

/**
 * Online, as far as this page can tell: the browser's own flag, corrected by
 * the worker, which says so whenever it had to answer from the saved copy —
 * the browser's flag stays "online" on a page opened offline, and on a weak or
 * captive signal.
 */
function useOnline(): boolean {
    const [browserOnline, setBrowserOnline] = useState(true);
    const [workerOffline, setWorkerOffline] = useState(false);
    useEffect(() => {
        // The hidden save-pass frames draw no bar, so they need not ask.
        if (inFrame()) return;
        const apply = () => setBrowserOnline(navigator.onLine);
        apply();
        window.addEventListener('online', apply);
        window.addEventListener('offline', apply);
        const onMessage = (event: MessageEvent) => {
            if (event.data?.type === 'site-sw:offline') setWorkerOffline(true);
        };
        navigator.serviceWorker?.addEventListener('message', onMessage);
        navigator.serviceWorker?.startMessages?.();
        // Ask the server directly: the worker never answers this from the saved
        // copy, so silence means offline. While offline, keep asking, so a
        // returning signal clears the bar without waiting for a page load.
        let stopped = false;
        let current: AbortController | null = null;
        let retry: ReturnType<typeof setTimeout> | null = null;
        const ping = () => {
            current = new AbortController();
            const cap = setTimeout(() => current?.abort(), 5000);
            fetch('/api/offline/ping', { cache: 'no-store', signal: current.signal })
                // Read the body, or the request stays open and holds a connection.
                .then(async (res) => { await res.text().catch(() => ''); return res.ok; })
                .catch(() => false)
                .then((reached) => {
                    clearTimeout(cap);
                    if (stopped) return;
                    setWorkerOffline(!reached);
                    if (!reached) retry = setTimeout(ping, 15000);
                });
        };
        ping();
        const recheck = () => { if (retry) clearTimeout(retry); ping(); };
        window.addEventListener('online', recheck);
        return () => {
            stopped = true;
            current?.abort();
            if (retry) clearTimeout(retry);
            window.removeEventListener('online', recheck);
            window.removeEventListener('online', apply);
            window.removeEventListener('offline', apply);
            navigator.serviceWorker?.removeEventListener('message', onMessage);
        };
    }, []);
    return browserOnline && !workerOffline;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The site, offline: registered on every page from the app shell.
 *
 * Registers the site-wide worker and says so when there is no connection.
 * Whenever the page opens, comes back to the foreground or gets its
 * connection back, it sends any edits made offline and — in the installed app —
 * asks the server whether anything changed, refreshing the saved copy if so.
 * In an ordinary browser tab it only saves what you visit.
 */
export default function OfflineManager() {
    const online = useOnline();
    const offline = useOfflineState();
    const [showFailed, setShowFailed] = useState(false);
    const wasOnline = useRef(online);

    useEffect(() => {
        if (inFrame() || !('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
        // After the page has settled, so the first paint never waits on it.
        const timer = setTimeout(() => { void checkForUpdates({ force: true }); }, 2500);
        const onOnline = () => { void checkForUpdates({ force: true }); };
        // Opening the installed app again from the home screen resumes it
        // rather than loading it, so "opened" is also "became visible".
        const onVisible = () => { if (document.visibilityState === 'visible') void checkForUpdates(); };
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('online', onOnline);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    // The server answered again after a spell without it: send and refresh.
    useEffect(() => {
        if (online && !wasOnline.current && !inFrame()) void checkForUpdates({ force: true });
        wasOnline.current = online;
    }, [online]);

    if (inFrame()) return null;
    const waiting = offline.pending > 0;
    const failed = offline.failed.length > 0;
    if (online && !waiting && !failed) return null;

    let message: React.ReactNode;
    if (!online) {
        message = (
            <>
                Offline
                {offline.record ? ` · showing the copy saved ${savedLabel(offline.record.at)}` : ' · showing what this device has saved'}
                {waiting && ` · ${plural(offline.pending, 'change', 'changes')} saved on this phone, sent when you're back online`}
            </>
        );
    } else if (waiting && offline.needsLogin) {
        message = (
            <>
                {plural(offline.pending, 'change is', 'changes are')} waiting to be sent ·{' '}
                <Link href="/admin/login" className="underline underline-offset-2">Sign in to send</Link>
            </>
        );
    } else if (waiting) {
        message = <>Sending {plural(offline.pending, 'change', 'changes')} made offline…</>;
    }

    return (
        <div
            role="status"
            data-offline-banner
            data-pending={offline.pending}
            className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-4"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
            {message && (
                <p className="pointer-events-auto max-w-md rounded-full bg-gray-900/90 px-4 py-1.5 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
                    {message}
                </p>
            )}
            {failed && (
                <div data-offline-failed className="pointer-events-auto max-w-md rounded-2xl bg-red-700/95 px-4 py-2 text-xs text-white shadow-lg backdrop-blur">
                    <div className="flex items-center gap-3">
                        <span className="font-medium">
                            {plural(offline.failed.length, 'change made offline', 'changes made offline')} couldn&apos;t be saved
                        </span>
                        <button type="button" onClick={() => setShowFailed((v) => !v)} className="min-h-[44px] underline underline-offset-2">
                            {showFailed ? 'Hide' : 'Details'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowFailed(false); void dismissFailed(); }}
                            className="min-h-[44px] rounded-full bg-white/15 px-3"
                        >
                            Dismiss
                        </button>
                    </div>
                    {showFailed && (
                        <ul className="mt-1 space-y-1 pb-1">
                            {offline.failed.map((write) => (
                                <li key={write.seq}>
                                    {describeWrite(write.method, write.url)} — {write.error}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
