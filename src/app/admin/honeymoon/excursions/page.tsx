'use client';

import ExcursionsTab from '../ExcursionsTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonExcursionsPage() {
    return <ExcursionsTab api={useHoneymoonApi()} />;
}
