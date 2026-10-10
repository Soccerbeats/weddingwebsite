'use client';

import type { QueuedWrite } from '@/lib/honeymoonOffline';

/**
 * The worker's outbox, read from the page.
 *
 * The worker (`public/sw.js`) owns it — it adds every admin edit made with no
 * connection and sends them when it can. A page only reads it, so it can show
 * those edits as if they had landed (the honeymoon portal does; see
 * `honeymoonOffline.ts`). Same database, same stores as the worker's
 * `openOutbox`, so whichever opens it first creates it.
 */
export function readOutbox(): Promise<QueuedWrite[]> {
    if (typeof indexedDB === 'undefined') return Promise.resolve([]);
    return new Promise((resolve) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open('site-outbox', 1);
        } catch {
            resolve([]);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('writes')) db.createObjectStore('writes', { keyPath: 'seq', autoIncrement: true });
            if (!db.objectStoreNames.contains('ids')) db.createObjectStore('ids', { keyPath: 'temp' });
            if (!db.objectStoreNames.contains('failed')) db.createObjectStore('failed', { keyPath: 'seq' });
        };
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
            const db = request.result;
            try {
                const all = db.transaction('writes', 'readonly').objectStore('writes').getAll();
                all.onsuccess = () => { resolve(all.result as QueuedWrite[]); db.close(); };
                all.onerror = () => { resolve([]); db.close(); };
            } catch {
                resolve([]);
                db.close();
            }
        };
    });
}

/** "Edit a stop", "Delete a place"… — what a queued write was, in a few words. */
export function describeWrite(method: string, url: string): string {
    const path = new URL(url, 'http://local').pathname.replace(/^\/api\/admin\//, '');
    const parts = path.split('/').filter(Boolean);
    const thing = (parts[parts.length - 1] || 'item').replace(/-/g, ' ');
    const area = parts.length > 1 ? `${parts[0].replace(/-/g, ' ')} · ` : '';
    const verb = method.toUpperCase() === 'DELETE' ? 'Delete' : method.toUpperCase() === 'POST' ? 'Add/save' : 'Edit';
    return `${verb} ${area}${thing}`;
}
