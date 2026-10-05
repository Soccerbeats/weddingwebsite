'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import ExcursionsTab from './ExcursionsTab';
import { useHoneymoonApi } from './HoneymoonContext';
import PlacesTab from './PlacesTab';
import StaysTab from './StaysTab';
import { Segmented } from './kit/Segmented';

export type PlacesSegment = 'all' | 'stays' | 'excursions';

const HREF: Record<PlacesSegment, string> = {
    all: '/admin/honeymoon/places',
    stays: '/admin/honeymoon/stays',
    excursions: '/admin/honeymoon/excursions',
};

/**
 * Places, stays and excursions as one tab.
 *
 * They were three tabs over the same rows, each with its own list, card,
 * filters and way of adding one. Now they are segments of one: the same card,
 * the same panel, the same toolbar. Stays keeps what only a shortlist of hotels
 * needs — the ranking, the comparison, the price watch — on its own segment.
 *
 * Each segment keeps its own URL, so `/stays` and `/excursions` bookmarks still
 * land where they did, and each keeps its own remembered sort and view.
 */
export default function PlacesHub({ segment }: { segment: PlacesSegment }) {
    const api = useHoneymoonApi();
    const router = useRouter();
    const counts = useMemo(() => {
        const live = (api.data?.places ?? []).filter((p) => !p.archived);
        return {
            all: api.data?.places.length ?? 0,
            stays: live.filter((p) => p.category === 'stay').length,
            excursions: live.filter((p) => p.is_excursion).length,
        };
    }, [api.data?.places]);

    const segmentSwitch = (
        <Segmented<PlacesSegment>
            ariaLabel="Which places"
            value={segment}
            onChange={(next) => router.push(HREF[next])}
            options={[
                { key: 'all', label: 'All', count: counts.all },
                { key: 'stays', label: 'Stays', count: counts.stays },
                { key: 'excursions', label: 'Excursions', count: counts.excursions },
            ]}
        />
    );

    if (segment === 'stays') return <StaysTab api={api} segmentSwitch={segmentSwitch} />;
    if (segment === 'excursions') return <ExcursionsTab api={api} segmentSwitch={segmentSwitch} />;
    return <PlacesTab api={api} segmentSwitch={segmentSwitch} />;
}
