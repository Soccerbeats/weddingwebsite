import Link from 'next/link';
import { getSiteConfig } from '@/lib/config';
import CountdownClock from '@/components/CountdownClock';
import FadeIn from '@/components/FadeIn';
import HeroCollapse from '@/components/HeroCollapse';

export const dynamic = 'force-dynamic';

// Render text that may contain [text](url) markdown links
function renderWithLinks(text: string) {
    const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
            return <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-dark">{match[1]}</a>;
        }
        return <span key={i}>{part}</span>;
    });
}

export default function Home() {
  const config = getSiteConfig();
  const isBasicMode = config.basicMode || false;
  const showVenue = config.basicModeShowVenue || false;
  const bgColor = config.pageBgColors?.home || '#ffffff';
  const aboutBgColor = config.pageBgColors?.about || '#ffffff';
  const slideshowEnabled = config.heroSlideshowEnabled || false;
  const slideshowImages = config.heroSlideshowImages || [];
  const slideshowInterval = config.heroSlideshowInterval || 5000;

  const heroImages = slideshowEnabled ? slideshowImages : (config.homeHero ? [config.homeHero] : []);

  return (
    <div style={{ backgroundColor: bgColor }}>
      {/* ── Hero Section ── */}
      <HeroCollapse
        images={heroImages}
        fallbackImage={config.homeHero}
        interval={slideshowInterval}
        bgColor={bgColor}
      >
        <p
          className="text-white text-xl md:text-2xl font-serif italic tracking-wider mb-4 px-4"
          style={{ animation: 'page-enter 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) 200ms both' }}
        >
          {config.homeHeadline || "We're getting married!"}
        </p>
        <h1
          className="text-5xl md:text-7xl lg:text-8xl font-serif text-white tracking-tight mb-8 px-4 text-center"
          style={{ animation: 'page-enter 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94) 400ms both' }}
        >
          {config.brideName} & {config.groomName}
        </h1>
        <p
          className="text-white text-lg md:text-xl font-light tracking-widest uppercase mb-12 px-4"
          style={{ animation: 'page-enter 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) 600ms both' }}
        >
          {isBasicMode && !showVenue
            ? config.weddingDate
            : `${config.weddingDate} • ${config.weddingLocation}`
          }
        </p>
        {!isBasicMode && (
          <div
            className="flex flex-col sm:flex-row gap-4 px-4"
            style={{ animation: 'page-enter 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) 800ms both' }}
          >
            <Link
              href="/rsvp"
              className="px-8 py-3 bg-accent text-white hover:bg-accent-dark transition-colors rounded-full uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl"
            >
              RSVP Now
            </Link>
            <Link
              href="/schedule"
              className="px-8 py-3 bg-transparent border-2 border-white text-white hover:bg-white hover:text-gray-900 transition-colors rounded-full uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl"
            >
              View Schedule
            </Link>
          </div>
        )}
      </HeroCollapse>

      {/* ── Intro / Countdown Section ── */}
      <div className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn animation="slide-up">
            <h2 className="text-3xl font-serif text-gray-900 mb-6">
              {config.homeIntroTitle || "Join us for the celebration"}
            </h2>
          </FadeIn>
          <FadeIn animation="slide-up" delay={100}>
            <p className="text-lg text-gray-600 leading-relaxed mb-12 whitespace-pre-line">
              {config.homeIntroBody || `We are so excited to celebrate our special day with our family and friends.
              This website contains wedding day details, travel information, and much more - check back for updates!`}
            </p>
          </FadeIn>
          <FadeIn animation="scale" delay={150}>
            <CountdownClock
              weddingDate={config.weddingDate}
              weddingTime={config.weddingTime}
              countdownMode={config.countdownMode as 'full' | 'simple' | 'days-only' | undefined}
            />
          </FadeIn>
          <FadeIn animation="fade" delay={200}>
            <div className="w-24 h-px bg-accent mx-auto mt-12"></div>
          </FadeIn>
        </div>
      </div>

      {/* ── About Section (anchor target for nav "About" link) ── */}
      <div id="about" style={{ backgroundColor: aboutBgColor }}>

        {/* Header */}
        <div className="relative py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <FadeIn animation="slide-up">
              <h2 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
                Our Story
              </h2>
            </FadeIn>
            <FadeIn animation="slide-up" delay={100}>
              <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500 font-serif italic">
                {config.ourStoryTitle || "A chance meeting that turned into forever."}
              </p>
            </FadeIn>
          </div>
        </div>

        {/* How We Met */}
        <div className="py-16 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative lg:grid lg:grid-cols-2 lg:gap-8 items-center">
              <FadeIn animation="slide-right">
                <div>
                  <h3 className="text-2xl font-serif text-gray-900 tracking-tight sm:text-3xl mb-4">
                    {config.howWeMetTitle || "How We Met"}
                  </h3>
                  <div className="mt-3 text-lg text-gray-600 leading-relaxed whitespace-pre-line">
                    {config.ourStoryBody || `It started with a coffee shop mishap involving two identical orders and one very confused barista. What began as an awkward exchange over oat milk lattes turned into a conversation that lasted for hours.`}
                  </div>
                </div>
              </FadeIn>
              <FadeIn animation="slide-left" delay={100}>
                <div className="mt-10 lg:mt-0 relative">
                  <div className="aspect-w-3 aspect-h-4 rounded-3xl overflow-hidden bg-gray-100 shadow-xl border-4 border-white transform rotate-2 hover:rotate-0 transition-transform duration-500">
                    {config.aboutHero ? (
                      <img src={`/api/photos/${config.aboutHero}`} alt="About Couple" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full w-full bg-gray-200 text-gray-400 p-8 text-center">
                        [Couple Photo Placeholder]
                      </div>
                    )}
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>

        {/* Venue Section */}
        {(!isBasicMode || showVenue) && (
          <div className="bg-gray-50 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {config.venuePhoto && (
                <FadeIn animation="slide-up">
                  <div className="mb-10 max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-xl border border-gray-100">
                    <img
                      src={`/api/photos/${config.venuePhoto}`}
                      alt={config.weddingVenue || 'The Venue'}
                      className="w-full h-72 sm:h-96 object-cover"
                    />
                  </div>
                </FadeIn>
              )}
              <div className="text-center">
                <FadeIn animation="slide-up" delay={100}>
                  <h2 className="text-3xl font-serif text-gray-900 tracking-tight sm:text-4xl">
                    The Venue
                  </h2>
                </FadeIn>
                <FadeIn animation="slide-up" delay={200}>
                  <p className="mt-4 text-lg text-gray-600 whitespace-pre-line">
                    {config.venueDescription || `We'll be celebrating at the historic ${config.weddingVenue || '[Venue]'} in ${config.weddingLocation}.`}
                  </p>
                  {config.venueAddress && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.venueAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-6 px-8 py-3 bg-accent text-white hover:bg-accent-dark transition-colors rounded-full uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Get Directions
                    </a>
                  )}
                </FadeIn>
              </div>
              <div className="mt-12 grid gap-8 grid-cols-1 md:grid-cols-2">
                <FadeIn animation="slide-right">
                  <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 transform hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">The Ceremony</h3>
                    <p className="text-gray-600 whitespace-pre-line">
                      {config.ceremonyText || `The ceremony will take place at ${config.weddingTime} at ${config.weddingVenue || 'the venue'}.`}
                    </p>
                  </div>
                </FadeIn>
                <FadeIn animation="slide-left" delay={80}>
                  <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 transform hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">The Reception</h3>
                    <p className="text-gray-600 whitespace-pre-line">
                      {config.receptionText || 'Dinner and dancing will follow immediately.'}
                    </p>
                  </div>
                </FadeIn>
              </div>
            </div>
          </div>
        )}

        {/* FAQ Section */}
        {!isBasicMode && (
          <div id="faqs" className="py-16">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn animation="slide-up">
                <h2 className="text-3xl font-serif text-center text-gray-900 mb-12">
                  Details &amp; FAQ
                </h2>
              </FadeIn>
              {config.faqs && config.faqs.length > 0 ? (
                <dl className="space-y-8">
                  {config.faqs.map((faq, index) => (
                    <FadeIn key={index} animation="slide-up" delay={index * 60}>
                      <div>
                        <dt className="text-lg leading-6 font-medium text-gray-900">{faq.question}</dt>
                        <dd className="mt-2 text-base text-gray-600 whitespace-pre-line">
                          {renderWithLinks(faq.answer)}
                        </dd>
                      </div>
                    </FadeIn>
                  ))}
                </dl>
              ) : (
                <p className="text-center text-gray-500 italic">FAQ details coming soon.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
