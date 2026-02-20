'use client';

import { useState, useEffect } from 'react';

export default function AdminColorSettings() {
    const [config, setConfig] = useState({
        accentColor: '',
        accentLightColor: '',
        accentDarkColor: '',
        weddingColorPalette: ['#D4AF37', '#F4E5C3', '#B8941F', '#8B7355', '#FFFFFF'],
        pageBgColors: {
            home: '#ffffff',
            about: '#ffffff',
            ourStory: '#ffffff',
            weddingParty: '#ffffff',
            schedule: '#ffffff',
            photos: '#ffffff',
            rsvp: '#ffffff',
        },
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
                setMessage('Color settings updated successfully!');
            } else {
                setMessage('Failed to update color settings.');
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Color Settings</h1>
            <p className="text-gray-600 mb-8">Customize your wedding website colors and themes</p>

            {message && (
                <div className={`p-4 rounded-xl mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Accent Colors Section */}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">
                    <div className="bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-xl p-6 border border-accent/20">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accent Colors</h2>
                        <p className="text-sm text-gray-600 mb-4">Set your primary wedding accent colors used throughout the site</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Primary Accent</label>
                                <div className="flex items-center mt-1 space-x-2">
                                    <input
                                        type="color"
                                        value={config.accentColor || '#D4AF37'}
                                        onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                                        className="h-10 w-20 p-1 rounded-lg border border-gray-300 cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={config.accentColor || '#D4AF37'}
                                        onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900 uppercase"
                                    />
                                </div>
                                {config.weddingColorPalette && config.weddingColorPalette.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {config.weddingColorPalette.map((color, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setConfig({ ...config, accentColor: color })}
                                                className="w-8 h-8 rounded-lg border-2 border-gray-300 hover:border-gray-900 transition-all shadow-sm hover:shadow-md"
                                                style={{ backgroundColor: color }}
                                                title={`Use ${color}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Light Accent</label>
                                <div className="flex items-center mt-1 space-x-2">
                                    <input
                                        type="color"
                                        value={config.accentLightColor || '#F4E5C3'}
                                        onChange={(e) => setConfig({ ...config, accentLightColor: e.target.value })}
                                        className="h-10 w-20 p-1 rounded-lg border border-gray-300 cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={config.accentLightColor || '#F4E5C3'}
                                        onChange={(e) => setConfig({ ...config, accentLightColor: e.target.value })}
                                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900 uppercase"
                                    />
                                </div>
                                {config.weddingColorPalette && config.weddingColorPalette.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {config.weddingColorPalette.map((color, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setConfig({ ...config, accentLightColor: color })}
                                                className="w-8 h-8 rounded-lg border-2 border-gray-300 hover:border-gray-900 transition-all shadow-sm hover:shadow-md"
                                                style={{ backgroundColor: color }}
                                                title={`Use ${color}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Dark Accent</label>
                                <div className="flex items-center mt-1 space-x-2">
                                    <input
                                        type="color"
                                        value={config.accentDarkColor || '#B8941F'}
                                        onChange={(e) => setConfig({ ...config, accentDarkColor: e.target.value })}
                                        className="h-10 w-20 p-1 rounded-lg border border-gray-300 cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={config.accentDarkColor || '#B8941F'}
                                        onChange={(e) => setConfig({ ...config, accentDarkColor: e.target.value })}
                                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900 uppercase"
                                    />
                                </div>
                                {config.weddingColorPalette && config.weddingColorPalette.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {config.weddingColorPalette.map((color, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setConfig({ ...config, accentDarkColor: color })}
                                                className="w-8 h-8 rounded-lg border-2 border-gray-300 hover:border-gray-900 transition-all shadow-sm hover:shadow-md"
                                                style={{ backgroundColor: color }}
                                                title={`Use ${color}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Wedding Color Palette Section */}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">
                    <div className="bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-xl p-6 border border-accent/20">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Wedding Color Palette</h2>
                        <p className="text-sm text-gray-600 mb-4">Define 5 custom colors that will appear as quick-select options under all color pickers throughout the admin panel</p>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            {[0, 1, 2, 3, 4].map((idx) => (
                                <div key={idx}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Color {idx + 1}</label>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="color"
                                            value={config.weddingColorPalette?.[idx] || '#FFFFFF'}
                                            onChange={(e) => {
                                                const newPalette = [...(config.weddingColorPalette || Array(5).fill('#FFFFFF'))];
                                                newPalette[idx] = e.target.value;
                                                setConfig({ ...config, weddingColorPalette: newPalette });
                                            }}
                                            className="h-12 w-full p-1 rounded-lg border border-gray-300 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={config.weddingColorPalette?.[idx] || '#FFFFFF'}
                                            onChange={(e) => {
                                                const newPalette = [...(config.weddingColorPalette || Array(5).fill('#FFFFFF'))];
                                                newPalette[idx] = e.target.value;
                                                setConfig({ ...config, weddingColorPalette: newPalette });
                                            }}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent text-xs p-2 border text-gray-900 uppercase text-center"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Page Background Colors Section */}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-lg">
                    <div className="bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-xl p-6 border border-accent/20">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Page Background Colors</h2>
                        <p className="text-sm text-gray-600 mb-4">Set custom background colors for each public page on your website</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { key: 'home', label: 'Home' },
                                { key: 'about', label: 'About' },
                                { key: 'ourStory', label: 'Timeline' },
                                { key: 'weddingParty', label: 'Wedding Party' },
                                { key: 'schedule', label: 'Schedule' },
                                { key: 'photos', label: 'Photos' },
                                { key: 'rsvp', label: 'RSVP' },
                            ].map(({ key, label }) => (
                                <div key={key}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={config.pageBgColors?.[key as keyof typeof config.pageBgColors] || '#ffffff'}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                pageBgColors: {
                                                    ...config.pageBgColors,
                                                    [key]: e.target.value
                                                }
                                            })}
                                            className="h-10 w-16 p-1 rounded-lg border border-gray-300 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={config.pageBgColors?.[key as keyof typeof config.pageBgColors] || '#ffffff'}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                pageBgColors: {
                                                    ...config.pageBgColors,
                                                    [key]: e.target.value
                                                }
                                            })}
                                            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-accent focus:ring-accent text-xs p-2 border text-gray-900 uppercase"
                                        />
                                    </div>
                                    {config.weddingColorPalette && config.weddingColorPalette.length > 0 && (
                                        <div className="flex gap-1 mt-2">
                                            {config.weddingColorPalette.map((color, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => setConfig({
                                                        ...config,
                                                        pageBgColors: {
                                                            ...config.pageBgColors,
                                                            [key]: color
                                                        }
                                                    })}
                                                    className="w-6 h-6 rounded border-2 border-gray-300 hover:border-gray-900 transition-all shadow-sm hover:shadow-md"
                                                    style={{ backgroundColor: color }}
                                                    title={`Use ${color}`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-accent hover:bg-accent-dark hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all duration-300"
                    >
                        {loading ? 'Saving...' : 'Save Color Settings'}
                    </button>
                </div>
            </form>
        </div>
    );
}
