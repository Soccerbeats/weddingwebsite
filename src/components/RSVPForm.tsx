'use client';

import { useState, useEffect } from 'react';

interface PartyMember {
    name: string | null;
}

interface MemberCard {
    name: string;           // resolved display name (may be empty string for unknowns the guest must fill in)
    nameEditable: boolean;  // true when admin left this slot unnamed
    attending: boolean;
    vegetarian: boolean;
    vegan: boolean;
    gluten_free: boolean;
    nut_allergy: boolean;
}

function buildCards(primaryName: string, partyMembers: PartyMember[], existingDietary: any[]): MemberCard[] {
    const totalSlots = 1 + partyMembers.length;
    return Array.from({ length: totalSlots }, (_, i) => {
        const isFirst = i === 0;
        const slot = isFirst ? null : partyMembers[i - 1];
        const knownName = isFirst ? primaryName : (slot?.name ?? null);
        const existing = existingDietary.find(d => d.name === knownName) || null;
        return {
            name: knownName ?? '',
            nameEditable: !isFirst && !knownName,
            attending: isFirst ? true : (existing ? true : false),
            vegetarian: existing?.vegetarian ?? false,
            vegan: existing?.vegan ?? false,
            gluten_free: existing?.gluten_free ?? false,
            nut_allergy: existing?.nut_allergy ?? false,
        };
    });
}

export default function RSVPForm() {
    const [step, setStep] = useState<'verification' | 'form'>('verification');
    const [verifiedGuest, setVerifiedGuest] = useState<any>(null);
    const [existingRsvp, setExistingRsvp] = useState<any>(null);
    const [guestNameInput, setGuestNameInput] = useState('');
    const [verificationError, setVerificationError] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [config, setConfig] = useState<any>(null);

    const [formData, setFormData] = useState({
        guestName: '',
        email: '',
        phone: '',
        attending: 'yes',
        message: '',
    });

    const [cards, setCards] = useState<MemberCard[]>([]);
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(err => console.error('Error fetching config:', err));
    }, []);

    const handleVerification = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifying(true);
        setVerificationError('');

        try {
            const response = await fetch('/api/guest-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guest_name: guestNameInput }),
            });

            const data = await response.json();

            if (data.verified) {
                setVerifiedGuest(data.guest);
                setExistingRsvp(data.existingRsvp);

                const existingDietary = Array.isArray(data.existingRsvp?.dietaryRestrictions)
                    ? data.existingRsvp.dietaryRestrictions
                    : [];

                setCards(buildCards(data.guest.name, data.guest.party_members || [], existingDietary));

                setFormData({
                    guestName: data.guest.name,
                    email: data.existingRsvp?.email || data.guest.email || '',
                    phone: data.existingRsvp?.phone || data.guest.phone || '',
                    attending: data.existingRsvp ? (data.existingRsvp.attending ? 'yes' : 'no') : 'yes',
                    message: data.existingRsvp?.message || '',
                });

                setStep('form');
            } else {
                setVerificationError(data.message || 'Guest not found on the list.');
            }
        } catch (error) {
            console.error('Verification error:', error);
            setVerificationError('Error verifying guest. Please try again.');
        } finally {
            setVerifying(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const updateCard = (index: number, patch: Partial<MemberCard>) => {
        setCards(prev => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate: unnamed attending guests must have a name filled in
        if (formData.attending === 'yes') {
            for (let i = 0; i < cards.length; i++) {
                if (cards[i].attending && cards[i].nameEditable && !cards[i].name.trim()) {
                    setErrorMessage(`Please enter a name for Guest ${i + 1} before submitting.`);
                    setStatus('error');
                    return;
                }
            }
        }

        setStatus('submitting');
        setErrorMessage('');

        const attendingCards = formData.attending === 'yes' ? cards.filter(c => c.attending) : [];
        const guestCount = attendingCards.length;
        const dietaryRestrictions = attendingCards.map(c => ({
            name: c.name,
            vegetarian: c.vegetarian,
            vegan: c.vegan,
            gluten_free: c.gluten_free,
            nut_allergy: c.nut_allergy,
        }));

        try {
            const isUpdate = existingRsvp !== null;
            const response = await fetch('/api/rsvp', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    ...(isUpdate ? { id: existingRsvp.id } : {}),
                    attending: formData.attending === 'yes',
                    guestCount,
                    dietaryRestrictions,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to submit RSVP');
            }

            setStatus('success');
        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setErrorMessage(error.message || 'Something went wrong. Please try again later.');
        }
    };

    if (status === 'success') {
        return (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 p-8">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">RSVP {existingRsvp ? 'Updated' : 'Received'}!</h3>
                <p className="mt-2 text-base text-gray-500">
                    Thank you for letting us know. We&apos;ve sent a confirmation to the happy couple♥
                </p>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                        Need to make changes? Simply refresh this page and enter your name again to update your RSVP.
                    </p>
                </div>
            </div>
        );
    }

    if (step === 'verification') {
        return (
            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-serif text-gray-900 mb-2">Welcome!</h2>
                    <p className="text-gray-600">Please enter your name as it appears on your invitation to begin.</p>
                </div>

                <form onSubmit={handleVerification} className="space-y-6">
                    <div>
                        <label htmlFor="guestNameInput" className="block text-sm font-medium text-gray-700 ml-1 mb-2">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            id="guestNameInput"
                            value={guestNameInput}
                            onChange={(e) => setGuestNameInput(e.target.value)}
                            placeholder="Enter your full name"
                            required
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>

                    {verificationError && (
                        <div className="rounded-2xl bg-red-50 p-4 flex gap-3">
                            <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm font-medium text-red-800">{verificationError}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={verifying || !guestNameInput.trim()}
                        className="w-full flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                    >
                        {verifying ? 'Verifying...' : 'Continue'}
                    </button>
                </form>
            </div>
        );
    }

    const partyNames = verifiedGuest?.party_members?.map((m: PartyMember, i: number) => m.name || `Guest ${i + 2}`).join(', ');

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
            {/* Welcome banner */}
            <div className={`border rounded-2xl p-4 ${existingRsvp ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex gap-3">
                    <svg className={`h-5 w-5 flex-shrink-0 mt-0.5 ${existingRsvp ? 'text-blue-400' : 'text-green-400'}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <p className={`text-sm font-medium ${existingRsvp ? 'text-blue-800' : 'text-green-800'}`}>
                            Welcome{existingRsvp ? ' back' : ''}, {verifiedGuest?.name}{partyNames ? ` & party` : ''}!
                        </p>
                        <p className={`text-sm mt-1 ${existingRsvp ? 'text-blue-700' : 'text-green-700'}`}>
                            {existingRsvp ? 'You can update your RSVP below.' : 'Please complete your RSVP below.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">Email *</label>
                    <input
                        type="email" name="email" id="email" required
                        value={formData.email} onChange={handleChange}
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                    />
                </div>
                <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 ml-1">Phone</label>
                    <input
                        type="tel" name="phone" id="phone"
                        value={formData.phone} onChange={handleChange}
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                    />
                </div>
                <div>
                    <label htmlFor="attending" className="block text-sm font-medium text-gray-700 ml-1">Will you be attending? *</label>
                    <select
                        id="attending" name="attending" required
                        value={formData.attending} onChange={handleChange}
                        className="mt-1 block w-full pl-4 pr-10 py-3 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm rounded-2xl transition-shadow"
                    >
                        <option value="yes">Joyfully Accepts</option>
                        <option value="no">Regretfully Declines</option>
                    </select>
                </div>
            </div>

            {/* Per-member cards */}
            {formData.attending === 'yes' && cards.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Your Party</h3>
                    <div className="space-y-3">
                        {cards.map((card, i) => {
                            const isFirst = i === 0;
                            return (
                                <div
                                    key={i}
                                    className={`border rounded-2xl p-4 transition-colors ${
                                        card.attending
                                            ? 'bg-white border-gray-200'
                                            : 'bg-gray-50 border-gray-100 opacity-60'
                                    }`}
                                >
                                    {/* Card header: name + attending toggle */}
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <div className="flex-1">
                                            {card.nameEditable ? (
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">
                                                        Guest {i + 1} name <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={card.name}
                                                        onChange={(e) => updateCard(i, { name: e.target.value })}
                                                        placeholder="Enter guest name"
                                                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-accent focus:border-accent"
                                                    />
                                                </div>
                                            ) : (
                                                <p className="text-sm font-semibold text-gray-800">{card.name}</p>
                                            )}
                                        </div>
                                        {/* Attending toggle — primary guest is locked on */}
                                        {isFirst ? (
                                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full whitespace-nowrap">Attending</span>
                                        ) : (
                                            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                                                <input
                                                    type="checkbox"
                                                    checked={card.attending}
                                                    onChange={(e) => updateCard(i, { attending: e.target.checked })}
                                                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                                <span className="text-sm text-gray-600">Attending</span>
                                            </label>
                                        )}
                                    </div>

                                    {/* Dietary checkboxes — only when attending */}
                                    {card.attending && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-2">Dietary restrictions</p>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {([
                                                    { field: 'vegetarian', label: 'Vegetarian' },
                                                    { field: 'vegan', label: 'Vegan' },
                                                    { field: 'gluten_free', label: 'Gluten Free' },
                                                    { field: 'nut_allergy', label: 'Nut Allergy' },
                                                ] as { field: keyof Pick<MemberCard, 'vegetarian' | 'vegan' | 'gluten_free' | 'nut_allergy'>; label: string }[]).map(({ field, label }) => (
                                                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={card[field]}
                                                            onChange={(e) => updateCard(i, { [field]: e.target.checked })}
                                                            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                        />
                                                        <span className="text-sm text-gray-700">{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Message */}
            <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 ml-1">
                    Message for {config?.brideName || 'Bride'} & {config?.groomName || 'Groom'}♥
                </label>
                <textarea
                    id="message" name="message" rows={3}
                    value={formData.message} onChange={handleChange}
                    className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                />
            </div>

            {status === 'error' && (
                <div className="rounded-2xl bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{errorMessage}</p>
                </div>
            )}

            <div className="flex gap-4">
                <button
                    type="button"
                    onClick={() => { setStep('verification'); setGuestNameInput(''); setVerificationError(''); }}
                    className="flex justify-center py-3 px-6 border border-gray-300 rounded-full shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                >
                    Back
                </button>
                <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="flex-1 flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                >
                    {status === 'submitting'
                        ? (existingRsvp ? 'Updating...' : 'Sending...')
                        : (existingRsvp ? 'Update RSVP' : 'Send RSVP')}
                </button>
            </div>
        </form>
    );
}
