'use client';

import { saveForOffline } from './offlineStore';
import { savedLabel, useOfflineState } from './OfflineManager';

/**
 * "Saved for offline · today 14:02" and the button that does it, in the admin
 * sidebar. The installed app saves on its own; this is for checking, and for
 * saving from an ordinary browser tab.
 */
export default function OfflineStatus() {
    const state = useOfflineState();
    const saving = state.phase === 'saving';
    const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
    return (
        <div data-offline-status data-phase={state.phase} className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <div className="flex items-center justify-between gap-2">
                <span>
                    {saving
                        ? `Saving for offline… ${pct}%`
                        : state.phase === 'failed'
                            ? 'Saving for offline stopped — try again'
                            : state.record
                                ? `Saved for offline · ${savedLabel(state.record.at)}`
                                : 'Not saved for offline yet'}
                </span>
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => { void saveForOffline(); }}
                    className="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700
                        hover:bg-gray-100 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : state.record ? 'Save again' : 'Save now'}
                </button>
            </div>
            {saving && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}
