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
            <h1 className="text-2xl font-bold text-gray-900 mb-6">General Settings</h1>

            {message && (
                <div className={`p-4 rounded-md mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Bride's Name</label>
                        <input
                            type="text"
                            value={config.brideName}
                            onChange={(e) => setConfig({ ...config, brideName: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Groom's Name</label>
                        <input
                            type="text"
                            value={config.groomName}
                            onChange={(e) => setConfig({ ...config, groomName: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Wedding Date</label>
                    <input
                        type="text"
                        value={config.weddingDate}
                        onChange={(e) => setConfig({ ...config, weddingDate: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. June 15, 2024"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Wedding Time</label>
                    <input
                        type="text"
                        value={config.weddingTime}
                        onChange={(e) => setConfig({ ...config, weddingTime: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. 4:00 PM"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Venue Name</label>
                    <input
                        type="text"
                        value={config.weddingVenue || ''}
                        onChange={(e) => setConfig({ ...config, weddingVenue: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                        placeholder="e.g. The Grand Hotel"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Location (City, State)</label>
                    <input
                        type="text"
                        value={config.weddingLocation}
                        onChange={(e) => setConfig({ ...config, weddingLocation: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border"
                    />
                </div>


                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">RSVP Data</h2>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">RSVP Deadline</label>
                        <input
                            type="text"
                            value={config.rsvpDeadline || ''}
                            onChange={(e) => setConfig({ ...config, rsvpDeadline: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. September 15, 2024"
                        />
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </form >
        </div >
    );
}
