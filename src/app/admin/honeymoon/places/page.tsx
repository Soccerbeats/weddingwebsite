'use client';

import PlacesTab from '../PlacesTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonPlacesPage() {
    return <PlacesTab api={useHoneymoonApi()} />;
}
