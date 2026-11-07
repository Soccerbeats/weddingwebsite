import Link from 'next/link';
import { getSiteConfig } from '@/lib/config';
import { getI18n } from '@/lib/i18n/server';
import { publicScheduleEvents, scheduleDays, type ScheduleEvent } from '@/lib/schedule';
import { weddingIsoDate } from '@/lib/weddingDate';
import { parseIsoDate } from '@/lib/i18n';
import FadeIn from '@/components/FadeIn';

export default function SchedulePage() {
    const config = getSiteConfig();
    const i18n = getI18n();
    const { m } = i18n;
    // The admin schedule is the whole run of the day — vendor call times, hair
    // and makeup, breakdown — and only the rows ticked "public" belong here.
    // Sorted here as well as in the editor: the timeline reads by the clock even
    // if the stored order is older than that rule, or was written by hand.
    // Nothing configured at all still falls back to the ceremony, so a fresh
    // install has a page rather than an empty one.
    // Sorted by day and then by the clock. A schedule of one day — nearly every
    // wedding — is one group and is drawn with no day headings, as it always was.
    const weddingIso = weddingIsoDate(config.weddingDate);
    const events: ScheduleEvent[] = config.scheduleEvents
        ? publicScheduleEvents(config.scheduleEvents)
        : [
            {
                time: config.weddingTime || '4:00 PM',
                title: m.schedule.defaultTitle,
                description: m.schedule.defaultDescription,
                location: m.schedule.defaultLocation
            }
        ];
    const days = scheduleDays(events, weddingIso);
    const multiDay = days.length > 1;
    const dayDate = (iso: string) => parseIsoDate(iso);
    const bgColor = config.pageBgColors?.schedule || '#ffffff';
    const shuttleText = (config.scheduleShuttleText || '').trim();
    const dressCode = (config.scheduleDressCode || '').trim();

    return (
        <div style={{ backgroundColor: bgColor }} className="py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <FadeIn animation="slide-up" className="text-center mb-16">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                        {m.schedule.title}
                    </h1>
                    <p className="mt-4 text-xl text-gray-500 italic font-serif">
                        {config.weddingDate}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                        <Link
                            href="/rsvp"
                            className="px-8 py-3 bg-accent text-white hover:bg-accent-dark transition-colors rounded-full uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl"
                        >
                            {m.common.rsvpNow}
                        </Link>
                        <Link
                            href="/#faqs"
                            className="px-8 py-3 bg-transparent border-2 border-accent text-accent hover:bg-accent hover:text-white transition-colors rounded-full uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl"
                        >
                            {m.schedule.viewFaqs}
                        </Link>
                    </div>
                </FadeIn>

                {days.length === 0 ? (
                    <p className="text-center text-gray-400 italic font-serif">
                        {m.schedule.empty}
                    </p>
                ) : !multiDay ? (
                    <Timeline events={days[0].events} />
                ) : (
                    <div className="max-w-3xl mx-auto">
                        {/* The weekend at a glance — each day a jump to its section. */}
                        <FadeIn animation="fade" className="mb-14">
                            <nav aria-label={m.schedule.days} className="flex flex-wrap justify-center gap-2 sm:gap-3">
                                {days.map(day => {
                                    const d = dayDate(day.date);
                                    return (
                                        <a
                                            key={day.date || 'wedding'}
                                            href={`#day-${day.date || 'wedding'}`}
                                            className={`group flex min-h-[44px] flex-col items-center justify-center rounded-2xl border px-4 py-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${day.wedding
                                                ? 'border-accent bg-accent text-white shadow-md'
                                                : 'border-gray-200 bg-white/70 text-gray-700 hover:border-accent/60'}`}
                                        >
                                            <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${day.wedding ? 'text-white/80' : 'text-accent'}`}>
                                                {d ? i18n.date(d, { weekday: 'short' }) : m.schedule.weddingDay}
                                            </span>
                                            <span className="font-serif text-lg leading-tight">
                                                {d ? i18n.date(d, { month: 'short', day: 'numeric' }) : '♥'}
                                            </span>
                                        </a>
                                    );
                                })}
                            </nav>
                        </FadeIn>

                        <div className="space-y-20">
                            {days.map(day => {
                                const d = dayDate(day.date);
                                return (
                                    <section
                                        key={day.date || 'wedding'}
                                        id={`day-${day.date || 'wedding'}`}
                                        className="scroll-mt-28"
                                        aria-label={d ? i18n.date(d, { weekday: 'long', month: 'long', day: 'numeric' }) : m.schedule.weddingDay}
                                    >
                                        <FadeIn animation="slide-up" className="mb-10 flex items-center gap-4 sm:gap-6">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-accent/40" />
                                            <div className="text-center">
                                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
                                                    {day.wedding ? m.schedule.weddingDay : (d ? i18n.date(d, { weekday: 'long' }) : '')}
                                                </p>
                                                {d && (
                                                    <h2 className="mt-1 font-serif text-2xl text-gray-900 sm:text-3xl">
                                                        {i18n.date(d, day.wedding
                                                            ? { weekday: 'long', month: 'long', day: 'numeric' }
                                                            : { month: 'long', day: 'numeric' })}
                                                    </h2>
                                                )}
                                            </div>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-accent/40" />
                                        </FadeIn>
                                        <Timeline events={day.events} />
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Transportation & Details — only the cards that have content.
                    These used to be hard-coded placeholders ("[Hotel Name]",
                    "Black Tie Optional") that every guest could read. */}
                {(shuttleText || dressCode) && (
                    <div className="mt-20 grid gap-8 grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto">
                        {shuttleText && (
                            <FadeIn animation="slide-right" className="bg-gray-900 text-white p-8 rounded-2xl text-center shadow-xl">
                                <h3 className="text-xl font-serif mb-4">{m.schedule.gettingThere}</h3>
                                <p className="text-gray-300 whitespace-pre-line">{shuttleText}</p>
                            </FadeIn>
                        )}
                        {dressCode && (
                            <FadeIn animation="slide-left" delay={80} className="bg-accent/10 p-8 rounded-2xl text-center border-2 border-accent/20 shadow-lg">
                                <h3 className="text-xl font-serif mb-4 text-gray-900">{m.schedule.dressCode}</h3>
                                <p className="text-gray-600 whitespace-pre-line">{dressCode}</p>
                            </FadeIn>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/** One day's events down a line, the time beside each. */
function Timeline({ events }: { events: ScheduleEvent[] }) {
    return (
        <div className="max-w-3xl mx-auto">
            <div className="space-y-12">
                {events.map((event, index) => (
                    <FadeIn key={index} animation="slide-up" delay={index * 80} threshold={0.08} className="relative flex items-start group">
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
                                {event.description && <p className="mt-2 text-gray-600">{event.description}</p>}
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
                    </FadeIn>
                ))}
            </div>
        </div>
    );
}
