'use client';

import { useState } from 'react';

export default function RSVPForm() {
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
            const response = await fetch('/api/rsvp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
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

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor="guestName" className="block text-sm font-medium text-gray-700 ml-1">
                        Full Name(s) *
                    </label>
                    <div className="mt-1">
                        <input
                            type="text"
                            name="guestName"
                            id="guestName"
                            required
                            value={formData.guestName}
                            onChange={handleChange}
                            className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                        />
                    </div>
                </div>

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
                                max="10"
                                required
                                value={formData.guestCount}
                                onChange={handleChange}
                                className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-2xl shadow-sm placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm transition-shadow"
                            />
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
                        Message for the Couple
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

            <div>
                <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                >
                    {status === 'submitting' ? 'Sending...' : 'Send RSVP'}
                </button>
            </div>
        </form>
    );
}
