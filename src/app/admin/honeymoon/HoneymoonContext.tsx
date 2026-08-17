'use client';

import { createContext, useContext } from 'react';
import type { HoneymoonApi } from './useHoneymoon';

/**
 * Shares one data hook across the honeymoon routes.
 *
 * Each tab is its own URL now, so a refresh lands you back where you were. If
 * every route mounted its own `useHoneymoon`, moving between tabs would refetch
 * the whole payload each time; the layout owns it and hands it down instead.
 */
const HoneymoonContext = createContext<HoneymoonApi | null>(null);

export function HoneymoonProvider(
    { api, children }: { api: HoneymoonApi; children: React.ReactNode },
) {
    return <HoneymoonContext.Provider value={api}>{children}</HoneymoonContext.Provider>;
}

export function useHoneymoonApi(): HoneymoonApi {
    const api = useContext(HoneymoonContext);
    if (!api) throw new Error('useHoneymoonApi must be used inside the honeymoon layout');
    return api;
}
