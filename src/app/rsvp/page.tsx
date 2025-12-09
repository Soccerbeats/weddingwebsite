import { getSiteConfig } from '@/lib/config';
import RSVPForm from '@/components/RSVPForm';

export default function RSVPPage() {
    const config = getSiteConfig();

    return (
        <div className="bg-gray-50 min-h-screen py-16">
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

                    <RSVPForm />

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
