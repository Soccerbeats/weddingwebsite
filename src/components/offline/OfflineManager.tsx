'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getServerState, getState, inFrame, isStandalone, saveForOffline, subscribe } from './offlineStore';

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

/**
 * The site, offline: registered on every page from the app shell.
 *
 * Registers the site-wide worker, says so when there is no connection, and in
 * the installed app saves the whole site in the background whenever the saved
 * copy is missing, from an older version, or over twelve hours old. In an
 * ordinary browser tab it only saves what you visit — a guest's phone should
 * not download the whole site because they opened the RSVP page.
 */
export default function OfflineManager() {
    const online = useOnline();
    const offline = useOfflineState();

    useEffect(() => {
        if (inFrame() || !('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
        if (!isStandalone()) return;
        // After the page has settled, so the first paint never waits on it.
        const timer = setTimeout(() => { void saveForOffline({ onlyIfStale: true }); }, 4000);
        const onOnline = () => { void saveForOffline({ onlyIfStale: true }); };
        window.addEventListener('online', onOnline);
        return () => { clearTimeout(timer); window.removeEventListener('online', onOnline); };
    }, []);

    if (online || inFrame()) return null;
    return (
        <div
            role="status"
            data-offline-banner
            className="pointer-events-none fixed inset-x-0 z-[95] flex justify-center px-4"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
            <p className="pointer-events-auto rounded-full bg-gray-900/90 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
                Offline
                {offline.record ? ` · showing the copy saved ${savedLabel(offline.record.at)}` : ' · showing what this device has saved'}
            </p>
        </div>
    );
}
