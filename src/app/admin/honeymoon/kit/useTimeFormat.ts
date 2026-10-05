'use client';

import { useCallback } from 'react';
import { formatClock } from '@/lib/honeymoonToday';
import { useHoneymoonApi } from '../HoneymoonContext';

/**
 * Times in the trip's own clock.
 *
 * Every view that prints a time goes through this, so one setting decides
 * whether the whole portal reads `09:30` or `9:30 AM`.
 */
export function useTimeFormat(): (value: string | null | undefined) => string {
    const format = useHoneymoonApi().data?.trip.time_format ?? '24h';
    return useCallback((value) => formatClock(value, format), [format]);
}
