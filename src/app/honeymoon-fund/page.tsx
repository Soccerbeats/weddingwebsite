import { getSiteConfig } from '@/lib/config';

function QRCode({ value, label }: { value: string; label: string }) {
    const encoded = encodeURIComponent(value);
    return (
        <div className="flex flex-col items-center gap-2">
            <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encoded}`}
                alt={`QR code for ${label}`}
                width={150}
                height={150}
                className="rounded-lg shadow"
            />
            <span className="text-xs text-gray-500">{label}</span>
        </div>
    );
}

interface PaymentMethod {
    key: string;
    name: string;
    icon: string;
    color: string;
    handle: string;
    label: string;
    deepLinkFn: (h: string) => string;
    qrValueFn: (h: string) => string;
}

export default function HoneymoonFundPage() {
    const config = getSiteConfig();
    const fund = config.honeymoonFund;
    const bgColor = config.pageBgColors?.honeymoonFund || '#ffffff';

    if (!fund?.enabled) {
        return (
            <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16 flex items-center justify-center">
                <p className="text-gray-500 text-lg">This page is not available right now.</p>
            </div>
        );
    }

    const paymentMethods: PaymentMethod[] = ([
        {
            key: 'zelle',
            name: 'Zelle',
            icon: '🏦',
            color: 'bg-purple-50 border-purple-200',
            handle: fund.zelle?.handle || '',
            label: fund.zelle?.label || 'Send via Zelle',
            deepLinkFn: (_h: string) => 'https://www.zellepay.com',
            qrValueFn: (h: string) => h,
        },
        {
            key: 'venmo',
            name: 'Venmo',
            icon: '💙',
            color: 'bg-blue-50 border-blue-200',
            handle: fund.venmo?.handle || '',
            label: fund.venmo?.label || 'Send via Venmo',
            deepLinkFn: (h: string) => `https://venmo.com/${h.replace('@', '')}`,
            qrValueFn: (h: string) => `https://venmo.com/${h.replace('@', '')}`,
        },
        {
            key: 'cashapp',
            name: 'Cash App',
            icon: '💚',
            color: 'bg-green-50 border-green-200',
            handle: fund.cashapp?.handle || '',
            label: fund.cashapp?.label || 'Send via Cash App',
            deepLinkFn: (h: string) => `https://cash.app/${h.startsWith('$') ? h : '$' + h}`,
            qrValueFn: (h: string) => `https://cash.app/${h.startsWith('$') ? h : '$' + h}`,
        },
        {
            key: 'paypal',
            name: 'PayPal',
            icon: '💛',
            color: 'bg-yellow-50 border-yellow-200',
            handle: fund.paypal?.handle || '',
            label: fund.paypal?.label || 'Send via PayPal (Friends & Family)',
            deepLinkFn: (h: string) => `https://www.paypal.com/paypalme/${h.replace('@', '')}`,
            qrValueFn: (h: string) => `https://www.paypal.com/paypalme/${h.replace('@', '')}`,
        },
    ] as PaymentMethod[]).filter(m => m.handle);

    return (
        <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-12">
                    <p className="text-accent uppercase tracking-widest text-sm font-medium mb-3">
                        {config.brideName} & {config.groomName}
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
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-10 text-center">
                        <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">
                            {fund.description}
                        </p>
                    </div>
                )}

                {/* Zero Fees Notice */}
                <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 mb-10 flex items-center gap-3">
                    <span className="text-2xl">✓</span>
                    <div>
                        <p className="font-semibold text-green-900 text-sm">100% Goes To Us — Zero Fees</p>
                        <p className="text-green-800 text-sm">Every dollar you send comes directly to us with no platform fees deducted.</p>
                    </div>
                </div>

                {/* Payment Methods */}
                {paymentMethods.length > 0 ? (
                    <div className="space-y-6">
                        {paymentMethods.map((method) => (
                            <div
                                key={method.key}
                                className={`rounded-2xl border-2 p-6 ${method.color}`}
                            >
                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                    <div className="flex-1 text-center sm:text-left">
                                        <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                                            <span className="text-2xl">{method.icon}</span>
                                            <h2 className="text-xl font-bold text-gray-900">{method.name}</h2>
                                        </div>
                                        <p className="text-gray-600 text-sm mb-3">{method.label}</p>
                                        <div className="inline-block bg-white rounded-lg px-4 py-2 font-mono text-lg font-semibold text-gray-900 shadow-sm border border-gray-200 mb-4">
                                            {method.handle}
                                        </div>
                                        <div className="block">
                                            <a
                                                href={method.deepLinkFn(method.handle)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-block bg-accent text-white px-6 py-2 rounded-lg font-medium hover:bg-accent-dark transition-colors text-sm"
                                            >
                                                Open {method.name}
                                            </a>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <QRCode
                                            value={method.qrValueFn(method.handle)}
                                            label="Scan to open"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-400">
                        <p>Payment options coming soon!</p>
                    </div>
                )}

                {/* Thank you note */}
                <div className="mt-12 text-center text-gray-500">
                    <p className="font-serif text-xl italic text-gray-700 mb-2">
                        Thank you from the bottom of our hearts.
                    </p>
                    <p className="text-sm">
                        Your love and generosity mean everything to us as we start this new chapter together.
                    </p>
                </div>
            </div>
        </div>
    );
}
