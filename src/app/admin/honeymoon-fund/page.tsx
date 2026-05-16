'use client';

import { useState, useEffect } from 'react';

interface PaymentEntry {
    handle: string;
    label: string;
}

interface FundConfig {
    enabled: boolean;
    title: string;
    subtitle: string;
    description: string;
    zelle: PaymentEntry;
    venmo: PaymentEntry;
    cashapp: PaymentEntry;
    paypal: PaymentEntry;
}

const DEFAULTS: FundConfig = {
    enabled: false,
    title: 'Honeymoon Fund',
    subtitle: 'Help us start our adventure together',
    description: "Your presence at our wedding is the greatest gift of all. But if you'd like to give a little something extra, a contribution to our honeymoon fund would mean the world to us!",
    zelle: { handle: '', label: 'Send via Zelle' },
    venmo: { handle: '', label: 'Send via Venmo' },
    cashapp: { handle: '', label: 'Send via Cash App' },
    paypal: { handle: '', label: 'Send via PayPal (Friends & Family)' },
};

export default function AdminHoneymoonFundPage() {
    const [fund, setFund] = useState<FundConfig>(DEFAULTS);
    const [bgColor, setBgColor] = useState('#ffffff');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                if (data.honeymoonFund) {
                    setFund({ ...DEFAULTS, ...data.honeymoonFund });
                }
                setBgColor(data.pageBgColors?.honeymoonFund || '#ffffff');
            })
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage('');
        try {
            const configRes = await fetch('/api/admin/site-config');
            const config = await configRes.json();

            config.honeymoonFund = fund;
            config.pageBgColors = { ...(config.pageBgColors || {}), honeymoonFund: bgColor };

            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            setMessage(res.ok ? 'Saved!' : 'Failed to save.');
        } catch {
            setMessage('An error occurred.');
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const updatePayment = (key: keyof Pick<FundConfig, 'zelle' | 'venmo' | 'cashapp' | 'paypal'>, field: keyof PaymentEntry, value: string) => {
        setFund(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

    return (
        <div className="max-w-3xl">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-1">Honeymoon Fund</h1>
                    <p className="text-gray-500">Configure your zero-fee honeymoon fund page.</p>
                </div>
                <a
                    href="/honeymoon-fund"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:text-accent-dark underline"
                >
                    View page →
                </a>
            </div>

            {/* Enable / Disable */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Enable Page</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Show the Honeymoon Fund page to visitors</p>
                    </div>
                    <button
                        onClick={() => setFund(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                            fund.enabled ? 'bg-accent' : 'bg-gray-300'
                        }`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${
                            fund.enabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
            </div>

            {/* Page Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Page Content</h2>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
                    <input
                        type="text"
                        value={fund.title}
                        onChange={e => setFund(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                        placeholder="Honeymoon Fund"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                    <input
                        type="text"
                        value={fund.subtitle}
                        onChange={e => setFund(prev => ({ ...prev, subtitle: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                        placeholder="Help us start our adventure together"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={4}
                        value={fund.description}
                        onChange={e => setFund(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                        placeholder="A heartfelt message about the fund..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Page Background Color</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="color"
                            value={bgColor}
                            onChange={e => setBgColor(e.target.value)}
                            className="h-9 w-16 rounded border border-gray-300 cursor-pointer p-0.5"
                        />
                        <input
                            type="text"
                            value={bgColor}
                            onChange={e => setBgColor(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                    </div>
                </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Payment Methods</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Leave handle blank to hide that option on the public page.</p>
                </div>

                {([
                    { key: 'zelle' as const, name: 'Zelle', icon: '🏦', placeholder: 'phone or email', hint: 'Your Zelle-linked phone or email' },
                    { key: 'venmo' as const, name: 'Venmo', icon: '💙', placeholder: '@yourhandle', hint: 'Your Venmo @username' },
                    { key: 'cashapp' as const, name: 'Cash App', icon: '💚', placeholder: '$yourcashtag', hint: 'Your Cash App $cashtag' },
                    { key: 'paypal' as const, name: 'PayPal', icon: '💛', placeholder: 'yourhandle', hint: 'Your PayPal.Me username — guests send as Friends & Family' },
                ]).map(({ key, name, icon, placeholder, hint }) => (
                    <div key={key} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">{icon}</span>
                            <h3 className="font-semibold text-gray-900">{name}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Handle / Contact</label>
                                <input
                                    type="text"
                                    value={fund[key].handle}
                                    onChange={e => updatePayment(key, 'handle', e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                                />
                                <p className="text-xs text-gray-400 mt-1">{hint}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Display Label</label>
                                <input
                                    type="text"
                                    value={fund[key].label}
                                    onChange={e => updatePayment(key, 'label', e.target.value)}
                                    placeholder="Send via ..."
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Save */}
            <div className="flex items-center gap-4">
                <button
                    onClick={save}
                    disabled={saving}
                    className="bg-accent hover:bg-accent-dark text-white px-8 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {message && (
                    <span className={`text-sm font-medium ${message === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
}
