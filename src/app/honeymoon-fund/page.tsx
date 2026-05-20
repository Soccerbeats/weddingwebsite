'use client';

import { useState, useEffect } from 'react';
import type { FundItem } from '@/lib/config';

interface FundConfig {
    enabled: boolean;
    showFinancials: boolean;
    title: string;
    subtitle: string;
    description: string;
    zelle?: { handle: string; label: string };
    venmo?: { handle: string; label: string };
    cashapp?: { handle: string; label: string };
    paypal?: { handle: string; label: string };
    items?: FundItem[];
}

interface SiteData {
    brideName: string;
    groomName: string;
    honeymoonFund?: FundConfig;
    pageBgColors?: { honeymoonFund?: string };
}

function ContributeModal({ item, fund, onClose }: { item: FundItem; fund: FundConfig; onClose: () => void }) {
    const [zelleCopied, setZelleCopied] = useState(false);
    const remaining = Math.max(0, item.price - item.funded);
    const suggestedAmount = remaining > 0 ? remaining : item.price;
    const showFinancials = fund.showFinancials !== false;

    const venmoHandle = fund.venmo?.handle.replace('@', '') ?? '';
    const cashHandle = fund.cashapp?.handle ?? '';
    const cashTag = cashHandle.startsWith('$') ? cashHandle : `$${cashHandle}`;
    const paypalHandle = fund.paypal?.handle.replace('@', '') ?? '';
    const note = encodeURIComponent('Honeymoon Fund - ' + item.title);

    const methods = [
        fund.venmo?.handle && {
            name: 'Venmo',
            icon: '💙',
            handle: fund.venmo.handle,
            // Deep link opens Venmo app on mobile; falls back gracefully on desktop
            url: showFinancials
                ? `venmo://paycharge?txn=pay&recipients=${venmoHandle}&amount=${suggestedAmount}&note=${note}`
                : `venmo://paycharge?txn=pay&recipients=${venmoHandle}&note=${note}`,
            webFallback: showFinancials
                ? `https://account.venmo.com/pay?recipients=${venmoHandle}&amount=${suggestedAmount}&note=${note}`
                : `https://account.venmo.com/pay?recipients=${venmoHandle}&note=${note}`,
        },
        fund.cashapp?.handle && {
            name: 'Cash App',
            icon: '💚',
            handle: cashTag,
            // cash.app universal links open the app natively on mobile already
            url: `https://cash.app/${cashTag}`,
            webFallback: null,
        },
        fund.zelle?.handle && {
            name: 'Zelle',
            icon: '🏦',
            handle: fund.zelle.handle,
            // No public Zelle deep link — show handle to copy
            url: null,
            webFallback: null,
        },
        fund.paypal?.handle && {
            name: 'PayPal',
            icon: '💛',
            handle: fund.paypal.handle,
            // Deep link opens PayPal app on mobile
            url: showFinancials
                ? `paypal://paypalme/${paypalHandle}/${suggestedAmount}`
                : `paypal://paypalme/${paypalHandle}`,
            webFallback: showFinancials
                ? `https://www.paypal.com/paypalme/${paypalHandle}/${suggestedAmount}`
                : `https://www.paypal.com/paypalme/${paypalHandle}`,
        },
    ].filter(Boolean) as { name: string; icon: string; handle: string; url: string | null; webFallback: string | null }[];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 z-10"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>

                <div className="text-center mb-6">
                    <div className="text-4xl mb-2">{item.emoji}</div>
                    <h2 className="text-xl font-bold text-gray-900">{item.title}</h2>
                    {showFinancials && (
                        <>
                            <p className="text-accent font-semibold text-lg mt-1">${suggestedAmount.toLocaleString()}</p>
                            <p className="text-gray-500 text-sm mt-1">suggested contribution</p>
                        </>
                    )}
                </div>

                <div className="bg-green-50 rounded-xl px-4 py-3 mb-5 text-center">
                    <p className="text-green-800 text-sm font-medium">100% goes directly to us — zero fees</p>
                </div>

                <div className="space-y-3">
                    {methods.map(m => {
                        // Zelle: no deep link — just copy the handle
                        if (!m.url && !m.webFallback) {
                            return (
                                <button
                                    key={m.name}
                                    onClick={() => {
                                        navigator.clipboard.writeText(m.handle);
                                        setZelleCopied(true);
                                        setTimeout(() => setZelleCopied(false), 2500);
                                    }}
                                    className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{m.icon}</span>
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{m.name}</p>
                                            <p className="text-gray-500 text-xs font-mono">{m.handle}</p>
                                        </div>
                                    </div>
                                    <span className="text-gray-400 text-sm shrink-0">
                                        {zelleCopied ? '✓ Copied!' : 'Tap to copy'}
                                    </span>
                                </button>
                            );
                        }

                        // Deep link: try app first, fall back to web after short delay
                        const handleClick = (e: React.MouseEvent) => {
                            if (!m.webFallback) return; // Cash App uses universal links natively
                            e.preventDefault();
                            const appUrl = m.url!;
                            const webUrl = m.webFallback;
                            // Try to open the app; if it fails (no app installed), open web after 1.5s
                            const fallbackTimer = setTimeout(() => {
                                window.open(webUrl, '_blank');
                            }, 1500);
                            window.location.href = appUrl;
                            // If app opens, the page goes to background and the timer fires harmlessly
                            // (most browsers won't execute the timeout if the app takes focus)
                            // Clear on visibility change to avoid double-opening
                            const clear = () => { clearTimeout(fallbackTimer); document.removeEventListener('visibilitychange', clear); };
                            document.addEventListener('visibilitychange', clear);
                        };

                        return (
                            <a
                                key={m.name}
                                href={m.url ?? m.webFallback ?? '#'}
                                target={m.webFallback ? undefined : '_blank'}
                                rel="noopener noreferrer"
                                onClick={m.webFallback ? handleClick : undefined}
                                className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{m.icon}</span>
                                    <div className="text-left">
                                        <p className="font-semibold text-gray-900 text-sm">{m.name}</p>
                                        <p className="text-gray-500 text-xs font-mono">{m.handle}</p>
                                    </div>
                                </div>
                                <span className="text-gray-400 text-sm">Open →</span>
                            </a>
                        );
                    })}
                </div>

                <p className="text-center text-xs text-gray-400 mt-4">
                    {showFinancials
                        ? <>Send <strong>${suggestedAmount}</strong> and mention &ldquo;{item.title}&rdquo; in the note</>
                        : <>Mention &ldquo;{item.title}&rdquo; in the payment note so we know what it&rsquo;s for!</>
                    }
                </p>
            </div>
        </div>
    );
}

function ProgressBar({ funded, price }: { funded: number; price: number }) {
    const pct = Math.min(100, Math.round((funded / price) * 100));
    return (
        <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>${funded.toLocaleString()} funded</span>
                <span>{pct}% of ${price.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }}
                />
            </div>
        </div>
    );
}

export default function HoneymoonFundPage() {
    const [data, setData] = useState<SiteData | null>(null);
    const [selectedItem, setSelectedItem] = useState<FundItem | null>(null);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(r => r.json())
            .then(setData);
    }, []);

    if (!data) return null;

    const fund = data.honeymoonFund;
    const bgColor = data.pageBgColors?.honeymoonFund || '#ffffff';

    if (!fund?.enabled) {
        return (
            <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16 flex items-center justify-center">
                <p className="text-gray-400 text-lg">This page is not available right now.</p>
            </div>
        );
    }

    const items = fund.items || [];
    const totalGoal = items.reduce((s, i) => s + i.price, 0);
    const totalFunded = items.reduce((s, i) => s + i.funded, 0);
    const showFinancials = fund.showFinancials !== false;

    return (
        <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="text-center mb-12">
                    <p className="text-accent uppercase tracking-widest text-sm font-medium mb-3">
                        {data.brideName} & {data.groomName}
                    </p>
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl mb-4">
                        {fund.title || 'Honeymoon Fund'}
                    </h1>
                    {fund.subtitle && (
                        <p className="text-xl text-gray-500 italic">{fund.subtitle}</p>
                    )}
                </div>

                {/* Description */}
                {fund.description && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 text-center">
                        <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">{fund.description}</p>
                    </div>
                )}

                {/* Overall progress — only shown when financials are on */}
                {showFinancials && items.length > 0 && totalGoal > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                        <div className="flex justify-between items-end mb-2">
                            <span className="font-semibold text-gray-900">Overall Progress</span>
                            <span className="text-accent font-bold text-lg">${totalFunded.toLocaleString()} / ${totalGoal.toLocaleString()}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(100, (totalFunded / totalGoal) * 100)}%`, backgroundColor: 'var(--accent)' }}
                            />
                        </div>
                        <p className="text-sm text-gray-500 mt-2 text-right">
                            {Math.round((totalFunded / totalGoal) * 100)}% funded
                        </p>
                    </div>
                )}

                {/* Zero fees banner */}
                <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 mb-8 flex items-center gap-3">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <p className="text-green-800 text-sm font-medium">100% Goes To Us — Zero Fees. Every dollar goes directly to us with no platform cuts.</p>
                </div>

                {/* Experience items */}
                {items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
                        {items.map(item => {
                            const pct = Math.min(100, Math.round((item.funded / item.price) * 100));
                            const fullyFunded = showFinancials && pct >= 100;
                            return (
                                <div
                                    key={item.id}
                                    className={`bg-white rounded-2xl shadow-sm border p-6 flex flex-col ${fullyFunded ? 'border-green-200 opacity-75' : 'border-gray-100'}`}
                                >
                                    <div className="text-4xl mb-3">{item.emoji}</div>
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <h3 className="font-bold text-gray-900 text-lg leading-tight">{item.title}</h3>
                                        {fullyFunded && (
                                            <span className="shrink-0 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Funded!</span>
                                        )}
                                    </div>
                                    <p className="text-gray-500 text-sm leading-relaxed mb-3 flex-1">{item.description}</p>
                                    {showFinancials && (
                                        <>
                                            <p className="font-bold text-accent text-xl mb-2">${item.price.toLocaleString()}</p>
                                            <ProgressBar funded={item.funded} price={item.price} />
                                        </>
                                    )}
                                    <button
                                        onClick={() => !fullyFunded && setSelectedItem(item)}
                                        disabled={fullyFunded}
                                        className={`mt-4 w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                                            fullyFunded
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : 'bg-accent hover:bg-accent-dark text-white'
                                        }`}
                                    >
                                        {fullyFunded ? 'Fully Funded' : 'Contribute'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-5xl mb-4">✈️</p>
                        <p className="text-lg">Experiences coming soon!</p>
                    </div>
                )}

                {/* Thank you */}
                <div className="text-center">
                    <p className="font-serif text-2xl italic text-gray-700 mb-2">Thank you from the bottom of our hearts.</p>
                    <p className="text-sm text-gray-400">Your love and generosity mean everything to us as we begin this new chapter.</p>
                </div>
            </div>

            {selectedItem && (
                <ContributeModal
                    item={selectedItem}
                    fund={fund}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
}
