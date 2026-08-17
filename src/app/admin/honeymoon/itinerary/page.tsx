'use client';

import ItineraryTab from '../ItineraryTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonItineraryPage() {
    return <ItineraryTab api={useHoneymoonApi()} />;
}
