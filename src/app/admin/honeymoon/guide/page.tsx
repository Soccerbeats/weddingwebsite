'use client';

import GuideTab from '../GuideTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonGuidePage() {
    return <GuideTab api={useHoneymoonApi()} />;
}
