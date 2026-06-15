import { getSiteConfig } from '@/lib/config';
import RSVPForm from '@/components/RSVPForm';

// Read live config at request time (admin edits to the RSVP deadline, room block,
// etc. take effect without a rebuild) instead of baking it in at build time.
export const dynamic = 'force-dynamic';

export default function RSVPPage() {
    const config = getSiteConfig();
    const bgColor = config.pageBgColors?.rsvp || '#ffffff';

    return (
        <div style={{ backgroundColor: bgColor }} className="min-h-screen py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                            RSVP
                        </h1>
                        <p className="mt-4 text-lg text-gray-600">
                            We can't wait to celebrate with you! Please let us know if you can make it by {config.rsvpDeadline}.
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
