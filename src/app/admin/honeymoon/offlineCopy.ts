'use client';

import { buildOfflineHtml, offlineExportFilename } from '@/lib/honeymoonExport';
import type { HoneymoonPayload } from '@/lib/honeymoon';

/**
 * Save the whole trip as one self-contained HTML file.
 *
 * The backup for when the offline Today view does not come through: built from
 * the payload already on screen, so it is exactly what the tabs show.
 */
export function downloadOfflineCopy(data: HoneymoonPayload) {
    const html = buildOfflineHtml(data);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = offlineExportFilename(data);
    link.click();
    URL.revokeObjectURL(url);
}
