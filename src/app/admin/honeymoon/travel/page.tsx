'use client';

import TravelTab from '../TravelTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonTravelPage() {
    return <TravelTab api={useHoneymoonApi()} />;
}
