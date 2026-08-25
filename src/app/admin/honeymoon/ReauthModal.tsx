'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, TextField } from './ui';

/**
 * "Signed out" as a question rather than a red banner.
 *
 * The admin session is two hours and a planning session is longer, so a save
 * refused with a 401 is the ordinary end of an afternoon — but the old
 * behaviour was an "Unauthorized" toast over a form still holding your text,
 * with the only way forward being a full-page login that discarded it. This
 * signs back in where you are and lets the hook finish the save that failed.
 */
export default function ReauthModal({ onAuthenticate, onDismiss }: {
    onAuthenticate: (password: string) => Promise<boolean>;
    onDismiss: () => void;
}) {
    const [password, setPassword] = useState('');
    const [wrong, setWrong] = useState(false);
    const [busy, setBusy] = useState(false);

    // Mounted only while the session is expired, so its state starts empty every
    // time without an effect resetting it.
    if (typeof document === 'undefined') return null;

    const submit = async () => {
        if (!password || busy) return;
        setBusy(true);
        const ok = await onAuthenticate(password);
        setBusy(false);
        if (ok) setPassword(''); else setWrong(true);
    };

    return createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4
            bg-gray-900/40 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
                <h2 className="text-lg font-semibold text-gray-900">Signed out</h2>
                <p className="mt-1 text-sm text-gray-600">
                    Your session timed out. Sign in and the change you just made will finish
                    saving.
                </p>
                <div className="mt-4">
                    <TextField
                        // The modal exists to take a password; anywhere else to
                        // put the cursor would be wrong.
                        autoFocus
                        type="password"
                        value={password}
                        placeholder="Admin password"
                        autoComplete="current-password"
                        onChange={(e) => { setPassword(e.target.value); setWrong(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                    />
                    {wrong && (
                        <p className="mt-2 text-sm text-rose-600">
                            That password didn&apos;t work. Try again.
                        </p>
                    )}
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                    <Button onClick={onDismiss}>Not now</Button>
                    <Button tone="primary" onClick={() => void submit()} disabled={!password || busy}>
                        {busy ? 'Signing in…' : 'Sign in and save'}
                    </Button>
                </div>
            </div>
        </div>
    ), document.body);
}
