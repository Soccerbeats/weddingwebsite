import { getSiteConfig } from '@/lib/config';
import RSVPForm from '@/components/RSVPForm';

// Read live config at request time (admin edits to the RSVP deadline, room block,
// etc. take effect without a rebuild) instead of baking it in at build time.
export const dynamic = 'force-dynamic';

// Format the deadline and compute whole days remaining (local time).
// Accepts an ISO date (YYYY-MM-DD, from the date picker) or legacy free text.
function describeDeadline(raw?: string): { text: string; daysRemaining: number | null } {
    if (!raw) return { text: '', daysRemaining: null };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { text: raw, daysRemaining: null };
    const [y, m, d] = raw.split('-').map(Number);
    const deadline = new Date(y, m - 1, d);
    const text = deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
    return { text, daysRemaining };
}

export default function RSVPPage() {
    const config = getSiteConfig();
    const bgColor = config.pageBgColors?.rsvp || '#ffffff';

    const { text: deadlineText, daysRemaining } = describeDeadline(config.rsvpDeadline);
    let countdown = '';
    if (daysRemaining !== null) {
        if (daysRemaining > 1) countdown = `, just ${daysRemaining} days away!`;
        else if (daysRemaining === 1) countdown = ', just 1 day away!';
        else if (daysRemaining === 0) countdown = " — that's today!";
        else countdown = ' (the RSVP window has now closed).';
    }

    return (
        <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                            RSVP
                        </h1>
                        <p className="mt-4 text-lg text-gray-600">
                            We can't wait to celebrate with you!{' '}
                            {deadlineText
                                ? <>Please let us know if you can make it by {deadlineText}{countdown}</>
                                : 'Please let us know if you can make it.'}
                        </p>
                    </div>

                    <RSVPForm
                        coupleNames={`${config.brideName} & ${config.groomName}`}
                        roomBlockHotel={config.roomBlockHotel || ''}
                        roomBlockUrl={config.roomBlockUrl || ''}
                    />

                    <div className="mt-12 text-center text-gray-500">
                        <p>
                            Having trouble RSVPing? Email us at <a href="mailto:heav.aust.wedding@gmail.com" className="text-accent hover:text-accent-dark">heav.aust.wedding@gmail.com</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
