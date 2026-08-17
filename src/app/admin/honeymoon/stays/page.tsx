'use client';

import StaysTab from '../StaysTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonStaysPage() {
    return <StaysTab api={useHoneymoonApi()} />;
}
