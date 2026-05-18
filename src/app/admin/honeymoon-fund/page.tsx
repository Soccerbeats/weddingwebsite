'use client';

import { useState, useEffect } from 'react';
import type { FundItem } from '@/lib/config';

interface PaymentEntry { handle: string; label: string; }

interface FundConfig {
    enabled: boolean;
    title: string;
    subtitle: string;
    description: string;
    zelle: PaymentEntry;
    venmo: PaymentEntry;
    cashapp: PaymentEntry;
    paypal: PaymentEntry;
    items: FundItem[];
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
    items: [],
};

const BLANK_ITEM: Omit<FundItem, 'id'> = { title: '', description: '', emoji: '✈️', price: 0, funded: 0 };

function genId() { return Math.random().toString(36).slice(2, 10); }

export default function AdminHoneymoonFundPage() {
    const [fund, setFund] = useState<FundConfig>(DEFAULTS);
    const [bgColor, setBgColor] = useState('#ffffff');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [tab, setTab] = useState<'settings' | 'experiences'>('experiences');
    const [editingItem, setEditingItem] = useState<FundItem | null>(null);
    const [newItem, setNewItem] = useState<Omit<FundItem, 'id'>>(BLANK_ITEM);
    const [showAddForm, setShowAddForm] = useState(false);
    const [contributingItem, setContributingItem] = useState<FundItem | null>(null);
    const [contributionAmount, setContributionAmount] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(r => r.json())
            .then(data => {
                if (data.honeymoonFund) setFund({ ...DEFAULTS, ...data.honeymoonFund, items: data.honeymoonFund.items || [] });
                setBgColor(data.pageBgColors?.honeymoonFund || '#ffffff');
            })
            .finally(() => setLoading(false));
    }, []);

    const save = async (updatedFund?: FundConfig) => {
        setSaving(true);
        setMessage('');
        try {
            const configRes = await fetch('/api/admin/site-config');
            const config = await configRes.json();
            config.honeymoonFund = updatedFund ?? fund;
            config.pageBgColors = { ...(config.pageBgColors || {}), honeymoonFund: bgColor };
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            setMessage(res.ok ? 'Saved!' : 'Failed to save.');
        } catch { setMessage('An error occurred.'); }
        finally {
            setSaving(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const addItem = () => {
        if (!newItem.title || !newItem.price) return;
        const item: FundItem = { ...newItem, id: genId() };
        const updated = { ...fund, items: [...fund.items, item] };
        setFund(updated);
        setNewItem(BLANK_ITEM);
        setShowAddForm(false);
        save(updated);
    };

    const deleteItem = (id: string) => {
        const updated = { ...fund, items: fund.items.filter(i => i.id !== id) };
        setFund(updated);
        save(updated);
    };

    const saveEditItem = () => {
        if (!editingItem) return;
        const updated = { ...fund, items: fund.items.map(i => i.id === editingItem.id ? editingItem : i) };
        setFund(updated);
        setEditingItem(null);
        save(updated);
    };

    const logContribution = () => {
        if (!contributingItem) return;
        const amount = parseFloat(contributionAmount);
        if (!amount || isNaN(amount)) return;
        const updated = {
            ...fund,
            items: fund.items.map(i => i.id === contributingItem.id
                ? { ...i, funded: Math.min(i.price, i.funded + amount) }
                : i
            ),
        };
        setFund(updated);
        setContributingItem(null);
        setContributionAmount('');
        save(updated);
    };

    const updatePayment = (key: 'zelle' | 'venmo' | 'cashapp' | 'paypal', field: keyof PaymentEntry, value: string) => {
        setFund(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

    const totalGoal = fund.items.reduce((s, i) => s + i.price, 0);
    const totalFunded = fund.items.reduce((s, i) => s + i.funded, 0);

    return (
        <div className="max-w-4xl">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-1">Honeymoon Fund</h1>
                    <p className="text-gray-500">Build your Honeyfund-style registry.</p>
                </div>
                <div className="flex items-center gap-4">
                    {message && <span className={`text-sm font-medium ${message === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>{message}</span>}
                    <a href="/honeymoon-fund" target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-dark underline">View page →</a>
                </div>
            </div>

            {/* Enable toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex items-center justify-between">
                <div>
                    <h2 className="font-semibold text-gray-900">Page Enabled</h2>
                    <p className="text-sm text-gray-500">Show this page to visitors</p>
                </div>
                <button
                    onClick={() => setFund(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${fund.enabled ? 'bg-accent' : 'bg-gray-300'}`}
                >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${fund.enabled ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
                {(['experiences', 'settings'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* ── EXPERIENCES TAB ── */}
            {tab === 'experiences' && (
                <div>
                    {/* Stats */}
                    {fund.items.length > 0 && (
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            {[
                                { label: 'Total Goal', value: `$${totalGoal.toLocaleString()}` },
                                { label: 'Total Funded', value: `$${totalFunded.toLocaleString()}` },
                                { label: 'Progress', value: `${totalGoal > 0 ? Math.round((totalFunded / totalGoal) * 100) : 0}%` },
                            ].map(s => (
                                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                                    <p className="text-2xl font-bold text-accent">{s.value}</p>
                                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Items list */}
                    <div className="space-y-4 mb-6">
                        {fund.items.map(item => {
                            const pct = Math.min(100, item.price > 0 ? Math.round((item.funded / item.price) * 100) : 0);
                            return (
                                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                    {editingItem?.id === item.id ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Emoji</label>
                                                    <input value={editingItem.emoji} onChange={e => setEditingItem({ ...editingItem, emoji: e.target.value })}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Price ($)</label>
                                                    <input type="number" value={editingItem.price} onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600 mb-1 block">Title</label>
                                                <input value={editingItem.title} onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                                                <textarea rows={2} value={editingItem.description} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={saveEditItem} className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
                                                <button onClick={() => setEditingItem(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-4">
                                            <span className="text-3xl">{item.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <h3 className="font-bold text-gray-900">{item.title}</h3>
                                                    {pct >= 100 && <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Funded!</span>}
                                                </div>
                                                <p className="text-gray-500 text-sm mb-2">{item.description}</p>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <span className="font-semibold text-accent">${item.funded.toLocaleString()} / ${item.price.toLocaleString()}</span>
                                                    <span className="text-gray-400">{pct}%</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }} />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => { setContributingItem(item); setContributionAmount(''); }}
                                                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors">
                                                    + Log Gift
                                                </button>
                                                <button onClick={() => setEditingItem(item)}
                                                    className="text-xs bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                                    Edit
                                                </button>
                                                <button onClick={() => deleteItem(item.id)}
                                                    className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Add item */}
                    {showAddForm ? (
                        <div className="bg-white rounded-2xl border-2 border-dashed border-accent/30 p-6 space-y-4">
                            <h3 className="font-semibold text-gray-900">New Experience</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Emoji</label>
                                    <input value={newItem.emoji} onChange={e => setNewItem({ ...newItem, emoji: e.target.value })}
                                        placeholder="✈️" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Price ($)</label>
                                    <input type="number" value={newItem.price || ''} onChange={e => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })}
                                        placeholder="250" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Title</label>
                                <input value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                                    placeholder="One Night at the Resort" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                                <textarea rows={2} value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                    placeholder="Help us enjoy a beautiful night at our dream resort..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addItem} disabled={!newItem.title || !newItem.price}
                                    className="bg-accent text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                                    Add Experience
                                </button>
                                <button onClick={() => { setShowAddForm(false); setNewItem(BLANK_ITEM); }}
                                    className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg text-sm">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setShowAddForm(true)}
                            className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors text-sm font-medium">
                            + Add Experience
                        </button>
                    )}
                </div>
            )}

            {/* ── SETTINGS TAB ── */}
            {tab === 'settings' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        <h2 className="text-lg font-semibold text-gray-900">Page Content</h2>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
                            <input type="text" value={fund.title} onChange={e => setFund(p => ({ ...p, title: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Honeymoon Fund" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                            <input type="text" value={fund.subtitle} onChange={e => setFund(p => ({ ...p, subtitle: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea rows={4} value={fund.description} onChange={e => setFund(p => ({ ...p, description: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Background Color</label>
                            <div className="flex items-center gap-3">
                                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                                    className="h-9 w-16 rounded border border-gray-300 cursor-pointer p-0.5" />
                                <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 font-mono" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Payment Methods</h2>
                            <p className="text-sm text-gray-500 mt-0.5">Leave handle blank to hide on the public page.</p>
                        </div>
                        {([
                            { key: 'zelle' as const, name: 'Zelle', icon: '🏦', placeholder: 'phone or email' },
                            { key: 'venmo' as const, name: 'Venmo', icon: '💙', placeholder: '@yourhandle' },
                            { key: 'cashapp' as const, name: 'Cash App', icon: '💚', placeholder: '$yourcashtag' },
                            { key: 'paypal' as const, name: 'PayPal', icon: '💛', placeholder: 'yourhandle' },
                        ]).map(({ key, name, icon, placeholder }) => (
                            <div key={key} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xl">{icon}</span>
                                    <h3 className="font-semibold text-gray-900">{name}</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Handle</label>
                                        <input type="text" value={fund[key].handle} onChange={e => updatePayment(key, 'handle', e.target.value)}
                                            placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Display Label</label>
                                        <input type="text" value={fund[key].label} onChange={e => updatePayment(key, 'label', e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button onClick={() => save()} disabled={saving}
                        className="bg-accent hover:bg-accent-dark text-white px-8 py-3 rounded-xl font-medium transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            )}

            {/* Log contribution modal */}
            {contributingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setContributingItem(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
                        <h2 className="text-lg font-bold text-gray-900 mb-1">Log a Gift</h2>
                        <p className="text-sm text-gray-500 mb-4">{contributingItem.emoji} {contributingItem.title}</p>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount received ($)</label>
                        <input
                            type="number"
                            value={contributionAmount}
                            onChange={e => setContributionAmount(e.target.value)}
                            placeholder={`up to $${(contributingItem.price - contributingItem.funded).toLocaleString()} remaining`}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={logContribution} disabled={!contributionAmount}
                                className="flex-1 bg-accent text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                                Save
                            </button>
                            <button onClick={() => setContributingItem(null)}
                                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
