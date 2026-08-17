'use client';

import ChecklistTab from '../ChecklistTab';
import { useHoneymoonApi } from '../HoneymoonContext';

export default function HoneymoonChecklistPage() {
    return <ChecklistTab api={useHoneymoonApi()} />;
}
