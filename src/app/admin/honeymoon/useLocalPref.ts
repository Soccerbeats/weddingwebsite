'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A view preference, remembered in this browser.
 *
 * Which filters you left on, whether you like the dense list, which map layer —
 * all of it is about you and this browser, not about the trip, so none of it
 * belongs in the database (unlike the country focus, which is a decision about
 * the trip and lives on the trip row).
 *
 * Read through `useSyncExternalStore` rather than an effect: the server has no
 * localStorage, so the first paint must be the default and the stored value can
 * only arrive after hydration. React handles that properly here — it hydrates
 * against the server snapshot and re-renders once with the real one — and two
 * tabs stay in step for free.
 */
const listeners = new Set<() => void>();
/** Parsed values, so every render does not re-parse JSON out of localStorage. */
const cache = new Map<string, unknown>();

function subscribe(callback: () => void) {
    listeners.add(callback);
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(callback);
        if (typeof window !== 'undefined' && !listeners.size) {
            window.removeEventListener('storage', onStorage);
        }
    };
}

function onStorage(event: StorageEvent) {
    if (event.key) cache.delete(event.key);
    listeners.forEach((listener) => listener());
}

function read<T>(key: string, fallback: T): T {
    if (cache.has(key)) return cache.get(key) as T;
    try {
        const raw = localStorage.getItem(key);
        const value = raw == null ? fallback : JSON.parse(raw) as T;
        cache.set(key, value);
        return value;
    } catch {
        return fallback;
    }
}

export function useLocalPref<T>(key: string, fallback: T): [T, (next: T) => void] {
    const value = useSyncExternalStore(
        subscribe,
        () => read(key, fallback),
        () => fallback,
    );
    const set = useCallback((next: T) => {
        cache.set(key, next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private window */ }
        listeners.forEach((listener) => listener());
    }, [key]);
    return [value, set];
}
