'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UpdateStatus {
    current: string | null;
    latest: string | null;
    available: boolean;
    building: boolean;
    checkedAt: string;
    error: string | null;
    repo: string;
    webhook: { set: boolean; host: string | null };
}

export async function fetchUpdateStatus(refresh = false): Promise<UpdateStatus | null> {
    try {
        const res = await fetch(`/api/admin/update${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return (await res.json()) as UpdateStatus;
    } catch {
        return null;
    }
}

/** How long to wait for the new container before giving up and saying so. */
const RESTART_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_MS = 5000;

type Phase = 'idle' | 'starting' | 'restarting' | 'stuck' | 'error';

/**
 * Settings → Updates: the version this site runs, the newest one published, and
 * the button that installs it through a Portainer webhook.
 *
 * Installing restarts the container this page is talking to, so after the
 * webhook fires the page polls until the server answers with a different
 * version, then reloads. Requests failing in between are the restart, not an
 * error.
 */
export default function UpdatesSection() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [checking, setChecking] = useState(false);
    const [webhookInput, setWebhookInput] = useState('');
    const [editing, setEditing] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [message, setMessage] = useState('');
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        fetchUpdateStatus().then((s) => { if (alive.current) { setStatus(s); setLoaded(true); } });
        return () => { alive.current = false; };
    }, []);

    const checkNow = useCallback(async () => {
        setChecking(true);
        const s = await fetchUpdateStatus(true);
        if (alive.current) { setStatus(s); setChecking(false); }
    }, []);

    const saveWebhook = useCallback(async (url: string) => {
        setSaving(true);
        setSaveError('');
        try {
            const res = await fetch('/api/admin/update/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Could not save the webhook');
            setStatus((s) => (s ? { ...s, webhook: body.webhook } : s));
            setWebhookInput('');
            setEditing(false);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Could not save the webhook');
        } finally {
            setSaving(false);
        }
    }, []);

    const install = useCallback(async () => {
        if (!status) return;
        const from = status.current;
        setPhase('starting');
        setMessage('');
        try {
            const res = await fetch('/api/admin/update', { method: 'POST' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Could not start the update');
        } catch (error) {
            // A dropped connection (fetch's TypeError) is most likely the restart
            // itself beating the answer back; anything else is a refusal.
            if (!(error instanceof TypeError)) {
                setPhase('error');
                setMessage(error instanceof Error ? error.message : 'Could not start the update');
                return;
            }
        }
        setPhase('restarting');
        const started = Date.now();
        while (alive.current && Date.now() - started < RESTART_TIMEOUT_MS) {
            await new Promise((r) => setTimeout(r, POLL_MS));
            const s = await fetchUpdateStatus();
            if (s?.current && s.current !== from) {
                window.location.reload();
                return;
            }
        }
        if (alive.current) setPhase('stuck');
    }, [status]);

    const busy = phase === 'starting' || phase === 'restarting';

    return (
        <div id="updates" className="pt-6 border-t border-gray-100 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Updates</h2>
            <p className="text-sm text-gray-500 mb-4">
                New versions are published on GitHub. This site checks a few times a day and, with a
                Portainer webhook saved below, can install one itself.
            </p>

            {!loaded ? (
                <p className="text-sm text-gray-500">Checking for updates…</p>
            ) : !status ? (
                <p className="text-sm text-gray-500">Could not check for updates right now.</p>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-white/50 rounded-lg border border-accent/30">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-gray-900">
                                    {status.available
                                        ? `Update available — ${status.latest}`
                                        : status.building
                                            ? `${status.latest} is being built`
                                            : status.latest
                                                ? 'Up to date'
                                                : 'Could not reach GitHub'}
                                </h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Running {status.current ?? 'an unknown version'}
                                    {status.latest && status.latest !== status.current && ` · newest ${status.latest}`}
                                    {status.building && ' · its image is not published yet, check back in a few minutes'}
                                    {status.error && ` · ${status.error}`}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={checkNow}
                                    disabled={checking || busy}
                                    className="py-2 px-4 text-sm font-medium rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50"
                                >
                                    {checking ? 'Checking…' : 'Check now'}
                                </button>
                                {status.available && status.webhook.set && (
                                    <button
                                        type="button"
                                        onClick={install}
                                        disabled={busy}
                                        className="py-2 px-4 text-sm font-medium rounded-full text-white bg-accent hover:bg-accent-dark disabled:opacity-50"
                                    >
                                        {phase === 'starting' ? 'Starting…' : phase === 'restarting' ? 'Updating…' : `Update to ${status.latest}`}
                                    </button>
                                )}
                            </div>
                        </div>
                        {status.latest && status.latest !== status.current && (
                            <a
                                href={`https://github.com/${status.repo}/blob/main/CHANGELOG.md`}
                                target="_blank" rel="noopener noreferrer"
                                className="mt-3 inline-block text-sm text-accent underline"
                            >
                                What&apos;s new
                            </a>
                        )}
                        {phase === 'restarting' && (
                            <p className="mt-3 text-sm text-gray-600">
                                Portainer is pulling the new version and restarting the site. This page reloads
                                by itself when it is back — usually within a minute or two.
                            </p>
                        )}
                        {phase === 'stuck' && (
                            <p className="mt-3 text-sm text-red-600">
                                The site has not come back on a new version after six minutes. Check the stack in
                                Portainer — the webhook may redeploy without pulling the new image.
                            </p>
                        )}
                        {phase === 'error' && <p className="mt-3 text-sm text-red-600">{message}</p>}
                        {status.available && !status.webhook.set && (
                            <p className="mt-3 text-sm text-gray-600">
                                To install it from here, save a Portainer webhook below. Or, in Portainer, open the
                                stack and choose <strong>Pull and redeploy</strong>.
                            </p>
                        )}
                    </div>

                    <div className="p-4 bg-white/50 rounded-lg border border-gray-200">
                        <h3 className="font-semibold text-gray-900">Portainer webhook</h3>
                        {status.webhook.set && !editing ? (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-gray-600">
                                    Saved{status.webhook.host ? ` — ${status.webhook.host}` : ''}. The link itself is
                                    kept on the server and is not shown again.
                                </p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditing(true)}
                                        className="py-1.5 px-3 text-sm rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300">
                                        Replace
                                    </button>
                                    <button type="button" onClick={() => saveWebhook('')} disabled={saving}
                                        className="py-1.5 px-3 text-sm rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50">
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <ol className="mt-2 text-sm text-gray-600 list-decimal pl-5 space-y-1">
                                    <li>In Portainer, open this site&apos;s stack and choose <strong>Editor</strong>.</li>
                                    <li>Switch on <strong>Create a stack webhook</strong> (and <strong>Re-pull image</strong> if it is offered), then <strong>Update the stack</strong>.</li>
                                    <li>Copy the webhook link and paste it here.</li>
                                </ol>
                                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="url"
                                        value={webhookInput}
                                        onChange={(e) => setWebhookInput(e.target.value)}
                                        placeholder="https://portainer:9443/api/stacks/webhooks/…"
                                        className="flex-1 min-w-0 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => saveWebhook(webhookInput)}
                                        disabled={saving || !webhookInput.trim()}
                                        className="py-2 px-4 text-sm font-medium rounded-full text-white bg-accent hover:bg-accent-dark disabled:opacity-50"
                                    >
                                        {saving ? 'Saving…' : 'Save'}
                                    </button>
                                    {editing && (
                                        <button type="button" onClick={() => { setEditing(false); setSaveError(''); }}
                                            className="py-2 px-4 text-sm rounded-full border border-gray-200 bg-white text-gray-700">
                                            Cancel
                                        </button>
                                    )}
                                </div>
                                {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
