import { getSiteConfig } from '@/lib/config';
import RSVPForm from '@/components/RSVPForm';
import { getI18n } from '@/lib/i18n/server';
import { parseIsoDate, type I18n } from '@/lib/i18n';

// Read live config at request time (admin edits to the RSVP deadline, room block,
// etc. take effect without a rebuild) instead of baking it in at build time.
export const dynamic = 'force-dynamic';

// Format the deadline and compute whole days remaining (local time).
// Accepts an ISO date (YYYY-MM-DD, from the date picker) or legacy free text.
function describeDeadline(raw: string | undefined, i18n: I18n): { text: string; daysRemaining: number | null } {
    if (!raw) return { text: '', daysRemaining: null };
    const deadline = parseIsoDate(raw);
    if (!deadline) return { text: raw, daysRemaining: null };
    const text = i18n.date(deadline, { year: 'numeric', month: 'long', day: 'numeric' });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
    return { text, daysRemaining };
}

export default function RSVPPage() {
    const config = getSiteConfig();
    const bgColor = config.pageBgColors?.rsvp || '#ffffff';
    // Set in General Settings; the previous default was this couple's real
    // address hard-coded into the template.
    const contactEmail = (config.contactEmail ?? 'heav.aust.wedding@gmail.com').trim();

    const i18n = getI18n();
    const r = i18n.m.rsvpPage;
    const { text: deadlineText, daysRemaining } = describeDeadline(config.rsvpDeadline, i18n);
    let countdown = '';
    if (daysRemaining !== null) {
        if (daysRemaining > 0) countdown = i18n.plural(r.daysAway, daysRemaining);
        else if (daysRemaining === 0) countdown = r.today;
        else countdown = r.closed;
    }

    return (
        <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                            {r.title}
                        </h1>
                        <p className="mt-4 text-lg text-gray-600">
                            {r.intro}{' '}
                            {deadlineText
                                ? <>{i18n.fill(r.byDeadline, { date: deadlineText })}{countdown}</>
                                : r.noDeadline}
                        </p>
                    </div>

                    <RSVPForm
                        coupleNames={`${config.brideName} & ${config.groomName}`}
                        roomBlockHotel={config.roomBlockHotel || ''}
                        roomBlockUrl={config.roomBlockUrl || ''}
                    />

                    {contactEmail && (
                        <div className="mt-12 text-center text-gray-500">
                            <p>
                                {r.trouble} <a href={`mailto:${contactEmail}`} className="text-accent hover:text-accent-dark">{contactEmail}</a>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
