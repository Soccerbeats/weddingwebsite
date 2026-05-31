'use client';

import { useState, useEffect } from 'react';

export default function AdminAbout() {
    const [config, setConfig] = useState({
        ourStoryTitle: '',
        howWeMetTitle: '',
        ourStoryBody: '',
        venueDescription: '',
        venueAddress: '',
        ceremonyText: '',
        receptionText: '',
        aboutSubtitle: '',
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">About Page Content</h1>
            <p className="text-gray-600 mb-8">Customize your story and venue information</p>

            {message && (
                <div className={`p-4 rounded-xl mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">

                {/* Story Section */}
                <div className="space-y-6 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Our Story</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Page Headline</label>
                        <input
                            type="text"
                            value={config.ourStoryTitle || ''}
                            onChange={(e) => setConfig({ ...config, ourStoryTitle: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. A chance meeting..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">"How We Met" Section Title</label>
                        <input
                            type="text"
                            value={config.howWeMetTitle || ''}
                            onChange={(e) => setConfig({ ...config, howWeMetTitle: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. How We Met, Our Beginning, etc."
                        />
                        <p className="text-xs text-gray-500 mt-1">This will be the heading above your story. Leave blank to use "How We Met"</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">How We Met Story</label>
                        <p className="text-xs text-gray-500 mb-2">Tell your story in this section. You can use multiple lines here.</p>
                        <textarea
                            rows={8}
                            value={config.ourStoryBody || ''}
                            onChange={(e) => setConfig({ ...config, ourStoryBody: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="Tell your story..."
                        />
                    </div>
                </div>

                {/* Venue Section */}
                <div className="space-y-6 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Venue Info</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Venue Description</label>
                        <textarea
                            rows={3}
                            value={config.venueDescription || ''}
                            onChange={(e) => setConfig({ ...config, venueDescription: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
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
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. 123 Wedding Lane, City, State"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">The Ceremony Box Text</label>
                        <p className="text-xs text-gray-500 mb-2">Text displayed in "The Ceremony" box below the venue description.</p>
                        <textarea
                            rows={3}
                            value={config.ceremonyText || ''}
                            onChange={(e) => setConfig({ ...config, ceremonyText: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. The ceremony will take place at 4:00 PM at the venue."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">The Reception Box Text</label>
                        <p className="text-xs text-gray-500 mb-2">Text displayed in "The Reception" box below the venue description.</p>
                        <textarea
                            rows={3}
                            value={config.receptionText || ''}
                            onChange={(e) => setConfig({ ...config, receptionText: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. Dinner and dancing will follow immediately."
                        />
                    </div>
                </div>

                {/* Nav Card Subtitle */}
                <div className="space-y-4 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Nav Card Subtitle</h2>
                    <p className="text-sm text-gray-500">Short tagline shown on the About card at the bottom of the home page.</p>
                    <input
                        type="text"
                        value={config.aboutSubtitle || ''}
                        onChange={(e) => setConfig({ ...config, aboutSubtitle: e.target.value })}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                        placeholder="e.g. Where it all began"
                    />
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-accent hover:bg-accent-dark hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all duration-300"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
