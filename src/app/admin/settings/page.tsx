'use client';

import { useState, useEffect, useCallback } from 'react';
import UpdatesSection from '@/components/admin/UpdatesSection';
import { AutosaveHeader, useAutosave } from '@/components/admin/useAutosave';
import { DEFAULT_ROOM_BLOCK_MESSAGE } from '@/lib/roomBlock';
import { effectiveRsvpMode, type RsvpModeSetting } from '@/lib/rsvpMode';
import DrawerModeSetting from '@/components/admin/DrawerModeSetting';

const RSVP_MODE_LABEL: Record<'link' | 'verify' | 'simple', string> = {
    link: 'Email link',
    verify: 'Verify by email',
    simple: 'Simple (no verification)',
};

export default function AdminSettings() {
    const [config, setConfig] = useState({
        brideName: '',
        groomName: '',
        weddingDate: '',
        weddingTime: '',
        weddingLocation: '',
        weddingVenue: '',
        rsvpDeadline: '',
        contactEmail: '',
        roomBlockHotel: '',
        roomBlockUrl: '',
        roomBlockMessage: '',
        countdownMode: 'full',
        logoMode: false,
        rsvpMode: 'auto',
    });
    const [loaded, setLoaded] = useState(false);

    // The Email (SMTP) section. Its settings live in the stack's environment, so
    // this page only reads their state and offers a test send — nothing here
    // accepts an address, and the recipient is NOTIFICATION_EMAIL alone.
    const [emailStatus, setEmailStatus] = useState<{
        configured: boolean;
        host: string | null;
        notificationEmailSet: boolean;
    } | null>(null);
    const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/settings/email-status')
            .then(res => res.json())
            .then(data => setEmailStatus({
                configured: data.configured === true,
                host: typeof data.host === 'string' ? data.host : null,
                notificationEmailSet: data.notificationEmailSet === true,
            }))
            .catch(() => setEmailStatus(null));
    }, []);

    const sendTestMail = useCallback(async () => {
        setTestState('sending');
        setTestMessage('');
        try {
            const res = await fetch('/api/admin/settings/test-email', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                setTestState('error');
                setTestMessage(typeof data.error === 'string' ? data.error : String(res.status));
            } else {
                setTestState('ok');
            }
        } catch {
            setTestState('error');
            setTestMessage('The test mail request could not be sent.');
        }
    }, []);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            // Only this page's own fields. Spreading the whole config into
            // state and posting it back overwrote every other editor's keys
            // with whatever this tab had loaded — the Colour page's save could
            // be undone by pressing Save here a minute later.
            .then(data => setConfig(prev => {
                const next = { ...prev };
                for (const key of Object.keys(prev) as (keyof typeof prev)[]) {
                    if (data[key] !== undefined) (next as Record<string, unknown>)[key] = data[key];
                }
                // Pre-fill the room-block message with the default wording so
                // it's visible and overwritable when nothing has been saved yet.
                next.roomBlockMessage = data.roomBlockMessage || DEFAULT_ROOM_BLOCK_MESSAGE;
                return next;
            }))
            .then(() => setLoaded(true));
    }, []);

    const save = useCallback(async (body: typeof config) => {
        const res = await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
    }, []);

    const { state, retry } = useAutosave({ value: config, ready: loaded, save });

    return (
        <div className="max-w-2xl">
            <AutosaveHeader
                title="General Settings"
                subtitle="Configure your wedding website details and appearance. Changes save themselves."
                state={state}
                onRetry={retry}
            />

            <div className="space-y-6 bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Bride&apos;s Name</label>
                        <input
                            type="text"
                            value={config.brideName}
                            onChange={(e) => setConfig({ ...config, brideName: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Groom&apos;s Name</label>
                        <input
                            type="text"
                            value={config.groomName}
                            onChange={(e) => setConfig({ ...config, groomName: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Wedding Date</label>
                    <input
                        type="text"
                        value={config.weddingDate}
                        onChange={(e) => setConfig({ ...config, weddingDate: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. June 15, 2024"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Wedding Time</label>
                    <input
                        type="text"
                        value={config.weddingTime}
                        onChange={(e) => setConfig({ ...config, weddingTime: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. 4:00 PM"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Countdown Display Mode</label>
                    <select
                        value={config.countdownMode || 'full'}
                        onChange={(e) => setConfig({ ...config, countdownMode: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                    >
                        <option value="full">Full (Days, Hours, Minutes, Seconds)</option>
                        <option value="simple">Simple (Days, Hours only)</option>
                        <option value="days-only">Days Only (Large Display)</option>
                    </select>
                    <p className="mt-1 text-sm text-gray-500">
                        Choose the countdown display style - Days Only shows a larger, more prominent display
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Venue Name</label>
                    <input
                        type="text"
                        value={config.weddingVenue || ''}
                        onChange={(e) => setConfig({ ...config, weddingVenue: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. The Grand Hotel"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Location (City, State)</label>
                    <input
                        type="text"
                        value={config.weddingLocation}
                        onChange={(e) => setConfig({ ...config, weddingLocation: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                    />
                </div>

                {/* How the admin's panels open — this device only, so not autosaved with the rest. */}
                <div className="pt-6 border-t border-gray-100 max-md:hidden">
                    <h2 className="text-xl font-semibold text-gray-900 mb-3">Admin Panels</h2>
                    <DrawerModeSetting />
                </div>

                <div className="pt-6 border-t border-gray-100">
                    <div className="bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-xl p-6 mb-6 border border-accent/20">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Navigation Display</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-gray-900">Logo Mode</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Use a wedding logo image in the navigation bar instead of names
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.logoMode || false}
                                    onChange={(e) => setConfig({ ...config, logoMode: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-accent"></div>
                            </label>
                        </div>
                        <div className="mt-4 p-4 bg-white/50 rounded-lg border border-accent/30">
                            <p className="text-sm text-gray-700">
                                <strong>Name Mode (Default):</strong> Displays bride and groom names in the navigation bar
                            </p>
                            <p className="text-sm text-gray-700 mt-2">
                                <strong>Logo Mode:</strong> Displays your wedding logo image. Set the logo in Admin → Photos → &quot;Set Wedding Logo&quot;
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">RSVP Data</h2>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                        <input
                            type="email"
                            value={config.contactEmail || ''}
                            onChange={(e) => setConfig({ ...config, contactEmail: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="you@example.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">Shown on the RSVP page for guests having trouble.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">RSVP Deadline</label>
                        <input
                            type="date"
                            value={config.rsvpDeadline || ''}
                            onChange={(e) => setConfig({ ...config, rsvpDeadline: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                        <p className="mt-1 text-xs text-gray-500">The public RSVP page shows this date and counts down the days remaining.</p>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Accommodations / Room Block</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Shown to guests on the RSVP confirmation screen. Leave the hotel name blank to hide the room-block card entirely.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Hotel / Room Block Name</label>
                            <input
                                type="text"
                                value={config.roomBlockHotel || ''}
                                onChange={(e) => setConfig({ ...config, roomBlockHotel: e.target.value })}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                placeholder="e.g. The Harbor View"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Booking URL</label>
                            <input
                                type="url"
                                value={config.roomBlockUrl || ''}
                                onChange={(e) => setConfig({ ...config, roomBlockUrl: e.target.value })}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                placeholder="https://www.choicehotels.com/reservations/groups/tk74b5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Room Block Message</label>
                            <textarea
                                rows={5}
                                value={config.roomBlockMessage || ''}
                                onChange={(e) => setConfig({ ...config, roomBlockMessage: e.target.value })}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                placeholder="Leave blank to use the default wording."
                            />
                            <div className="mt-2 text-xs text-gray-500 space-y-1">
                                <p>Shown on the RSVP confirmation card. Leave blank to use the default wording. You can use these tokens:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                    <li><code className="text-accent font-mono">{'{names}'}</code> — the couple&apos;s names (e.g. Heaven &amp; Austin)</li>
                                    <li><code className="text-accent font-mono">{'{hotel}'}</code> — the hotel / room block name above</li>
                                    <li><code className="text-accent font-mono">{'{book}'}</code> — a clickable &quot;Book Your Room&quot; link. Its address comes from the Booking URL above, so editing this message can never break the link.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Email (SMTP)</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        The RSVP confirmation and the notification to you go out over SMTP. The credentials live
                        in the stack&apos;s environment, not in this page — here you can see their state and send a
                        test mail.
                    </p>
                    {emailStatus === null ? (
                        <p className="text-sm text-gray-500">Checking the mail settings…</p>
                    ) : (
                        <div className="p-4 bg-white/50 rounded-lg border border-accent/30">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-gray-900">
                                        {emailStatus.configured ? `Configured — ${emailStatus.host}` : 'Not configured'}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {emailStatus.configured
                                            ? 'Guests get a confirmation and you get a notification when an RSVP arrives.'
                                            : 'Set SMTP_HOST and SMTP_USER (and NOTIFICATION_EMAIL for the test recipient) in the stack environment to switch it on.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={sendTestMail}
                                    disabled={testState === 'sending'}
                                    className="relative py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {testState === 'sending' ? 'Sending…' : 'Send test email'}
                                </button>
                            </div>
                            <p className="mt-3 text-sm text-gray-500">
                                Test recipient (NOTIFICATION_EMAIL): {emailStatus.notificationEmailSet ? 'set' : 'not set'}
                            </p>
                            {testState === 'ok' && (
                                <p className="mt-2 text-sm text-green-600">Test mail sent — it went to the notification address.</p>
                            )}
                            {testState === 'error' && (
                                <p className="mt-2 text-sm text-red-600">{testMessage}</p>
                            )}
                        </div>
                    )}
                </div>

                <UpdatesSection />

                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">RSVP Verification</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        How an RSVP proves it belongs to the household it edits.
                    </p>
                    <div className="space-y-3">
                        {([
                            { value: 'auto', label: 'Automatic (recommended)', help: 'Email link when SMTP is set up, otherwise Verify by email.' },
                            { value: 'link', label: 'Email link', help: "Strongest. A guest gets a link by email for every RSVP, first one or an update. Needs SMTP — with none set up, guests can't get in." },
                            { value: 'verify', label: 'Verify by email', help: "No email needed to send. A first RSVP opens right away; changing one already on file needs the email it was sent with — a knowledge check, not proof of that inbox." },
                            { value: 'simple', label: 'Simple (not recommended)', help: 'No check at all, even on an update — the way the form worked before either mode existed. Anyone who knows a name can see and change that RSVP.' },
                        ] as { value: RsvpModeSetting; label: string; help: string }[]).map((opt) => (
                            <label
                                key={opt.value}
                                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                    config.rsvpMode === opt.value ? 'border-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="rsvpMode"
                                    value={opt.value}
                                    checked={config.rsvpMode === opt.value}
                                    onChange={() => setConfig(prev => ({ ...prev, rsvpMode: opt.value }))}
                                    className="mt-1 h-4 w-4 text-accent focus:ring-accent"
                                />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{opt.help}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                    {config.rsvpMode === 'auto' && (
                        <p className="mt-3 text-sm text-gray-600">
                            Currently using: <span className="font-medium">
                                {RSVP_MODE_LABEL[effectiveRsvpMode('auto', emailStatus?.configured ?? false)]}
                            </span>{emailStatus === null ? ' (checking mail settings…)' : !emailStatus.configured ? " — SMTP isn't set up yet" : ''}
                        </p>
                    )}
                </div>
            </div>
        </div >
    );
}
