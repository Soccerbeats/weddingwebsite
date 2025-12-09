'use client';

import { useState, useEffect } from 'react';

export default function AdminAbout() {
    const [config, setConfig] = useState({
        ourStoryTitle: '',
        ourStoryBody: '',
        venueDescription: '',
        venueAddress: '',
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
                setMessage('About Page updated successfully!');
            } else {
                setMessage('Failed to update.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">About Page Content</h1>

            {message && (
                <div className={`p-4 rounded-md mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-lg border border-gray-200 shadow-sm">

                {/* Story Section */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">Our Story</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Page Headline</label>
                        <input
                            type="text"
                            value={config.ourStoryTitle || ''}
                            onChange={(e) => setConfig({ ...config, ourStoryTitle: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. A chance meeting..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Our Story Body Text</label>
                        <p className="text-xs text-gray-500 mb-2">You can use multiple lines here.</p>
                        <textarea
                            rows={8}
                            value={config.ourStoryBody || ''}
                            onChange={(e) => setConfig({ ...config, ourStoryBody: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="Tell your story..."
                        />
                    </div>
                </div>

                {/* Venue Section */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">Venue Info</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Venue Description</label>
                        <textarea
                            rows={3}
                            value={config.venueDescription || ''}
                            onChange={(e) => setConfig({ ...config, venueDescription: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="Short blurb about the venue..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Venue Address (for Maps)</label>
                        <p className="text-xs text-gray-500 mb-2">Entering an address here will create a "Get Directions" link on the website.</p>
                        <input
                            type="text"
                            value={config.venueAddress || ''}
                            onChange={(e) => setConfig({ ...config, venueAddress: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. 123 Wedding Lane, City, State"
                        />
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
