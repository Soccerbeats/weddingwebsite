'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    Category, Contributor, FinanceSettings, FinanceSummary, Payer, Purchase,
} from '@/lib/finance';

export type Resource =
    | 'categories' | 'items' | 'subitems' | 'payers'
    | 'purchases' | 'contributors' | 'receipts' | 'settings';

export interface FinancePayload {
    settings: FinanceSettings;
    categories: Category[];
    payers: Payer[];
    purchases: Purchase[];
    contributors: Contributor[];
    summary: FinanceSummary;
    weddingDate: string | null;
    headcount: { invited: number; attending: number } | null;
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
    const inFlight = useRef(0);

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

    const reorder = useCallback((resource: Resource, ids: { id: number }[]) =>
        run(() => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids),
        })), [run]);

    return {
        data, loading, error, saving: busy > 0,
        refresh, create, update, remove, reorder,
        clearError: () => setError(''),
    };
}

export type FinanceApi = ReturnType<typeof useFinances>;
