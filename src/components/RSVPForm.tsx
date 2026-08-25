'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_ROOM_BLOCK_MESSAGE } from '@/lib/roomBlock';

interface PartyMember {
    name: string | null;
}

interface DietaryEntry {
    name?: string | null;
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
    nut_allergy?: boolean;
    other?: boolean;
    other_text?: string;
}

interface VerifiedGuest {
    name: string;
    party_size: number;
    email?: string | null;
    phone?: string | null;
    party_members?: PartyMember[];
}

interface ExistingRsvp {
    id?: number | null;
    attending?: boolean;
    guestCount?: number;
    email?: string | null;
    phone?: string | null;
    dietaryRestrictions?: DietaryEntry[] | null;
    message?: string | null;
}

interface RsvpPageConfig {
    brideName?: string;
    groomName?: string;
    roomBlockHotel?: string;
    roomBlockUrl?: string;
    roomBlockMessage?: string;
}

// Attendance is a tri-state on purpose: null means "not answered yet", which is
// distinct from an explicit 'no'. A plain boolean silently counted anyone the guest
// forgot to tick as declined, so parties got under-counted with no warning.
type Attendance = 'yes' | 'no' | null;

interface MemberCard {
    name: string;           // resolved display name (may be empty string for unknowns the guest must fill in)
    nameEditable: boolean;  // true when admin left this slot unnamed
    attendance: Attendance;
    vegetarian: boolean;
    vegan: boolean;
    gluten_free: boolean;
    nut_allergy: boolean;
    other: boolean;
    other_text: string;
}

function buildCards(primaryName: string, partyMembers: PartyMember[], existingDietary: DietaryEntry[], hasExistingRsvp: boolean): MemberCard[] {
    const totalSlots = 1 + partyMembers.length;
    return Array.from({ length: totalSlots }, (_, i) => {
        const isFirst = i === 0;
        const slot = isFirst ? null : partyMembers[i - 1];
        const knownName = isFirst ? primaryName : (slot?.name ?? null);
        // For unnamed slots, fall back to the dietary entry at the same index to recover a previously entered name
        const existing = existingDietary.find(d => d.name === knownName)
            || (!knownName && existingDietary[i] ? existingDietary[i] : null);
        const resolvedName = knownName ?? existing?.name ?? '';
        return {
            name: resolvedName,
            nameEditable: !isFirst && !knownName && !existing?.name,
            // A brand-new RSVP starts blank so the guest has to tick Attending or Not
            // attending for each person themselves — nothing is guessed on their behalf.
            // Re-opening an RSVP they already sent shows back what they chose, otherwise it
            // looks like their answers were lost. Attendance isn't stored per member; a
            // submitted RSVP lists exactly its attendees in dietary_restrictions, and
            // submitting requires answering everyone, so "absent from that list" means
            // they were marked not attending.
            // (The primary guest is covered by the "Will you be attending?" answer above.)
            attendance: isFirst ? 'yes' : (hasExistingRsvp ? (existing ? 'yes' : 'no') : null),
            vegetarian: existing?.vegetarian ?? false,
            vegan: existing?.vegan ?? false,
            gluten_free: existing?.gluten_free ?? false,
            nut_allergy: existing?.nut_allergy ?? false,
            other: existing?.other ?? false,
            other_text: existing?.other_text ?? '',
        };
    });
}


interface RSVPFormProps {
    coupleNames?: string;
    roomBlockHotel?: string;
    roomBlockUrl?: string;
}

// Render the editable message, expanding the protected tokens. The {book} link's
// URL comes from the Booking URL setting (not the message text), so editing the
// copy can never break the link.
function renderRoomBlockMessage(message: string, names: string, hotel: string, bookingUrl: string) {
    return message.split(/(\{names\}|\{hotel\}|\{book\})/g).map((seg, i) => {
        if (seg === '{names}') return <span key={i}>{names || 'We'}</span>;
        if (seg === '{hotel}') return <span key={i} className="font-medium text-gray-800">{hotel}</span>;
        if (seg === '{book}') {
            return bookingUrl
                ? <a key={i} href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline decoration-accent/40 hover:text-accent-dark hover:decoration-accent transition-colors">Book Your Room</a>
                : <span key={i} className="font-medium text-gray-800">Book Your Room</span>;
        }
        return <span key={i}>{seg}</span>;
    });
}

export default function RSVPForm({ coupleNames = '', roomBlockHotel = '', roomBlockUrl = '' }: RSVPFormProps = {}) {
    const [step, setStep] = useState<'verification' | 'form'>('verification');
    const [verifiedGuest, setVerifiedGuest] = useState<VerifiedGuest | null>(null);
    // Who typed their name in — may be a plus-one/party member rather than the primary guest.
    const [matched, setMatched] = useState<{ name: string; isPrimary: boolean } | null>(null);
    const [existingRsvp, setExistingRsvp] = useState<ExistingRsvp | null>(null);
    const [guestNameInput, setGuestNameInput] = useState('');
    const [verificationError, setVerificationError] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [config, setConfig] = useState<RsvpPageConfig | null>(null);

    const [formData, setFormData] = useState({
        guestName: '',
        email: '',
        phone: '',
        attending: 'yes',
        message: '',
    });

    const [cards, setCards] = useState<MemberCard[]>([]);
    // Whether the last submission changed an RSVP that already existed.
    const [wasUpdate, setWasUpdate] = useState(false);
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
                setMatched(data.matched || null);
                setExistingRsvp(data.existingRsvp);

                const existingDietary = Array.isArray(data.existingRsvp?.dietaryRestrictions)
                    ? data.existingRsvp.dietaryRestrictions
                    : [];

                setCards(buildCards(data.guest.name, data.guest.party_members || [], existingDietary, !!data.existingRsvp));

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
        // Also validate: "Other" dietary requires text
        if (formData.attending === 'yes') {
            // Every guest must be explicitly marked attending or not attending first.
            const unanswered = cards.findIndex(c => c.attendance === null);
            if (unanswered !== -1) {
                const who = cards[unanswered].name.trim() || `Guest ${unanswered + 1}`;
                setErrorMessage(`Please mark ${who} as attending or not attending before submitting.`);
                setStatus('error');
                return;
            }
            for (let i = 0; i < cards.length; i++) {
                if (cards[i].attendance === 'yes' && cards[i].nameEditable && !cards[i].name.trim()) {
                    setErrorMessage(`Please enter a name for Guest ${i + 1} before submitting.`);
                    setStatus('error');
                    return;
                }
                if (cards[i].attendance === 'yes' && cards[i].other && !cards[i].other_text.trim()) {
                    setErrorMessage(`Please describe the dietary restriction for ${cards[i].name || `Guest ${i + 1}`}.`);
                    setStatus('error');
                    return;
                }
            }
        }

        setStatus('submitting');
        setErrorMessage('');

        const attendingCards = formData.attending === 'yes' ? cards.filter(c => c.attendance === 'yes') : [];
        const guestCount = attendingCards.length;
        // Send resolved names for all additional members back so guest_list.party_members stays up to date
        const resolvedMembers = cards.slice(1).map(c => ({ name: c.name || null }));
        const dietaryRestrictions = attendingCards.map(c => ({
            name: c.name,
            vegetarian: c.vegetarian,
            vegan: c.vegan,
            gluten_free: c.gluten_free,
            nut_allergy: c.nut_allergy,
            other: c.other,
            other_text: c.other ? c.other_text : '',
        }));

        try {
            const isUpdate = existingRsvp !== null;
            setWasUpdate(isUpdate);
            const response = await fetch('/api/rsvp', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    ...(isUpdate ? { id: existingRsvp.id } : {}),
                    attending: formData.attending === 'yes',
                    guestCount,
                    dietaryRestrictions,
                    resolvedMembers,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit RSVP');
            }

            // Remember the saved row so "Make changes" edits it rather than
            // trying to update an RSVP that this form never knew the id of.
            setExistingRsvp((prev) => ({
                ...(prev || {}),
                id: data.id ?? prev?.id ?? null,
                attending: formData.attending === 'yes',
                email: formData.email,
                phone: formData.phone,
                message: formData.message,
                guestCount,
                dietaryRestrictions,
            }));
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage(error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again later.');
        }
    };

    if (status === 'success') {
        // Prefer the live-fetched config (the RSVP page is statically rendered, so
        // server-passed props would be baked in empty at build time).
        const names = (config?.brideName && config?.groomName)
            ? `${config.brideName} & ${config.groomName}`
            : coupleNames;
        const hotel = config?.roomBlockHotel ?? roomBlockHotel;
        const bookingUrl = config?.roomBlockUrl ?? roomBlockUrl;
        const roomMessage = (config?.roomBlockMessage?.trim()) || DEFAULT_ROOM_BLOCK_MESSAGE;
        // Receipt summary of who's attending
        const isAttending = formData.attending === 'yes';
        const attendees = isAttending ? cards.filter(c => c.attendance === 'yes' && c.name?.trim()) : [];
        const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        const partyWord = numberWords[attendees.length] ?? String(attendees.length);
        const partyLabel = `Party of ${partyWord}`;
        return (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 p-8">
                <div className="confirm-check">
                    <svg viewBox="0 0 52 52">
                        <circle className="confirm-circle" cx="26" cy="26" r="24" fill="none" />
                        <path className="confirm-tick" fill="none" d="M14 27 L22.5 35.5 L38 18" />
                    </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">RSVP {wasUpdate ? 'Updated' : 'Received'}!</h3>
                <p className="mt-2 text-base text-gray-500">
                    Thank you for letting us know. We&apos;ve sent a confirmation to the happy couple♥
                </p>

                {/* Receipt-style summary of the RSVP */}
                <div className="mt-6 mx-auto max-w-xl text-left bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-3 mb-3">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Your RSVP</span>
                        {isAttending && (
                            <span className="text-sm font-semibold text-accent capitalize">{partyLabel}</span>
                        )}
                    </div>
                    {isAttending ? (
                        <>
                            <ul className="space-y-2">
                                {attendees.map((c, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-gray-800">
                                        <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>{c.name}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-3 text-xs text-gray-400">
                                {attendees.length} {attendees.length === 1 ? 'guest' : 'guests'} joyfully attending ♥
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-600">
                            We&apos;ll miss you dearly, but thank you for letting us know. ♥
                        </p>
                    )}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-center">
                    <button
                        onClick={() => {
                            setStatus('idle');
                            setStep('form');
                            // existingRsvp was set on submit; nothing to rebuild here.
                        }}
                        className="inline-flex justify-center py-2 px-6 border border-gray-300 rounded-full text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                    >
                        Make changes
                    </button>
                    {hotel && bookingUrl && (
                        <a
                            href={bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 justify-center py-2 px-6 rounded-full text-sm font-medium text-white bg-accent hover:bg-accent-dark shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all transform hover:-translate-y-0.5"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
                            </svg>
                            Book Your Room
                        </a>
                    )}
                </div>

                {hotel && (
                    <div className="mt-8 mx-auto max-w-xl text-left bg-accent/5 border border-accent/20 rounded-2xl p-5 flex gap-3">
                        <svg className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                            {renderRoomBlockMessage(roomMessage, names, hotel, bookingUrl)}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    if (step === 'verification') {
        return (
            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-accent">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-serif text-gray-900 mb-2">Welcome!</h2>
                    <p className="text-gray-600">
                        Please enter your name to begin. Anyone in your party can use their own
                        name — you&apos;ll be able to RSVP for everyone together.
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

    // Guests still needing an explicit attending / not-attending choice. Only applies
    // when the party is coming at all — declining covers everyone in one go.
    const unansweredCount = formData.attending === 'yes'
        ? cards.filter(c => c.attendance === null).length
        : 0;

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
                            Welcome{existingRsvp ? ' back' : ''}, {matched?.name || verifiedGuest?.name}{partyNames ? ` & party` : ''}!
                        </p>
                        {matched && !matched.isPrimary && (
                            <p className={`text-sm mt-1 ${existingRsvp ? 'text-blue-700' : 'text-green-700'}`}>
                                You&apos;re part of {verifiedGuest?.name}&apos;s party — this RSVP covers everyone below.
                            </p>
                        )}
                        <p className={`text-sm mt-1 ${existingRsvp ? 'text-blue-700' : 'text-green-700'}`}>
                            {existingRsvp ? 'You can update your RSVP below.' : 'Please complete your RSVP below.'}
                        </p>
                        {formData.attending === 'yes' && cards.length > 1 && (
                            <p className={`text-sm mt-2 font-semibold ${existingRsvp ? 'text-blue-800' : 'text-green-800'}`}>
                                Please mark all guests as attending or not attending — you&apos;ll need to
                                choose one for every person before you can send your RSVP.
                            </p>
                        )}
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
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 ml-1">Phone *</label>
                    <input
                        type="tel" name="phone" id="phone" required
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
                                        card.attendance === 'yes'
                                            ? 'bg-white border-gray-200'
                                            : card.attendance === 'no'
                                                ? 'bg-gray-50 border-gray-100 opacity-60'
                                                : 'bg-amber-50 border-amber-300'
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
                                        {/* Attending / Not attending — mutually exclusive, and the
                                            primary guest is locked on by the answer above. Clicking a
                                            ticked box clears it back to unanswered. */}
                                        {isFirst ? (
                                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full whitespace-nowrap">Attending</span>
                                        ) : (
                                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4 whitespace-nowrap">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={card.attendance === 'yes'}
                                                        onChange={() => updateCard(i, { attendance: card.attendance === 'yes' ? null : 'yes' })}
                                                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                    />
                                                    <span className="text-sm text-gray-600">Attending</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={card.attendance === 'no'}
                                                        onChange={() => updateCard(i, { attendance: card.attendance === 'no' ? null : 'no' })}
                                                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                    />
                                                    <span className="text-sm text-gray-600">Not attending</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Dietary checkboxes — only when attending */}
                                    {card.attendance === 'yes' && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-2">Dietary restrictions</p>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {([
                                                    { field: 'vegetarian', label: 'Vegetarian' },
                                                    { field: 'vegan', label: 'Vegan' },
                                                    { field: 'gluten_free', label: 'Gluten Free' },
                                                    { field: 'nut_allergy', label: 'Nut Allergy' },
                                                    { field: 'other', label: 'Other' },
                                                ] as { field: keyof Pick<MemberCard, 'vegetarian' | 'vegan' | 'gluten_free' | 'nut_allergy' | 'other'>; label: string }[]).map(({ field, label }) => (
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
                                            {card.other && (
                                                <input
                                                    type="text"
                                                    value={card.other_text}
                                                    onChange={(e) => updateCard(i, { other_text: e.target.value })}
                                                    placeholder="Please describe your dietary restriction"
                                                    className="mt-2 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-accent focus:border-accent"
                                                />
                                            )}
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

            {unansweredCount > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-3">
                    {unansweredCount === 1
                        ? '1 guest still needs to be marked attending or not attending.'
                        : `${unansweredCount} guests still need to be marked attending or not attending.`}
                </p>
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
                    disabled={status === 'submitting' || unansweredCount > 0}
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
