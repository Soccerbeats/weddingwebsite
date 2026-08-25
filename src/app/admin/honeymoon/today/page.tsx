'use client';

import TodayTab from '../TodayTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonTodayPage() {
    return <TodayTab api={useHoneymoonApi()} />;
}
