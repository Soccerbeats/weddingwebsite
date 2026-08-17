'use client';

import DashboardTab from './DashboardTab';
import { useHoneymoonApi } from './HoneymoonContext';

export default function HoneymoonDashboardPage() {
    return <DashboardTab api={useHoneymoonApi()} />;
}
