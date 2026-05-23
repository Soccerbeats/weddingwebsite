'use client';

import { useState, useEffect } from 'react';

export default function AdminHome() {
    const [config, setConfig] = useState<any>({
        homeHeadline: '',
        homeIntroTitle: '',
        homeIntroBody: '',
        heroSlideshowEnabled: false,
        heroSlideshowImages: [] as string[],
        heroSlideshowInterval: 5000,
    });
    const [allPhotos, setAllPhotos] = useState<{ filename: string; title?: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setConfig((prev: any) => ({ ...prev, ...data, heroSlideshowImages: data.heroSlideshowImages || [] })));
        fetch('/api/admin/photos')
            .then(res => res.json())
            .then(data => setAllPhotos(data.photos || []));
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
                setMessage('Home Page settings updated successfully!');
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

    const toggleSlideshowImage = (filename: string) => {
        const imgs: string[] = config.heroSlideshowImages || [];
        const updated = imgs.includes(filename)
            ? imgs.filter((f: string) => f !== filename)
            : [...imgs, filename];
        setConfig({ ...config, heroSlideshowImages: updated });
    };

    const moveSlideshowImage = (index: number, dir: -1 | 1) => {
        const imgs = [...(config.heroSlideshowImages || [])];
        const newIdx = index + dir;
        if (newIdx < 0 || newIdx >= imgs.length) return;
        [imgs[index], imgs[newIdx]] = [imgs[newIdx], imgs[index]];
        setConfig({ ...config, heroSlideshowImages: imgs });
    };

    return (
        <div className="max-w-4xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Home Page Content</h1>
            <p className="text-gray-600 mb-8">Customize the text content and hero image settings for your home page</p>

            {message && (
                <div className={`p-4 rounded-xl mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">

                {/* Hero Section */}
                <div className="space-y-6 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Hero Section</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Small Headline (above names)</label>
                        <input
                            type="text"
                            value={config.homeHeadline || ''}
                            onChange={(e) => setConfig({ ...config, homeHeadline: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. We're getting married!"
                        />
                    </div>
                </div>

                {/* Hero Slideshow */}
                <div className="space-y-6 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-900">Hero Slideshow</h2>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-sm text-gray-600">{config.heroSlideshowEnabled ? 'Enabled' : 'Disabled'}</span>
                            <div
                                onClick={() => setConfig({ ...config, heroSlideshowEnabled: !config.heroSlideshowEnabled })}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.heroSlideshowEnabled ? 'bg-accent' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.heroSlideshowEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </div>
                        </label>
                    </div>

                    <p className="text-sm text-gray-500">
                        When enabled, the hero will cycle through the selected photos instead of showing a single image.
                        The single hero image (set in Photos admin) is used as a fallback when disabled.
                    </p>

                    {config.heroSlideshowEnabled && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Slide Interval (seconds)
                                </label>
                                <input
                                    type="number"
                                    min={2}
                                    max={30}
                                    value={Math.round((config.heroSlideshowInterval || 5000) / 1000)}
                                    onChange={(e) => setConfig({ ...config, heroSlideshowInterval: parseInt(e.target.value) * 1000 })}
                                    className="block w-32 rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Slideshow Photos
                                    <span className="ml-2 text-xs text-gray-400 font-normal">
                                        ({(config.heroSlideshowImages || []).length} selected — click to toggle, use arrows to reorder)
                                    </span>
                                </label>

                                {/* Selected images order */}
                                {(config.heroSlideshowImages || []).length > 0 && (
                                    <div className="mb-4 space-y-2">
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Order</p>
                                        {(config.heroSlideshowImages as string[]).map((filename: string, i: number) => (
                                            <div key={filename} className="flex items-center gap-3 bg-white rounded-lg p-2 border border-accent/30 shadow-sm">
                                                <img src={`/photos/${filename}`} alt="" className="h-10 w-16 object-cover rounded" />
                                                <span className="flex-1 text-sm text-gray-700 truncate">{filename}</span>
                                                <button type="button" onClick={() => moveSlideshowImage(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↑</button>
                                                <button type="button" onClick={() => moveSlideshowImage(i, 1)} disabled={i === (config.heroSlideshowImages || []).length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↓</button>
                                                <button type="button" onClick={() => toggleSlideshowImage(filename)} className="p-1 text-red-400 hover:text-red-600" title="Remove">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Photo picker */}
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">All Photos — click to add/remove</p>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                    {allPhotos.map((photo) => {
                                        const selected = (config.heroSlideshowImages || []).includes(photo.filename);
                                        return (
                                            <div
                                                key={photo.filename}
                                                onClick={() => toggleSlideshowImage(photo.filename)}
                                                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selected ? 'border-accent shadow-lg' : 'border-transparent hover:border-gray-300'}`}
                                            >
                                                <img src={`/photos/${photo.filename}`} alt="" className="h-20 w-full object-cover" />
                                                {selected && (
                                                    <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                                                        <span className="bg-accent text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                                            {(config.heroSlideshowImages as string[]).indexOf(photo.filename) + 1}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {allPhotos.length === 0 && (
                                        <p className="col-span-full text-sm text-gray-400 italic">No photos uploaded yet. Add photos in the Photos admin.</p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Intro Section */}
                <div className="space-y-6 bg-gradient-to-br from-accent/5 to-accent-light/10 rounded-xl p-6 border border-accent/10">
                    <h2 className="text-xl font-semibold text-gray-900">Welcome Message</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Section Title</label>
                        <input
                            type="text"
                            value={config.homeIntroTitle || ''}
                            onChange={(e) => setConfig({ ...config, homeIntroTitle: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="e.g. Join us to celebrate"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Welcome Text</label>
                        <textarea
                            rows={5}
                            value={config.homeIntroBody || ''}
                            onChange={(e) => setConfig({ ...config, homeIntroBody: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                            placeholder="Welcome message paragraph..."
                        />
                    </div>
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
