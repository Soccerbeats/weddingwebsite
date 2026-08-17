'use client';

import SettingsTab from '../SettingsTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonSettingsPage() {
    return <SettingsTab api={useHoneymoonApi()} />;
}
