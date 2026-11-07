'use client';

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_ROOM_BLOCK_MESSAGE } from '@/lib/roomBlock';
import { askedQuestions, formatAnswer, missingRequired, type AnswerValue, type Answers, type RsvpQuestion } from '@/lib/rsvpQuestions';
import QuestionField from '@/components/rsvp/QuestionField';
import { useI18n } from '@/components/I18nProvider';

interface PartyMember {
    name: string | null;
    // Whether this person is coming. Recorded per person by the RSVP form —
    // a party of three where one declines seats two, not three.
    attending?: boolean | null;
}

interface DietaryEntry {
    name?: string | null;
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
    nut_allergy?: boolean;
    other?: boolean;
    kids_meal?: boolean;
    no_meal?: boolean;
    other_text?: string;
    answers?: Answers;
}

interface VerifiedGuest {
    name: string;
    party_size: number;
    email?: string | null;
    phone?: string | null;
    party_members?: PartyMember[];
    /** The named guest's own answer, once they have given one. */
    primary_attending?: boolean | null;
}

interface ExistingRsvp {
    id?: number | null;
    /** null: dietary notes the couple typed in; the household has not answered. */
    attending?: boolean | null;
    guestCount?: number;
    email?: string | null;
    phone?: string | null;
    dietaryRestrictions?: DietaryEntry[] | null;
    message?: string | null;
    answers?: Answers | null;
}

interface RsvpPageConfig {
    brideName?: string;
    groomName?: string;
    roomBlockHotel?: string;
    roomBlockUrl?: string;
    roomBlockMessage?: string;
    rsvpQuestions?: RsvpQuestion[];
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
    kids_meal: boolean;
    no_meal: boolean;
    other_text: string;
    /** Their answers to the couple's per-person questions. */
    answers: Answers;
}

function buildCards(
    primaryName: string,
    partyMembers: PartyMember[],
    existingDietary: DietaryEntry[],
    hasExistingRsvp: boolean,
    /** The named guest's own answer, when one is on file. */
    primaryAnswer: boolean | null,
): MemberCard[] {
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
            // looks like their answers were lost. The answer is stored on the member itself
            // (`attending`); RSVPs sent before that field existed fall back to the older
            // inference — a submitted RSVP lists exactly its attendees in
            // dietary_restrictions, and submitting requires answering everyone, so "absent
            // from that list" means they were marked not attending.
            // The named guest answers for themself too (v0.10.42) — they used to
            // be locked to "attending" by a household question.
            attendance: isFirst
                ? (hasExistingRsvp && primaryAnswer !== null ? (primaryAnswer ? 'yes' : 'no') : null)
                : typeof slot?.attending === 'boolean'
                    ? (slot.attending ? 'yes' : 'no')
                    : (hasExistingRsvp ? (existing ? 'yes' : 'no') : null),
            vegetarian: existing?.vegetarian ?? false,
            vegan: existing?.vegan ?? false,
            gluten_free: existing?.gluten_free ?? false,
            nut_allergy: existing?.nut_allergy ?? false,
            kids_meal: existing?.kids_meal ?? false,
            no_meal: existing?.no_meal ?? false,
            other: existing?.other ?? false,
            other_text: existing?.other_text ?? '',
            answers: existing?.answers ?? {},
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
function renderRoomBlockMessage(message: string, names: string, hotel: string, bookingUrl: string, labels: { book: string; we: string }) {
    return message.split(/(\{names\}|\{hotel\}|\{book\})/g).map((seg, i) => {
        if (seg === '{names}') return <span key={i}>{names || labels.we}</span>;
        if (seg === '{hotel}') return <span key={i} className="font-medium text-gray-800">{hotel}</span>;
        if (seg === '{book}') {
            return bookingUrl
                ? <a key={i} href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline decoration-accent/40 hover:text-accent-dark hover:decoration-accent transition-colors">{labels.book}</a>
                : <span key={i} className="font-medium text-gray-800">{labels.book}</span>;
        }
        return <span key={i}>{seg}</span>;
    });
}

export default function RSVPForm({ coupleNames = '', roomBlockHotel = '', roomBlockUrl = '' }: RSVPFormProps = {}) {
    const i18n = useI18n();
    const t = i18n.m.rsvp;
    const [step, setStep] = useState<'verification' | 'form'>('verification');
    const [verifiedGuest, setVerifiedGuest] = useState<VerifiedGuest | null>(null);
    // Who typed their name in — may be a plus-one/party member rather than the primary guest.
    const [matched, setMatched] = useState<{ name: string; isPrimary: boolean } | null>(null);
    const [existingRsvp, setExistingRsvp] = useState<ExistingRsvp | null>(null);
    // Set once a verified response says the wedding day has arrived. The
    // lookup still works either way; this only decides whether the 'form'
    // step renders as an editable form or a read-only summary — the write
    // gate on /api/rsvp is the real enforcement, this is just the UI not
    // offering a submit that would fail anyway.
    const [locked, setLocked] = useState(false);
    const [guestNameInput, setGuestNameInput] = useState('');
    const [verificationError, setVerificationError] = useState('');
    // Where the name path has got to, once a name is confirmed on the list:
    // 'link-offer' waits to send the email link, 'link-sent' is the "on its
    // way" message, 'email-verify' asks for the email on file ('verify' mode,
    // with something already on file for this household). Cleared by "Use a
    // different name" / "try again".
    const [nameStage, setNameStage] = useState<'idle' | 'link-offer' | 'link-sent' | 'email-verify'>('idle');
    const [linkSentMessage, setLinkSentMessage] = useState('');
    const [sendingLink, setSendingLink] = useState(false);
    const [verifyEmailInput, setVerifyEmailInput] = useState('');
    const [verifyingEmail, setVerifyingEmail] = useState(false);
    // The token from the link that opened this page (if any). Read once from
    // the URL, stripped out of it, and carried here — it is what the write
    // gate on /api/rsvp checks before anything is saved, in 'link' mode.
    const [rsvpToken, setRsvpToken] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [config, setConfig] = useState<RsvpPageConfig | null>(null);

    const [formData, setFormData] = useState({
        guestName: '',
        email: '',
        phone: '',
        message: '',
    });

    const [cards, setCards] = useState<MemberCard[]>([]);
    // The household's answers to the couple's household questions.
    const [householdAnswers, setHouseholdAnswers] = useState<Answers>({});
    // Set by a send with a required question left blank: those questions say so.
    const [showMissing, setShowMissing] = useState(false);
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

    // What any verified door into the form fills: the household's details,
    // the party cards and the pre-filled contact fields. Every door reaches
    // this with the same shape — the email link, the name path directly in
    // 'simple' mode or on a fresh household in 'verify' mode, and the email
    // check in 'verify' mode on an existing one.
    const hydrateVerified = useCallback((data: {
        guest: VerifiedGuest;
        matched: { name: string; isPrimary: boolean } | null;
        existingRsvp: ExistingRsvp | null;
        locked?: boolean;
    }) => {
        setVerifiedGuest(data.guest);
        setMatched(data.matched || null);
        setExistingRsvp(data.existingRsvp);
        setLocked(!!data.locked);

        const existingDietary = Array.isArray(data.existingRsvp?.dietaryRestrictions)
            ? data.existingRsvp.dietaryRestrictions
            : [];

        // Notes the couple typed in for a household that has not answered are
        // prefilled, but the form still starts as a first reply.
        const answered = data.existingRsvp?.attending === true || data.existingRsvp?.attending === false;
        // Before v0.10.42 the household's answer was the named guest's too.
        const primaryAnswer = typeof data.guest.primary_attending === 'boolean'
            ? data.guest.primary_attending
            : answered ? !!data.existingRsvp!.attending : null;
        setCards(buildCards(data.guest.name, data.guest.party_members || [], existingDietary, answered, primaryAnswer));

        setHouseholdAnswers((data.existingRsvp?.answers ?? {}) as Answers);
        setShowMissing(false);
        setFormData({
            guestName: data.guest.name,
            email: data.existingRsvp?.email || data.guest.email || '',
            phone: data.existingRsvp?.phone || data.guest.phone || '',
            message: data.existingRsvp?.message || '',
        });

        setStep('form');
    }, []);

    // The link flow: the page can open with `?token=` from the mail we send.
    // The token is stripped from the URL the moment it is read — a shared
    // link must not keep carrying it, and a refresh must not re-spend it —
    // then exchanged for the household's details. A dead token leaves a
    // one-line note on this step; the name form below still works and sends
    // a fresh one.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (!token) return;

        params.delete('token');
        const nextSearch = params.toString();
        window.history.replaceState(window.history.state, '',
            `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);

        fetch('/api/rsvp/magic-link/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then(res => res.json().catch(() => ({})))
            .then(data => {
                if (data.verified) {
                    setRsvpToken(token);
                    hydrateVerified(data);
                } else {
                    setVerificationError(t.linkExpired);
                }
            })
            .catch(err => {
                console.error('RSVP link error:', err);
                setVerificationError(t.linkExpired);
            });
        // Once on mount: the token is a one-time read from the URL.
    }, [hydrateVerified, t.linkExpired]);

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

            if (!data.verified) {
                setVerificationError(data.message || t.notFound);
                return;
            }

            if (data.guest) {
                // 'simple' mode, or 'verify' mode with nothing on file yet —
                // the details ride straight out of this response.
                hydrateVerified(data);
                return;
            }

            setMatched(data.matched || null);
            if (data.hasExistingRsvp) {
                // 'verify' mode, something already on file — ask for the
                // email on it before handing out anything.
                setNameStage('email-verify');
            } else {
                // 'link' mode — the details come from the email in the
                // guest's own inbox, so the next step is to offer sending it.
                setNameStage('link-offer');
            }
        } catch (error) {
            console.error('Verification error:', error);
            setVerificationError(t.lookupError);
        } finally {
            setVerifying(false);
        }
    };

    // Ask for the link for the confirmed name. The server answers the same
    // way for a found name, an unconfigured mail and a missing name, so the
    // message is shown verbatim and nothing here can tell what happened.
    const requestLink = async () => {
        setSendingLink(true);
        setVerificationError('');
        try {
            const response = await fetch('/api/rsvp/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: guestNameInput }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok) {
                setLinkSentMessage(data.message || t.linkSentDefault);
                setNameStage('link-sent');
            } else {
                setVerificationError(data.error || t.linkError);
            }
        } catch (error) {
            console.error('Link request error:', error);
            setVerificationError(t.linkError);
        } finally {
            setSendingLink(false);
        }
    };

    // 'verify' mode's second step: the email already on file for this
    // household, typed back. A wrong guess just says so — the server never
    // confirms whether the name part was even right, so this cannot be used
    // to check an email against a name one field at a time.
    const verifyByEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifyingEmail(true);
        setVerificationError('');
        try {
            const response = await fetch('/api/rsvp/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: guestNameInput, email: verifyEmailInput }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.verified) {
                hydrateVerified(data);
            } else {
                setVerificationError(data.error || t.emailMismatch);
            }
        } catch (error) {
            console.error('Email verification error:', error);
            setVerificationError(t.genericError);
        } finally {
            setVerifyingEmail(false);
        }
    };

    // Back to the name input — clears whatever the name path has got to.
    const resetNameStep = () => {
        setGuestNameInput('');
        setVerificationError('');
        setLinkSentMessage('');
        setVerifyEmailInput('');
        setNameStage('idle');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const updateCard = (index: number, patch: Partial<MemberCard>) => {
        setCards(prev => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
    };

    // The couple's own questions (Admin → RSVPs → Questions).
    const allQuestions = config?.rsvpQuestions ?? [];
    const personQuestions = askedQuestions(allQuestions, 'person');
    const householdQuestions = (anyoneComing: boolean) => askedQuestions(allQuestions, 'household')
        .filter(q => anyoneComing || q.onlyIfAttending === false);
    const setPersonAnswer = (index: number, qid: string, value: AnswerValue | undefined) => setCards(prev => prev.map((c, i) => {
        if (i !== index) return c;
        const answers = { ...c.answers };
        if (value === undefined) delete answers[qid]; else answers[qid] = value;
        return { ...c, answers };
    }));
    const setHouseholdAnswer = (qid: string, value: AnswerValue | undefined) => setHouseholdAnswers(prev => {
        const next = { ...prev };
        if (value === undefined) delete next[qid]; else next[qid] = value;
        return next;
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Every person answers for themself, so every card needs an answer; an
        // unnamed guest who is coming needs a name, and "Other" needs words.
        {
            const unanswered = cards.findIndex(c => c.attendance === null);
            if (unanswered !== -1) {
                const who = cards[unanswered].name.trim() || i18n.fill(t.guestN, { n: unanswered + 1 });
                setErrorMessage(i18n.fill(t.errAnswerFor, { who }));
                setStatus('error');
                return;
            }
            for (let i = 0; i < cards.length; i++) {
                if (cards[i].attendance === 'yes' && cards[i].nameEditable && !cards[i].name.trim()) {
                    setErrorMessage(i18n.fill(t.errNameFor, { n: i + 1 }));
                    setStatus('error');
                    return;
                }
                if (cards[i].attendance === 'yes' && cards[i].other && !cards[i].other_text.trim()) {
                    setErrorMessage(i18n.fill(t.errDietFor, { who: cards[i].name || i18n.fill(t.guestN, { n: i + 1 }) }));
                    setStatus('error');
                    return;
                }
            }
        }

        // The couple's required questions: each attending person's, then the household's.
        {
            const coming = cards.filter(c => c.attendance === 'yes');
            for (const card of coming) {
                const gap = missingRequired(personQuestions, card.answers)[0];
                if (gap) {
                    setShowMissing(true);
                    setErrorMessage(i18n.fill(t.errQuestionFor, { question: gap.label, who: card.name || t.everyoneComing }));
                    setStatus('error');
                    return;
                }
            }
            const gap = missingRequired(householdQuestions(coming.length > 0), householdAnswers)[0];
            if (gap) {
                setShowMissing(true);
                setErrorMessage(i18n.fill(t.errQuestion, { question: gap.label }));
                setStatus('error');
                return;
            }
        }

        setStatus('submitting');
        setErrorMessage('');

        const attendingCards = cards.filter(c => c.attendance === 'yes');
        const guestCount = attendingCards.length;
        // The household is coming when anyone in it is.
        const householdAttending = guestCount > 0;
        // Send resolved names *and* each person's answer back so guest_list.party_members
        // stays up to date. Attendance per member is what the seating chart reads: without
        // it a declined plus-one still got a chair, coloured as if they were coming.
        const resolvedMembers = cards.slice(1).map(c => ({
            name: c.name || null,
            attending: c.attendance === 'yes',
        }));
        const dietaryRestrictions = attendingCards.map(c => ({
            name: c.name,
            vegetarian: c.vegetarian,
            vegan: c.vegan,
            gluten_free: c.gluten_free,
            nut_allergy: c.nut_allergy,
            kids_meal: c.kids_meal,
            no_meal: c.no_meal,
            other: c.other,
            other_text: c.other ? c.other_text : '',
            answers: c.answers,
        }));
        // Only the household questions the form showed; the server keeps the rest.
        const shownHousehold = Object.fromEntries(householdQuestions(householdAttending)
            .filter(q => householdAnswers[q.id] !== undefined)
            .map(q => [q.id, householdAnswers[q.id]]));

        try {
            const isUpdate = existingRsvp !== null;
            setWasUpdate(isUpdate);
            const response = await fetch('/api/rsvp', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    ...(isUpdate ? { id: existingRsvp.id } : {}),
                    ...(rsvpToken ? { token: rsvpToken } : {}),
                    attending: householdAttending,
                    primaryAttending: cards[0]?.attendance === 'yes',
                    guestCount,
                    dietaryRestrictions,
                    resolvedMembers,
                    answers: shownHousehold,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || t.submitFailed);
            }

            // Remember the saved row so "Make changes" edits it rather than
            // trying to update an RSVP that this form never knew the id of.
            setExistingRsvp((prev) => ({
                ...(prev || {}),
                id: data.id ?? prev?.id ?? null,
                attending: householdAttending,
                email: formData.email,
                phone: formData.phone,
                message: formData.message,
                guestCount,
                dietaryRestrictions,
                answers: { ...householdAnswers },
            }));
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage(error instanceof Error && error.message ? error.message : t.genericErrorLater);
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
        // The couple's own wording when they wrote one; this language's default otherwise.
        const roomMessage = (config?.roomBlockMessage?.trim() && config.roomBlockMessage.trim() !== DEFAULT_ROOM_BLOCK_MESSAGE)
            ? config.roomBlockMessage.trim()
            : t.roomBlockDefault;
        // Receipt summary of who's attending
        const isAttending = cards.some(c => c.attendance === 'yes');
        const attendees = isAttending ? cards.filter(c => c.attendance === 'yes' && c.name?.trim()) : [];
        const partyLabel = i18n.plural(t.partyOf, attendees.length);
        return (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 p-8">
                <div className="confirm-check">
                    <svg viewBox="0 0 52 52">
                        <circle className="confirm-circle" cx="26" cy="26" r="24" fill="none" />
                        <path className="confirm-tick" fill="none" d="M14 27 L22.5 35.5 L38 18" />
                    </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">{wasUpdate ? t.updated : t.received}</h3>
                <p className="mt-2 text-base text-gray-500">
                    {t.thanksSent}
                </p>

                {/* Receipt-style summary of the RSVP */}
                <div className="mt-6 mx-auto max-w-xl text-left bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-3 mb-3">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{t.yourRsvp}</span>
                        {isAttending && (
                            <span className="text-sm font-semibold text-accent capitalize">{partyLabel}</span>
                        )}
                    </div>
                    {isAttending ? (
                        <>
                            <ul className="space-y-2">
                                {attendees.map((c, i) => {
                                    const picks = personQuestions
                                        .filter(q => c.answers[q.id] !== undefined)
                                        .map(q => formatAnswer(q, c.answers[q.id]))
                                        .filter(Boolean);
                                    return (
                                        <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                                            <svg className="mt-0.5 h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>
                                                {c.name}
                                                {picks.length > 0 && <span className="block text-xs text-gray-500">{picks.join(' · ')}</span>}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="mt-3 text-xs text-gray-400">
                                {i18n.plural(t.joyfullyAttending, attendees.length)} ♥
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-600">
                            {t.missYouDearly} ♥
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
                        {t.makeChanges}
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
                            {t.bookRoom}
                        </a>
                    )}
                </div>

                {hotel && (
                    <div className="mt-8 mx-auto max-w-xl text-left bg-accent/5 border border-accent/20 rounded-2xl p-5 flex gap-3">
                        <svg className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                            {renderRoomBlockMessage(roomMessage, names, hotel, bookingUrl, { book: t.bookRoom, we: t.we })}
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
                    <h2 className="text-2xl font-serif text-gray-900 mb-2">{t.welcomeTitle}</h2>
                    <p className="text-gray-600">
                        {t.welcomeBody}
                    </p>
                </div>

                {nameStage === 'idle' && (
                <form onSubmit={handleVerification} className="space-y-6">
                    <div>
                        <label htmlFor="guestNameInput" className="block text-sm font-medium text-gray-700 ml-1 mb-2">
                            {t.fullName} *
                        </label>
                        <input
                            type="text"
                            id="guestNameInput"
                            value={guestNameInput}
                            onChange={(e) => setGuestNameInput(e.target.value)}
                            placeholder={t.fullNamePlaceholder}
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
                        {verifying ? t.verifying : t.continue}
                    </button>
                </form>
                )}

                {nameStage === 'link-offer' && (
                    <div className="space-y-6">
                        {verificationError && (
                            <div className="rounded-2xl bg-red-50 p-4 flex gap-3">
                                <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm font-medium text-red-800">{verificationError}</p>
                            </div>
                        )}
                        <div className="rounded-2xl bg-accent/5 border border-accent/20 p-5 text-center">
                            <p className="text-sm font-medium text-gray-800">
                                {t.foundBefore}{matched?.name ? <span className="font-semibold">{matched.name}</span> : t.yourName}{t.foundAfter}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                                {t.linkExplain}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestLink}
                            disabled={sendingLink}
                            className="w-full flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                        >
                            {sendingLink ? t.sendingLink : t.sendLink}
                        </button>
                        <button
                            type="button"
                            onClick={resetNameStep}
                            className="w-full flex justify-center py-3 px-6 border border-gray-300 rounded-full text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                        >
                            {t.differentName}
                        </button>
                    </div>
                )}

                {nameStage === 'link-sent' && (
                    <div className="space-y-6">
                        <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center">
                            <p className="text-sm font-medium text-green-800">{linkSentMessage}</p>
                            <p className="text-xs text-gray-500 mt-2">
                                {t.linkInbox}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={resetNameStep}
                            className="w-full flex justify-center py-3 px-6 border border-gray-300 rounded-full text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                        >
                            {t.differentName}
                        </button>
                    </div>
                )}

                {nameStage === 'email-verify' && (
                    <form onSubmit={verifyByEmail} className="space-y-6">
                        <div className="rounded-2xl bg-accent/5 border border-accent/20 p-5 text-center">
                            <p className="text-sm font-medium text-gray-800">
                                {t.foundBefore}{matched?.name ? <span className="font-semibold">{matched.name}</span> : t.yourName}{t.foundOnFile}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                                {t.confirmEmail}
                            </p>
                        </div>
                        <div>
                            <label htmlFor="verifyEmailInput" className="block text-sm font-medium text-gray-700 ml-1 mb-2">
                                {t.emailOnRsvp} *
                            </label>
                            <input
                                type="email"
                                id="verifyEmailInput"
                                value={verifyEmailInput}
                                onChange={(e) => setVerifyEmailInput(e.target.value)}
                                placeholder="you@example.com"
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
                            disabled={verifyingEmail || !verifyEmailInput.trim()}
                            className="w-full flex justify-center py-3 px-6 border border-transparent rounded-full shadow-md text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
                        >
                            {verifyingEmail ? t.checking : t.continue}
                        </button>
                        <button
                            type="button"
                            onClick={resetNameStep}
                            className="w-full flex justify-center py-3 px-6 border border-gray-300 rounded-full text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                        >
                            {t.differentName}
                        </button>
                    </form>
                )}
            </div>
        );
    }

    // Past the wedding day: the lookup worked (verifiedGuest/existingRsvp are
    // populated same as ever), but there is no form to submit — just what is
    // on file, or a note that there is nothing. The write gate on /api/rsvp
    // is what actually refuses a change; this is only the UI not offering one.
    if (locked) {
        const attendees = cards.filter(c => c.attendance === 'yes' && c.name?.trim());
        return (
            <div className="text-center py-12 bg-white rounded-3xl shadow-xl border-t-4 border-accent p-8">
                <h2 className="text-2xl font-serif text-gray-900 mb-2">{t.closedTitle}</h2>
                <p className="text-gray-600 max-w-md mx-auto">
                    {t.closedBody}
                    {existingRsvp && existingRsvp.attending != null ? ` ${t.closedOnFile}` : ''}
                </p>

                {existingRsvp && existingRsvp.attending != null ? (
                    <div className="mt-6 mx-auto max-w-xl text-left bg-gray-50 border border-gray-200 rounded-2xl p-5">
                        <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-3 mb-3">
                            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{i18n.fill(t.onFileFor, { name: matched?.name || verifiedGuest?.name || '' })}</span>
                            <span className={`text-sm font-semibold ${existingRsvp.attending ? 'text-green-700' : 'text-gray-500'}`}>
                                {existingRsvp.attending ? t.attending : t.notAttending}
                            </span>
                        </div>
                        {existingRsvp.attending ? (
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
                        ) : (
                            <p className="text-sm text-gray-600">{t.missYou}</p>
                        )}
                        {existingRsvp.message && (
                            <p className="mt-3 text-sm text-gray-500 italic">&quot;{existingRsvp.message}&quot;</p>
                        )}
                    </div>
                ) : (
                    <p className="mt-6 text-sm text-gray-500">
                        {i18n.fill(t.noneOnFile, { name: matched?.name || t.you })}
                    </p>
                )}

                <button
                    type="button"
                    onClick={() => { setStep('verification'); resetNameStep(); }}
                    className="mt-8 inline-flex justify-center py-2 px-6 border border-gray-300 rounded-full text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all"
                >
                    {t.lookUpAnother}
                </button>
            </div>
        );
    }

    const partyNames = verifiedGuest?.party_members?.map((m: PartyMember, i: number) => m.name || i18n.fill(t.guestN, { n: i + 2 })).join(', ');

    // Every person answers for themself (v0.10.42).
    const unansweredCount = cards.filter(c => c.attendance === null).length;
    const comingCount = cards.filter(c => c.attendance === 'yes').length;
    const decliningCount = cards.filter(c => c.attendance === 'no').length;
    const allDeclined = cards.length > 0 && decliningCount === cards.length;
    const setEveryone = (attendance: Attendance) => setCards(prev => prev.map(c => ({ ...c, attendance })));
    const matchedKey = foldKey(matched?.name);
    const couple = [config?.brideName, config?.groomName].filter(Boolean).join(' & ');

    return (
        <form onSubmit={handleSubmit} className="space-y-8 bg-white p-6 sm:p-8 rounded-3xl shadow-xl border-t-4 border-accent">
            {/* Greeting */}
            <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                    {existingRsvp && existingRsvp.attending != null ? t.welcomeBack : t.welcome}
                </p>
                <h2 className="mt-1 font-serif text-2xl text-gray-900 sm:text-3xl">
                    {matched?.name || verifiedGuest?.name}{partyNames ? ` ${t.andParty}` : ''}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                    {matched && !matched.isPrimary
                        ? i18n.fill(t.partOfParty, { name: verifiedGuest?.name || '' })
                        : cards.length > 1
                            ? t.introParty
                            : existingRsvp && existingRsvp.attending != null
                                ? t.introUpdate
                                : t.introSingle}
                </p>
            </div>

            {/* Who's coming */}
            <section aria-labelledby="rsvp-party-heading">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h3 id="rsvp-party-heading" className="text-sm font-semibold text-gray-900">
                        {cards.length > 1 ? t.whosComing : t.joiningUs}
                    </h3>
                    {cards.length > 1 && (
                        <div className="flex gap-1.5 text-xs">
                            <button type="button" onClick={() => setEveryone('yes')}
                                className="rounded-full border border-gray-200 px-3 py-1.5 font-medium text-gray-600 transition-colors hover:border-accent hover:text-accent-dark">
                                {t.everyoneComingButton}
                            </button>
                            <button type="button" onClick={() => setEveryone('no')}
                                className="rounded-full border border-gray-200 px-3 py-1.5 font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-800">
                                {t.noneOfUs}
                            </button>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {cards.map((card, i) => {
                        const isYou = matchedKey !== '' && foldKey(card.name) === matchedKey;
                        const initials = (card.name || i18n.fill(t.guestN, { n: i + 1 })).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
                        return (
                            <div
                                key={i}
                                className={`rounded-3xl border p-4 transition-all duration-300 sm:p-5 ${
                                    card.attendance === 'yes'
                                        ? 'border-accent/40 bg-accent/[0.03] shadow-sm'
                                        : card.attendance === 'no'
                                            ? 'border-gray-100 bg-gray-50/70'
                                            : 'border-gray-200 bg-white'
                                }`}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                                            card.attendance === 'yes' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'}`}>
                                            {initials || '?'}
                                        </span>
                                        {card.nameEditable ? (
                                            <div className="min-w-0 flex-1">
                                                <label htmlFor={`rsvp-name-${i}`} className="sr-only">{i18n.fill(t.guestNameLabel, { n: i + 1 })}</label>
                                                <input
                                                    id={`rsvp-name-${i}`}
                                                    type="text"
                                                    value={card.name}
                                                    onChange={(e) => updateCard(i, { name: e.target.value })}
                                                    placeholder={i18n.fill(t.guestNameLabel, { n: i + 1 })}
                                                    className="block w-full rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                                />
                                            </div>
                                        ) : (
                                            <p className="min-w-0 break-words text-base font-medium text-gray-900">
                                                {card.name}
                                                {isYou && cards.length > 1 && (
                                                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t.youTag}</span>
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {/* One answer per person. Choosing the chosen one again clears it. */}
                                    <div role="radiogroup" aria-label={i18n.fill(t.isComing, { who: card.name || i18n.fill(t.guestN, { n: i + 1 }) })}
                                        className="grid shrink-0 grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 sm:w-64">
                                        {([
                                            ['yes', t.acceptsLong, 'M5 13l4 4L19 7'],
                                            ['no', t.declinesLong, 'M6 18L18 6M6 6l12 12'],
                                        ] as const).map(([value, label, path]) => {
                                            const on = card.attendance === value;
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={on}
                                                    onClick={() => updateCard(i, { attendance: on ? null : value })}
                                                    className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-200 sm:text-[13px] ${
                                                        on
                                                            ? value === 'yes'
                                                                ? 'bg-accent text-white shadow-sm'
                                                                : 'bg-white text-gray-800 shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                                >
                                                    <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
                                                    </svg>
                                                    <span className="whitespace-nowrap">{value === 'yes' ? t.accepts : t.declines}</span>
                                                    <span className="sr-only">{label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* What they eat — only for someone who is coming. */}
                                {card.attendance === 'yes' && (
                                    <div className="mt-4 space-y-5 border-t border-dashed border-gray-200 pt-4 [animation:rsvp-open_.3s_ease-out]">
                                        {personQuestions.map(q => (
                                            <QuestionField
                                                key={q.id}
                                                question={q}
                                                idPrefix={`p${i}`}
                                                value={card.answers[q.id]}
                                                onChange={v => setPersonAnswer(i, q.id, v)}
                                                missing={showMissing && q.required && missingRequired([q], card.answers).length > 0}
                                            />
                                        ))}
                                        <div>
                                        <p className="mb-2 text-xs font-medium text-gray-500">{t.dietaryNeeds}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {([
                                                { field: 'vegetarian', label: t.diet.vegetarian },
                                                { field: 'vegan', label: t.diet.vegan },
                                                { field: 'gluten_free', label: t.diet.glutenFree },
                                                { field: 'nut_allergy', label: t.diet.nutAllergy },
                                                { field: 'kids_meal', label: t.diet.kidsMeal },
                                                { field: 'no_meal', label: t.diet.notEating },
                                                { field: 'other', label: t.diet.other },
                                            ] as { field: keyof Pick<MemberCard, 'vegetarian' | 'vegan' | 'gluten_free' | 'nut_allergy' | 'other' | 'kids_meal' | 'no_meal'>; label: string }[]).map(({ field, label }) => {
                                                const on = card[field];
                                                const disabled = card.no_meal && field !== 'no_meal';
                                                return (
                                                    <button
                                                        key={field}
                                                        type="button"
                                                        aria-pressed={on}
                                                        disabled={disabled}
                                                        onClick={() => updateCard(i, (
                                                            // Not eating is the whole answer: choosing it clears
                                                            // the rest rather than leaving "not eating,
                                                            // vegetarian" for the kitchen to puzzle over.
                                                            field === 'no_meal' && !on
                                                                ? {
                                                                    no_meal: true, vegetarian: false, vegan: false, gluten_free: false,
                                                                    nut_allergy: false, other: false, kids_meal: false, other_text: '',
                                                                }
                                                                : { [field]: !on }
                                                        ))}
                                                        className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                                                            on
                                                                ? 'border-accent bg-accent/10 text-accent-dark'
                                                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                                        } disabled:cursor-not-allowed disabled:opacity-40`}
                                                    >
                                                        {on && <span aria-hidden className="mr-1">✓</span>}{label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {card.no_meal && (
                                            <p className="mt-2 text-xs text-gray-500">
                                                {t.notEatingNote}
                                            </p>
                                        )}
                                        {card.other && (
                                            <input
                                                type="text"
                                                value={card.other_text}
                                                onChange={(e) => updateCard(i, { other_text: e.target.value })}
                                                placeholder={t.otherPlaceholder}
                                                aria-label={i18n.fill(t.dietFor, { who: card.name || i18n.fill(t.guestN, { n: i + 1 }) })}
                                                className="mt-3 block w-full rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                            />
                                        )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* The couple's household questions — a song request, say. */}
            {householdQuestions(comingCount > 0).length > 0 && (
                <section aria-labelledby="rsvp-more-heading" className="rounded-3xl border border-gray-200 p-4 sm:p-5">
                    <h3 id="rsvp-more-heading" className="mb-4 text-sm font-semibold text-gray-900">
                        {cards.length > 1 ? t.moreParty : t.moreSingle}
                    </h3>
                    <div className="space-y-5">
                        {householdQuestions(comingCount > 0).map(q => (
                            <QuestionField
                                key={q.id}
                                question={q}
                                idPrefix="household"
                                value={householdAnswers[q.id]}
                                onChange={v => setHouseholdAnswer(q.id, v)}
                                missing={showMissing && q.required && missingRequired([q], householdAnswers).length > 0}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* How to reach you */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="email" className="ml-1 block text-sm font-medium text-gray-700">{t.email}</label>
                    <input
                        type="email" name="email" id="email" required autoComplete="email"
                        value={formData.email} onChange={handleChange}
                        className="mt-1 block w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
                    />
                </div>
                <div>
                    <label htmlFor="phone" className="ml-1 block text-sm font-medium text-gray-700">{t.phone}</label>
                    <input
                        type="tel" name="phone" id="phone" required autoComplete="tel"
                        value={formData.phone} onChange={handleChange}
                        className="mt-1 block w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
                    />
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="message" className="ml-1 block text-sm font-medium text-gray-700">
                        {i18n.fill(t.noteFor, { couple: couple || t.theCouple })} <span className="font-normal text-gray-400">· {t.optional}</span>
                    </label>
                    <textarea
                        id="message" name="message" rows={3}
                        value={formData.message} onChange={handleChange}
                        className="mt-1 block w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
                    />
                </div>
            </section>

            {status === 'error' && (
                <div role="alert" className="rounded-2xl bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{errorMessage}</p>
                </div>
            )}

            <div className="space-y-3">
                {/* Where the answers stand, so nobody sends half an RSVP by accident. */}
                <p aria-live="polite" className={`text-center text-sm ${unansweredCount > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {unansweredCount > 0
                        ? (cards.length === 1
                            ? t.chooseToSend
                            : i18n.plural(t.moreToAnswer, unansweredCount))
                        : allDeclined
                            ? t.sorryToMiss
                            : `${i18n.plural(t.comingCount, comingCount)}${decliningCount ? ` · ${i18n.plural(t.cantMakeIt, decliningCount)}` : ''}`}
                </p>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => { setStep('verification'); setGuestNameInput(''); setVerificationError(''); }}
                        className="flex justify-center rounded-full border border-gray-200 bg-white px-6 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                    >
                        {t.back}
                    </button>
                    <button
                        type="submit"
                        disabled={status === 'submitting' || unansweredCount > 0}
                        className="flex flex-1 justify-center rounded-full bg-accent px-6 py-3 text-base font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:translate-y-0 disabled:opacity-50"
                    >
                        {status === 'submitting'
                            ? (existingRsvp ? t.updating : t.sending)
                            : allDeclined
                                ? t.sendRegrets
                                : (existingRsvp && existingRsvp.attending != null ? t.updateRsvp : t.sendRsvp)}
                    </button>
                </div>
            </div>
        </form>
    );
}

/** Names compared the way the lookup compares them: case, spacing and accents ignored. */
function foldKey(name: string | null | undefined): string {
    return (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
