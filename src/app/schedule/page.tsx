import { getSiteConfig } from '@/lib/config';

export default function SchedulePage() {
    const config = getSiteConfig();
    const events = config.scheduleEvents || [
        {
            time: config.weddingTime || '4:00 PM',
            title: 'Ceremony',
            description: 'We say "I do"!',
            location: 'Main Venue'
        }
    ];

    return (
        <div className="bg-white py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                        Schedule of Events
                    </h1>
                    <p className="mt-4 text-xl text-gray-500 italic font-serif">
                        {config.weddingDate}
                    </p>
                </div>

                <div className="max-w-3xl mx-auto">
                    <div className="space-y-12">
                        {events.map((event, index) => (
                            <div key={index} className="relative flex items-start group">
                                {/* Timeline Line */}
                                {index !== events.length - 1 && (
                                    <div className="absolute top-0 left-8 sm:left-24 h-full w-px bg-gray-200 group-last:hidden" style={{ top: '2rem' }}></div>
                                )}

                                {/* Time Display (Left on Desktop) */}
                                <div className="hidden sm:block w-24 pt-1 pr-6 text-right">
                                    <span className="text-sm font-bold text-accent tracking-wider uppercase">{event.time}</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 ml-4 sm:ml-0 pb-12">
                                    <div className="flex items-center mb-2">
                                        {/* Mobile Time */}
                                        <div className="sm:hidden mr-4">
                                            <span className="text-sm font-bold text-accent tracking-wider uppercase">{event.time}</span>
                                        </div>
                                        {/* Dot */}
                                        <div className="absolute left-0 sm:left-[5.5rem] w-4 h-4 rounded-full bg-accent border-4 border-white shadow-sm transform -translate-x-1.5 sm:translate-x-[0.2rem]"></div>
                                    </div>

                                    <div className="bg-gray-50 p-6 rounded-2xl ml-6 sm:ml-8 border border-gray-100 hover:shadow-lg transition-all duration-300">
                                        <h3 className="text-xl font-bold text-gray-900">{event.title}</h3>
                                        <p className="mt-2 text-gray-600">{event.description}</p>
                                        {event.location && (
                                            <p className="mt-3 text-sm text-gray-400 flex items-center">
                                                <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                {event.location}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Transportation & Details */}
                <div className="mt-20 grid gap-8 grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto">
                    <div className="bg-gray-900 text-white p-8 rounded-2xl text-center shadow-xl">
                        <h3 className="text-xl font-serif mb-4">Shuttle Service</h3>
                        <p className="text-gray-300">
                            Shuttles will depart from the [Hotel Name] every 30 minutes starting at 2:30 PM. Return service begins at 9:00 PM.
                        </p>
                    </div>
                    <div className="bg-accent/10 p-8 rounded-2xl text-center border-2 border-accent/20 shadow-lg">
                        <h3 className="text-xl font-serif mb-4 text-gray-900">Dress Code</h3>
                        <p className="text-gray-600">
                            <strong>Black Tie Optional</strong><br />
                            Tuxedos or dark suits; floor-length or cocktail dresses.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
