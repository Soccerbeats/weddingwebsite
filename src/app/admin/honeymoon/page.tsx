'use client';

import MapTab from './MapTab';
import { useHoneymoonApi } from './HoneymoonContext';

export default function HoneymoonMapPage() {
    return <MapTab api={useHoneymoonApi()} />;
}
