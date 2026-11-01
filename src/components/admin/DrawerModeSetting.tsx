'use client';

import { useDrawerMode } from './Drawer';

/**
 * How panels open on a laptop: side by side (the default) or one at a time.
 *
 * Remembered on this device, like the menu's width — it is about the screen
 * you are on, not the wedding. Hidden on a phone, where they are always one
 * at a time.
 */
export default function DrawerModeSetting() {
    const [mode, setMode] = useDrawerMode();
    const options = [
        { key: 'stack', label: 'Side by side', hint: 'Each new panel opens beside the last, pushing it left.' },
        { key: 'single', label: 'One panel', hint: 'Everything opens in the same panel, with a back arrow.' },
    ] as const;
    return (
        <div className="max-md:hidden">
            <p className="mb-1 block text-xs font-semibold text-gray-500" id="drawer-mode-label">Panels</p>
            <div role="group" aria-labelledby="drawer-mode-label" className="inline-flex rounded-full border border-gray-200 bg-white p-0.5">
                {options.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        aria-pressed={mode === option.key}
                        onClick={() => setMode(option.key)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${mode === option.key
                            ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
                {options.find((o) => o.key === mode)?.hint} Saved on this device.
            </p>
        </div>
    );
}
