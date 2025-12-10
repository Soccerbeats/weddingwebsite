'use client';

import { useState, useEffect } from 'react';

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
        guestCount: 1,
        dietaryRestrictions: '',
        message: ''
    });

    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        // Fetch site config for bride/groom names
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

                // If existing RSVP, populate with that data; otherwise use guest data
                if (data.existingRsvp) {
                    setFormData(prev => ({
                        ...prev,
                        guestName: data.guest.name,
                        email: data.existingRsvp.email || '',
                        phone: data.existingRsvp.phone || '',
                        attending: data.existingRsvp.attending ? 'yes' : 'no',
                        guestCount: data.existingRsvp.guestCount || 1,
                        dietaryRestrictions: data.existingRsvp.dietaryRestrictions || '',
                        message: data.existingRsvp.message || '',
                    }));
                } else {
                    setFormData(prev => ({
                        ...prev,
                        guestName: data.guest.name,
                        email: data.guest.email || '',
                        phone: data.guest.phone || '',
                        guestCount: data.guest.party_size || 1,
                    }));
                }
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
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');
        setErrorMessage('');

        try {
            const isUpdate = existingRsvp !== null;
            const response = await fetch('/api/rsvp', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    ...(isUpdate ? { id: existingRsvp.id } : {}),
                    attending: formData.attending === 'yes',
                    guestCount: parseInt(formData.guestCount.toString())
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit RSVP');
            }

            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage('Something went wrong. Please try again later.');
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
                <h3 className="text-lg leading-6 font-medium text-gray-900">RSVP Received!</h3>
                <p className="mt-2 text-base text-gray-500">
                    Thank you for letting us know. We've sent a confirmation email to the happy couple♥
                </p>
            </div>
        );
    }

    // Step 1: Name Verification
    if (step === 'verification') {
        return (
            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-serif text-gray-900 mb-2">
                        Welcome!
                    </h2>
                    <p className="text-gray-600">
                        Please enter your name as it appears on your invitation to begin.
                    </p>
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
                        <div className="rounded-2xl bg-red-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">
                                        {verificationError}
                                    </h3>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={verifying || !guestNameInput.trim()}
                            className="w-full flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                        >
                            {verifying ? 'Verifying...' : 'Continue'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // Step 2: RSVP Form
    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
            <div className={`border rounded-2xl p-4 mb-6 ${existingRsvp ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className={`h-5 w-5 ${existingRsvp ? 'text-blue-400' : 'text-green-400'}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className={`text-sm font-medium ${existingRsvp ? 'text-blue-800' : 'text-green-800'}`}>
                            Welcome{existingRsvp ? ' back' : ''}, {verifiedGuest?.name}{verifiedGuest?.plus_one_name && ` & ${verifiedGuest.plus_one_name}`}!
                        </p>
                        <p className={`text-sm mt-1 ${existingRsvp ? 'text-blue-700' : 'text-green-700'}`}>
                            {existingRsvp ? 'You can update your RSVP below.' : 'Please complete your RSVP below.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">
                        Email *
                    </label>
                    <div className="mt-1">
                        <input
                            type="email"
                            name="email"
                            id="email"
                            required
                            value={formData.email}
                            onChange={handleChange}
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 ml-1">
                        Phone
                    </label>
                    <div className="mt-1">
                        <input
                            type="tel"
                            name="phone"
                            id="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="attending" className="block text-sm font-medium text-gray-700 ml-1">
                        Will you be attending? *
                    </label>
                    <div className="mt-1">
                        <select
                            id="attending"
                            name="attending"
                            required
                            value={formData.attending}
                            onChange={handleChange}
                            className="block w-full pl-4 pr-10 py-3 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm rounded-2xl transition-shadow"
                        >
                            <option value="yes">Joyfully Accepts</option>
                            <option value="no">Regretfully Declines</option>
                        </select>
                    </div>
                </div>

                {formData.attending === 'yes' && (
                    <div className="sm:col-span-2">
                        <label htmlFor="guestCount" className="block text-sm font-medium text-gray-700 ml-1">
                            Number of Guests *
                        </label>
                        <div className="mt-1">
                            <input
                                type="number"
                                name="guestCount"
                                id="guestCount"
                                min="1"
                                max={verifiedGuest?.party_size || 10}
                                required
                                value={formData.guestCount}
                                onChange={handleChange}
                                className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                            />
                            {verifiedGuest?.party_size && (
                                <p className="mt-1 text-sm text-gray-500">
                                    Maximum party size: {verifiedGuest.party_size}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="sm:col-span-2">
                    <label htmlFor="dietaryRestrictions" className="block text-sm font-medium text-gray-700 ml-1">
                        Dietary Restrictions
                    </label>
                    <div className="mt-1">
                        <textarea
                            id="dietaryRestrictions"
                            name="dietaryRestrictions"
                            rows={3}
                            value={formData.dietaryRestrictions}
                            onChange={handleChange}
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>
                </div>

                <div className="sm:col-span-2">
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 ml-1">
                        Message for {config?.brideName || 'Bride'} & {config?.groomName || 'Groom'}♥
                    </label>
                    <div className="mt-1">
                        <textarea
                            id="message"
                            name="message"
                            rows={3}
                            value={formData.message}
                            onChange={handleChange}
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>
                </div>
            </div>

            {status === 'error' && (
                <div className="rounded-2xl bg-red-50 p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">
                                {errorMessage}
                            </h3>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-4">
                <button
                    type="button"
                    onClick={() => {
                        setStep('verification');
                        setGuestNameInput('');
                        setVerificationError('');
                    }}
                    className="flex justify-center py-3 px-6 border border-gray-300 rounded-full shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                >
                    Back
                </button>
                <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="flex-1 flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                >
                    {status === 'submitting' ? (existingRsvp ? 'Updating...' : 'Sending...') : (existingRsvp ? 'Update RSVP' : 'Send RSVP')}
                </button>
            </div>
        </form>
    );
}
