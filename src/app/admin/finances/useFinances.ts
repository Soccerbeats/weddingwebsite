'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    Category, Contributor, FinanceSettings, FinanceSummary, Payer, Purchase,
    ScheduledPayment, Snapshot,
} from '@/lib/finance';

export type Resource =
    | 'categories' | 'items' | 'subitems' | 'payers'
    | 'purchases' | 'contributors' | 'receipts' | 'schedule' | 'settings';

export interface FinancePayload {
    settings: FinanceSettings;
    categories: Category[];
    payers: Payer[];
    purchases: Purchase[];
    contributors: Contributor[];
    schedule: ScheduledPayment[];
    snapshots: Snapshot[];
    archived: { categories: number; items: number; purchases: number; contributors: number };
    summary: FinanceSummary;
    weddingDate: string | null;
    today: string;
    headcount: { invited: number; attending: number } | null;
}

/** What was just deleted, so it can be put straight back. */
export interface UndoEntry {
    label: string;
    restore: () => Promise<boolean>;
}

const BASE = '/api/admin/finances';

/**
 * Owns the finance suite's data and every mutation.
 *
 * Mutations refetch the whole payload rather than patching local state, because
 * almost every edit changes derived numbers somewhere else on screen — editing
 * one line's cost moves the grand total, every percentage, both deficits, and
 * both payers' payment plans. Refetching is one request and it can't drift.
 */
export function useFinances() {
    const [data, setData] = useState<FinancePayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(0);
    const [undo, setUndo] = useState<UndoEntry | null>(null);
    const inFlight = useRef(0);
    const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(BASE, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to load finances');
            setData(await res.json());
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load finances');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const run = useCallback(async (fn: () => Promise<Response>) => {
        inFlight.current += 1;
        setBusy(inFlight.current);
        try {
            const res = await fn();
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Request failed');
            }
            await refresh();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Request failed');
            return false;
        } finally {
            inFlight.current -= 1;
            setBusy(inFlight.current);
        }
    }, [refresh]);

    const create = useCallback((resource: Resource, body: Record<string, unknown>) =>
        run(() => fetch(`${BASE}/${resource}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })), [run]);

    const update = useCallback((resource: Resource, body: Record<string, unknown>) =>
        run(() => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })), [run]);

    const remove = useCallback((resource: Resource, id: number) =>
        run(() => fetch(`${BASE}/${resource}?id=${id}`, { method: 'DELETE' })), [run]);

    /**
     * Delete with a way back. The row's own fields are captured first and
     * re-created on undo — a new id, but the same content, which is what matters
     * for a mis-tap. Offered instead of a confirm dialog on low-risk rows.
     */
    const removeWithUndo = useCallback(async (
        resource: Resource, id: number, label: string, snapshot: Record<string, unknown>,
    ) => {
        const ok = await remove(resource, id);
        if (!ok) return false;
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo({
            label,
            restore: async () => {
                setUndo(null);
                return create(resource, snapshot);
            },
        });
        undoTimer.current = setTimeout(() => setUndo(null), 10_000);
        return true;
    }, [remove, create]);

    const dismissUndo = useCallback(() => {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo(null);
    }, []);

    /** Update many rows of one resource in a single statement. */
    const updateMany = useCallback((resource: Resource, ids: number[], fields: Record<string, unknown>) =>
        run(() => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, ...fields }),
        })), [run]);

    const uploadReceipt = useCallback((id: number, file: File) => {
        const form = new FormData();
        form.append('id', String(id));
        form.append('file', file);
        return run(() => fetch(`${BASE}/receipt`, { method: 'POST', body: form }));
    }, [run]);

    const removeReceipt = useCallback((id: number) =>
        run(() => fetch(`${BASE}/receipt?id=${id}`, { method: 'DELETE' })), [run]);

    const reorder = useCallback((resource: Resource, ids: { id: number }[]) =>
        run(() => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids),
        })), [run]);

    return {
        data, loading, error, saving: busy > 0,
        refresh, create, update, remove, reorder,
        removeWithUndo, undo, dismissUndo,
        updateMany, uploadReceipt, removeReceipt,
        clearError: () => setError(''),
    };
}

export type FinanceApi = ReturnType<typeof useFinances>;
