'use client';

import { useState, useEffect, useRef } from 'react';
import type { FundItem } from '@/lib/config';
import type { RegistryItem } from '@/app/api/admin/registry-items/route';

interface PaymentEntry { handle: string; label: string; }

interface FundConfig {
    enabled: boolean;
    showFinancials: boolean;
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
    showFinancials: true,
    title: 'Registry',
    subtitle: 'Help us start our adventure together',
    description: "Your presence at our wedding is the greatest gift of all. But if you'd like to give a little something extra, a contribution to our registry would mean the world to us!",
    zelle: { handle: '', label: 'Send via Zelle' },
    venmo: { handle: '', label: 'Send via Venmo' },
    cashapp: { handle: '', label: 'Send via Cash App' },
    paypal: { handle: '', label: 'Send via PayPal (Friends & Family)' },
    items: [],
};

const BLANK_ITEM: Omit<FundItem, 'id'> = { title: '', description: '', emoji: '✈️', price: 0, funded: 0 };

function genId() { return Math.random().toString(36).slice(2, 10); }

export default function AdminRegistryPage() {
    const [fund, setFund] = useState<FundConfig>(DEFAULTS);
    const [bgColor, setBgColor] = useState('#ffffff');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [tab, setTab] = useState<'settings' | 'experiences' | 'registry'>('experiences');
    const [registryItems, setRegistryItems] = useState<RegistryItem[]>([]);
    const [urlInput, setUrlInput] = useState('');
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [pendingItem, setPendingItem] = useState<Partial<RegistryItem> | null>(null);
    const [editingRegItem, setEditingRegItem] = useState<RegistryItem | null>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const [editingItem, setEditingItem] = useState<FundItem | null>(null);
    const [newItem, setNewItem] = useState<Omit<FundItem, 'id'>>(BLANK_ITEM);
    const [showAddForm, setShowAddForm] = useState(false);
    const [contributingItem, setContributingItem] = useState<FundItem | null>(null);
    const [contributionAmount, setContributionAmount] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const [targetImporting, setTargetImporting] = useState(false);
    const [targetImportResult, setTargetImportResult] = useState<{ added: number; skipped: number } | null>(null);
    const [showTargetBookmarklet, setShowTargetBookmarklet] = useState(false);
    const targetCsvRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(r => r.json())
            .then(data => {
                if (data.registry) setFund({ ...DEFAULTS, ...data.registry, items: data.registry.items || [] });
                setBgColor(data.pageBgColors?.registry || '#ffffff');
            })
            .finally(() => setLoading(false));
        fetch('/api/admin/registry-items')
            .then(r => r.json())
            .then(items => setRegistryItems(Array.isArray(items) ? items : []));
    }, []);

    const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        try {
            const text = await file.text();
            const res = await fetch('/api/admin/registry-items/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: text }),
            });
            const data = await res.json();
            if (data.success) {
                setImportResult({ added: data.added, skipped: data.skipped });
                // Refresh item list
                const items = await fetch('/api/admin/registry-items').then(r => r.json());
                setRegistryItems(Array.isArray(items) ? items : []);
            } else {
                setImportResult({ added: 0, skipped: -1 });
                alert(data.error || 'Import failed.');
            }
        } catch {
            alert('Failed to read CSV file.');
        } finally {
            setImporting(false);
            // Reset file input so same file can be re-selected
            if (csvInputRef.current) csvInputRef.current.value = '';
        }
    };

    const handleTargetCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setTargetImporting(true);
        setTargetImportResult(null);
        try {
            const text = await file.text();
            const res = await fetch('/api/admin/registry-items/import-target', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: text }),
            });
            const data = await res.json();
            if (data.success) {
                setTargetImportResult({ added: data.added, skipped: data.skipped });
                const items = await fetch('/api/admin/registry-items').then(r => r.json());
                setRegistryItems(Array.isArray(items) ? items : []);
            } else {
                alert(data.error || 'Import failed.');
            }
        } catch {
            alert('Failed to read CSV file.');
        } finally {
            setTargetImporting(false);
            if (targetCsvRef.current) targetCsvRef.current.value = '';
        }
    };

    const fetchMeta = async () => {
        if (!urlInput.trim()) return;
        setFetching(true);
        setFetchError('');
        setPendingItem(null);
        try {
            const res = await fetch('/api/admin/fetch-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput.trim() }),
            });
            const data = await res.json();
            setPendingItem({
                id: Math.random().toString(36).slice(2, 10),
                store: data.store || 'other',
                title: data.title || '',
                description: data.description || '',
                image: data.image || '',
                price: data.price || '',
                url: urlInput.trim(),
            });
            if (!data.success) setFetchError(data.error || 'Could not auto-fetch — fill in manually below.');
        } catch {
            setFetchError('Network error fetching URL.');
            setPendingItem({ id: Math.random().toString(36).slice(2, 10), store: 'other', title: '', description: '', image: '', price: '', url: urlInput.trim() });
        } finally {
            setFetching(false);
        }
    };

    const saveRegistryItem = async (item: RegistryItem) => {
        const res = await fetch('/api/admin/registry-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (res.ok) {
            setRegistryItems(prev => [...prev, item]);
            setPendingItem(null);
            setUrlInput('');
            setFetchError('');
        }
    };

    const updateRegistryItem = async (item: RegistryItem) => {
        const res = await fetch('/api/admin/registry-items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (res.ok) {
            setRegistryItems(prev => prev.map(i => i.id === item.id ? item : i));
            setEditingRegItem(null);
        }
    };

    const deleteRegistryItem = async (id: string) => {
        const res = await fetch('/api/admin/registry-items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        if (res.ok) setRegistryItems(prev => prev.filter(i => i.id !== id));
    };

    const save = async (updatedFund?: FundConfig) => {
        setSaving(true);
        setMessage('');
        try {
            const configRes = await fetch('/api/admin/site-config');
            const config = await configRes.json();
            config.registry = updatedFund ?? fund;
            config.pageBgColors = { ...(config.pageBgColors || {}), registry: bgColor };
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
                    <h1 className="text-3xl font-bold mb-1">Registry</h1>
                    <p className="text-gray-500">Build your Honeyfund-style registry.</p>
                </div>
                <div className="flex items-center gap-4">
                    {message && <span className={`text-sm font-medium ${message === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>{message}</span>}
                    <a href="/registry" target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-dark underline">View page →</a>
                </div>
            </div>

            {/* Enable toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-3 flex items-center justify-between">
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

            {/* Show financials toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex items-center justify-between">
                <div>
                    <h2 className="font-semibold text-gray-900">Show Financial Details</h2>
                    <p className="text-sm text-gray-500">Display prices, progress bars, and funding amounts to guests</p>
                </div>
                <button
                    onClick={() => { const updated = { ...fund, showFinancials: !fund.showFinancials }; setFund(updated); save(updated); }}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${fund.showFinancials !== false ? 'bg-accent' : 'bg-gray-300'}`}
                >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${fund.showFinancials !== false ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
                {([
                    { key: 'experiences', label: 'Honeymoon Fund' },
                    { key: 'registry', label: 'Registry Items' },
                    { key: 'settings', label: 'Settings' },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {t.label}
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

            {/* ── REGISTRY ITEMS TAB ── */}
            {tab === 'registry' && (
                <div>
                    <p className="text-sm text-gray-500 mb-6">Paste a product URL from Target or Amazon and we&apos;ll pull in the details automatically. You can edit anything before saving.</p>

                    {/* Amazon CSV import */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                                    📦 Import from Amazon Registry CSV
                                </h3>
                                <p className="text-xs text-amber-700 mt-1">
                                    On Amazon, go to your registry → <strong>Manage</strong> → <strong>Download list as spreadsheet (.csv)</strong>. Then upload it here — every item imports individually.
                                </p>
                                {importResult && (
                                    <p className={`text-xs mt-2 font-medium ${importResult.added > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                                        ✓ {importResult.added} item{importResult.added !== 1 ? 's' : ''} added
                                        {importResult.skipped > 0 ? `, ${importResult.skipped} skipped (already exist)` : ''}
                                    </p>
                                )}
                            </div>
                            <div className="shrink-0">
                                <input
                                    ref={csvInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={handleCsvImport}
                                />
                                <button
                                    onClick={() => csvInputRef.current?.click()}
                                    disabled={importing}
                                    className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                    {importing ? 'Importing…' : 'Upload CSV'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Target import */}
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-red-900 flex items-center gap-2">
                                    🎯 Import from Target Registry
                                </h3>
                                <p className="text-xs text-red-700 mt-1">
                                    Target doesn&apos;t offer a native export, so use the bookmarklet below.
                                    Run it on your Target registry page — it downloads a CSV automatically.
                                </p>

                                {/* Bookmarklet section */}
                                <div className="mt-3">
                                    <button
                                        onClick={() => setShowTargetBookmarklet(v => !v)}
                                        className="text-xs text-red-700 underline font-medium"
                                    >
                                        {showTargetBookmarklet ? 'Hide' : 'Show'} bookmarklet instructions →
                                    </button>

                                    {showTargetBookmarklet && (
                                        <div className="mt-3 space-y-3">
                                            <p className="text-xs text-red-800 font-medium">Step 1 — Add the bookmarklet to your browser:</p>
                                            <p className="text-xs text-red-700">
                                                Drag this link to your bookmarks bar, or right-click → Bookmark this link:
                                            </p>
                                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                                            <a
                                                href={`javascript:(function(){var items=[];document.querySelectorAll('[data-test="registry-item"]').forEach(function(el){var title=(el.querySelector('[data-test="product-title"]')||el.querySelector('a[href*="/p/"]')||{}).textContent||'';var price=(el.querySelector('[data-test="current-price"]')||el.querySelector('[data-test="reg-price"]')||{}).textContent||'';var img=(el.querySelector('img')||{}).src||'';var link=el.querySelector('a[href*="/p/"]');var url=link?'https://www.target.com'+link.getAttribute('href'):'';if(title.trim())items.push({title:title.trim(),price:price.trim(),image:img,url:url});});if(!items.length){alert('No items found. Make sure you are on your Target registry page with items visible.');return;}var csv='title,price,image,url\\n'+items.map(function(i){return[i.title,i.price,i.image,i.url].map(function(v){return'"'+v.replace(/"/g,'""')+'"';}).join(',');}).join('\\n');var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='target-registry.csv';a.click();alert('Downloaded '+items.length+' items. Upload the CSV file in the admin panel.');})();`}
                                                className="inline-block bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-grab"
                                                onClick={e => e.preventDefault()}
                                            >
                                                🎯 Export Target Registry
                                            </a>
                                            <p className="text-xs text-red-800 font-medium">Step 2 — Run it on Target:</p>
                                            <ol className="text-xs text-red-700 list-decimal list-inside space-y-1">
                                                <li>Go to <strong>target.com</strong> → your registry → <strong>Manage registry</strong></li>
                                                <li>Scroll down so all your items are loaded on the page</li>
                                                <li>Click the <strong>&ldquo;🎯 Export Target Registry&rdquo;</strong> bookmark</li>
                                                <li>A <code>target-registry.csv</code> file will download automatically</li>
                                            </ol>
                                            <p className="text-xs text-red-800 font-medium">Step 3 — Upload it here:</p>
                                        </div>
                                    )}
                                </div>

                                {targetImportResult && (
                                    <p className={`text-xs mt-2 font-medium ${targetImportResult.added > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                                        ✓ {targetImportResult.added} item{targetImportResult.added !== 1 ? 's' : ''} added
                                        {targetImportResult.skipped > 0 ? `, ${targetImportResult.skipped} skipped (already exist)` : ''}
                                    </p>
                                )}
                            </div>

                            <div className="shrink-0">
                                <input
                                    ref={targetCsvRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={handleTargetCsvImport}
                                />
                                <button
                                    onClick={() => targetCsvRef.current?.click()}
                                    disabled={targetImporting}
                                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                    {targetImporting ? 'Importing…' : 'Upload CSV'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* URL fetch bar */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Add item from URL</label>
                        <div className="flex gap-2">
                            <input
                                ref={urlInputRef}
                                type="url"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && fetchMeta()}
                                placeholder="https://www.target.com/p/..."
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                disabled={fetching}
                            />
                            <button
                                onClick={fetchMeta}
                                disabled={fetching || !urlInput.trim()}
                                className="bg-accent text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 shrink-0"
                            >
                                {fetching ? 'Fetching…' : 'Fetch →'}
                            </button>
                        </div>
                        {fetchError && <p className="text-amber-600 text-xs mt-2">⚠️ {fetchError}</p>}
                    </div>

                    {/* Pending item preview / edit form */}
                    {pendingItem && (
                        <div className="bg-white rounded-2xl border-2 border-accent/30 shadow-sm p-5 mb-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Review &amp; Save</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Image preview */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                                    <input
                                        type="text"
                                        value={pendingItem.image || ''}
                                        onChange={e => setPendingItem(p => p ? { ...p, image: e.target.value } : p)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs mb-2"
                                        placeholder="https://..."
                                    />
                                    {pendingItem.image && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={pendingItem.image} alt="" className="w-full h-40 object-contain rounded-lg border border-gray-100 bg-gray-50" />
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Store</label>
                                        <select
                                            value={pendingItem.store || 'other'}
                                            onChange={e => setPendingItem(p => p ? { ...p, store: e.target.value as RegistryItem['store'] } : p)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="target">Target</option>
                                            <option value="amazon">Amazon</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                        <input
                                            type="text"
                                            value={pendingItem.title || ''}
                                            onChange={e => setPendingItem(p => p ? { ...p, title: e.target.value } : p)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Price (display only)</label>
                                        <input
                                            type="text"
                                            value={pendingItem.price || ''}
                                            onChange={e => setPendingItem(p => p ? { ...p, price: e.target.value } : p)}
                                            placeholder="$29.99"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                <textarea
                                    rows={2}
                                    value={pendingItem.description || ''}
                                    onChange={e => setPendingItem(p => p ? { ...p, description: e.target.value } : p)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                                />
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => pendingItem.title && saveRegistryItem(pendingItem as RegistryItem)}
                                    disabled={!pendingItem.title}
                                    className="bg-accent text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                                >
                                    Save Item
                                </button>
                                <button
                                    onClick={() => { setPendingItem(null); setUrlInput(''); setFetchError(''); }}
                                    className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Saved items list */}
                    {registryItems.length === 0 && !pendingItem && (
                        <div className="text-center py-16 text-gray-400">
                            <p className="text-4xl mb-3">🛍️</p>
                            <p className="text-sm">No registry items yet — paste a URL above to add your first item.</p>
                        </div>
                    )}

                    {['target', 'amazon', 'other'].map(store => {
                        const storeItems = registryItems.filter(i => i.store === store);
                        if (storeItems.length === 0) return null;
                        const storeLabel = store === 'target' ? '🎯 Target' : store === 'amazon' ? '📦 Amazon' : '🛍️ Other';
                        return (
                            <div key={store} className="mb-8">
                                <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider mb-3">{storeLabel}</h3>
                                <div className="space-y-3">
                                    {storeItems.map(item => (
                                        <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                            {editingRegItem?.id === item.id ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                                                        <input type="text" value={editingRegItem.image}
                                                            onChange={e => setEditingRegItem(p => p ? { ...p, image: e.target.value } : p)}
                                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs mb-2" />
                                                        {editingRegItem.image && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={editingRegItem.image} alt="" className="w-full h-32 object-contain rounded-lg border border-gray-100 bg-gray-50" />
                                                        )}
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                                            <input type="text" value={editingRegItem.title}
                                                                onChange={e => setEditingRegItem(p => p ? { ...p, title: e.target.value } : p)}
                                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
                                                            <input type="text" value={editingRegItem.price}
                                                                onChange={e => setEditingRegItem(p => p ? { ...p, price: e.target.value } : p)}
                                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                                            <textarea rows={2} value={editingRegItem.description}
                                                                onChange={e => setEditingRegItem(p => p ? { ...p, description: e.target.value } : p)}
                                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
                                                        </div>
                                                    </div>
                                                    <div className="sm:col-span-2 flex gap-2">
                                                        <button onClick={() => updateRegistryItem(editingRegItem)} className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
                                                        <button onClick={() => setEditingRegItem(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-4">
                                                    {item.image
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        ? <img src={item.image} alt={item.title} className="w-16 h-16 object-contain rounded-lg border border-gray-100 bg-gray-50 shrink-0" />
                                                        : <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl shrink-0">🛍️</div>
                                                    }
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-gray-900 text-sm truncate">{item.title}</p>
                                                        {item.price && <p className="text-accent font-medium text-sm">{item.price}</p>}
                                                        <p className="text-gray-400 text-xs truncate mt-0.5">{item.description}</p>
                                                    </div>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button onClick={() => setEditingRegItem(item)}
                                                            className="text-xs bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                                            Edit
                                                        </button>
                                                        <button onClick={() => deleteRegistryItem(item.id)}
                                                            className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
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
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Registry" />
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
