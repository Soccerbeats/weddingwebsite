'use client';

import { useState, useEffect } from 'react';

export default function AdminSettings() {
    const [config, setConfig] = useState({
        brideName: '',
        groomName: '',
        weddingDate: '',
        weddingTime: '',
        weddingLocation: '',
        weddingVenue: '',
        rsvpDeadline: '',
        countdownMode: 'full',
        logoMode: false,
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setConfig(prev => ({ ...prev, ...data })));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            if (res.ok) {
                setMessage('Settings updated successfully!');
            } else {
                setMessage('Failed to update settings.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">General Settings</h1>
            <p className="text-gray-600 mb-8">Configure your wedding website details and appearance</p>

            {message && (
                <div className={`p-4 rounded-xl mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Bride's Name</label>
                        <input
                            type="text"
                            value={config.brideName}
                            onChange={(e) => setConfig({ ...config, brideName: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Groom's Name</label>
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
                                <strong>Logo Mode:</strong> Displays your wedding logo image. Set the logo in Admin → Photos → "Set Wedding Logo"
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">RSVP Data</h2>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">RSVP Deadline</label>
                        <input
                            type="text"
                            value={config.rsvpDeadline || ''}
                            onChange={(e) => setConfig({ ...config, rsvpDeadline: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. September 15, 2024"
                        />
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-accent hover:bg-accent-dark hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all duration-300"
                    >
                        {loading ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </form >
        </div >
    );
}
