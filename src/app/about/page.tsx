import Image from "next/image";
import { getSiteConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function AboutPage() {
    const config = getSiteConfig();

    return (
        <div className="bg-white">
            {/* Hero Section */}
            <div className="relative py-20 bg-gray-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
                        Our Story
                    </h1>
                    <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500 font-serif italic">
                        {config.ourStoryTitle || "A chance meeting that turned into forever."}
                    </p>
                </div>
            </div>

            {/* Story Content */}
            <div className="py-16 overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative lg:grid lg:grid-cols-2 lg:gap-8 items-center">
                        <div className="relative">
                            <h3 className="text-2xl font-serif text-gray-900 tracking-tight sm:text-3xl mb-4">
                                {config.howWeMetTitle || "How We Met"}
                            </h3>
                            <div className="mt-3 text-lg text-gray-600 leading-relaxed whitespace-pre-line">
                                {config.ourStoryBody || `It started with a coffee shop mishap involving two identical orders and one very confused barista. What began as an awkward exchange over oat milk lattes turned into a conversation that lasted for hours.`}
                            </div>
                        </div>
                        <div className="mt-10 lg:mt-0 relative">
                            <div className="aspect-w-3 aspect-h-4 rounded-3xl overflow-hidden bg-gray-100 shadow-xl border-4 border-white transform rotate-2 hover:rotate-0 transition-transform duration-500">
                                {/* Hero Image */}
                                {config.aboutHero ? (
                                    <img src={`/photos/${config.aboutHero}`} alt="About Couple" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full w-full bg-gray-200 text-gray-400 p-8 text-center">
                                        [Couple Photo Placeholder]
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Venue Section */}
            <div className="bg-gray-50 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center">
                        <h2 className="text-3xl font-serif text-gray-900 tracking-tight sm:text-4xl">
                            The Venue
                        </h2>
                        <p className="mt-4 text-lg text-gray-600 whitespace-pre-line">
                            {config.venueDescription || `We'll be celebrating at the historic ${config.weddingVenue || '[Venue]'} in ${config.weddingLocation}.`}
                        </p>
                        {config.venueAddress && (
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.venueAddress)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block mt-4 text-accent hover:text-accent-dark font-medium underline transition-colors"
                            >
                                Get Directions &rarr;
                            </a>
                        )}
                    </div>

                    <div className="mt-12 grid gap-8 grid-cols-1 md:grid-cols-2">
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 transform hover:-translate-y-1 transition-transform duration-300">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">The Ceremony</h3>
                            <p className="text-gray-600">
                                The ceremony will take place at {config.weddingTime} at {config.weddingVenue || 'the venue'}.
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 transform hover:-translate-y-1 transition-transform duration-300">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">The Reception</h3>
                            <p className="text-gray-600">
                                Dinner and dancing will follow immediately.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="py-16">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-3xl font-serif text-center text-gray-900 mb-12">
                        Details & FAQ
                    </h2>

                    {config.faqs && config.faqs.length > 0 ? (
                        <dl className="space-y-8">
                            {config.faqs.map((faq, index) => (
                                <div key={index}>
                                    <dt className="text-lg leading-6 font-medium text-gray-900">{faq.question}</dt>
                                    <dd className="mt-2 text-base text-gray-600 whitespace-pre-line">
                                        {faq.answer}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="text-center text-gray-500 italic">FAQ details coming soon.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
