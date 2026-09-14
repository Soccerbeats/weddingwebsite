'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosave for the admin panel's editors, and the status that replaces the
 * button they used to have.
 *
 * Every editor here had the same Save button and the same three bugs waiting
 * behind it, so the answer is one hook rather than nine copies. What it has to
 * get right:
 *
 *   - **Not saving on load.** Several editors normalise what they load — sorting
 *     it, filling defaults — so "has the state changed since mount?" is true on
 *     arrival and would write the file back for merely opening the page. React
 *     also double-invokes effects in development, which defeats the obvious fix
 *     of skipping the first run. So the trigger is the payload *differing from
 *     the one that was loaded*, which is immune to both and additionally means
 *     typing something and undoing it costs no request.
 *   - **Not one request per keystroke.** Typing a sentence is one save.
 *   - **Not two requests at once.** A change made mid-request is queued and sent
 *     after it, so the last thing typed is the last thing written rather than
 *     whichever response happens to land last.
 *   - **Saying so when it fails.** With no button, the status is the only thing
 *     on screen that answers "is what I typed safe?".
 */
export type SaveState = 'clean' | 'pending' | 'saving' | 'saved' | 'error';

export function useAutosave<T>({ value, ready, save, delay = 700 }: {
    /** The payload. Compared by JSON, so it may be rebuilt each render. */
    value: T;
    /** False until the editor has loaded; nothing is saved before it is true. */
    ready: boolean;
    /** How to write it. Throw, or reject, to report a failure. */
    save: (value: T) => Promise<void>;
    delay?: number;
}): { state: SaveState; retry: () => void } {
    const [state, setState] = useState<SaveState>('clean');

    /** The payload as last known to match storage; null until the first load. */
    const baseline = useRef<string | null>(null);
    const latest = useRef(value);
    latest.current = value;
    const saver = useRef(save);
    saver.current = save;

    const inFlight = useRef(false);
    const queued = useRef(false);

    const run = useCallback(async () => {
        if (inFlight.current) { queued.current = true; return; }
        inFlight.current = true;
        setState('saving');
        const sent = JSON.stringify(latest.current);
        try {
            await saver.current(latest.current);
            baseline.current = sent;
            setState(queued.current ? 'pending' : 'saved');
        } catch (err) {
            console.error('Autosave failed:', err);
            // The baseline is deliberately left alone: what is on screen still
            // differs from storage, so the next change retries rather than
            // treating the failed write as done.
            setState('error');
            queued.current = false;
        } finally {
            inFlight.current = false;
            if (queued.current) { queued.current = false; void run(); }
        }
    }, []);

    const serialized = JSON.stringify(value);

    useEffect(() => {
        if (!ready) return;
        // First sight of a loaded editor: this is what storage holds.
        if (baseline.current === null) { baseline.current = serialized; return; }
        if (serialized === baseline.current) return;
        setState('pending');
        const timer = setTimeout(() => { void run(); }, delay);
        return () => clearTimeout(timer);
    }, [serialized, ready, delay, run]);

    // A change in the debounce window, in flight, or failed, is a change closing
    // the tab would lose.
    const unsaved = state === 'pending' || state === 'saving' || state === 'error';
    useEffect(() => {
        if (!unsaved) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [unsaved]);

    return { state, retry: run };
}

/**
 * Where the last change got to.
 *
 * The same pill on every editor, so "saved" looks the same everywhere and a
 * failure is never mistaken for one. `clean` reads "Saved" too: nothing on
 * screen differs from what is stored, which is the question being asked.
 */
export function SaveStatus({ state, onRetry, className = '' }: {
    state: SaveState;
    onRetry: () => void;
    className?: string;
}) {
    if (state === 'error') {
        return (
            <button
                type="button"
                onClick={onRetry}
                className={`flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50
                    hover:bg-red-100 px-3 py-1 rounded-full transition-colors ${className}`}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Not saved — retry
            </button>
        );
    }
    const busy = state === 'saving' || state === 'pending';
    return (
        <span
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${
                state === 'saved' ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'
            } ${className}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${
                state === 'saved' ? 'bg-green-500' : busy ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'
            }`} />
            {busy ? 'Saving…' : 'Saved'}
        </span>
    );
}

/**
 * The page heading with its status, so every converted editor says where it has
 * got to in the same place — top right, where the Save button used to be.
 */
export function AutosaveHeader({ title, subtitle, state, onRetry, children }: {
    title: string;
    subtitle?: string;
    state: SaveState;
    onRetry: () => void;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-start gap-3 mb-8">
            <div className="min-w-0">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
                {subtitle && <p className="text-gray-600">{subtitle}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2 pt-1">
                {children}
                <SaveStatus state={state} onRetry={onRetry} />
            </div>
        </div>
    );
}
