import Link from 'next/link';
import { getSiteConfig } from '@/lib/config';
import CountdownClock from '@/components/CountdownClock';
import HeroSlideshow from '@/components/HeroSlideshow';

export const dynamic = 'force-dynamic';

export default function Home() {
  const config = getSiteConfig();
  const isBasicMode = config.basicMode || false;
  const showVenue = config.basicModeShowVenue || false;
  const bgColor = config.pageBgColors?.home || '#ffffff';
  const slideshowEnabled = config.heroSlideshowEnabled || false;
  const slideshowImages = config.heroSlideshowImages || [];
  const slideshowInterval = config.heroSlideshowInterval || 5000;

  return (
    <div style={{ backgroundColor: bgColor }}>
      {/* Hero Section */}
      <div className="relative h-screen">
        <div className="absolute inset-0 bg-gray-900 overflow-hidden">
          <HeroSlideshow
            images={slideshowEnabled ? slideshowImages : (config.homeHero ? [config.homeHero] : [])}
            interval={slideshowInterval}
            fallbackImage={config.homeHero}
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8">
          <p className="text-white text-xl md:text-2xl font-serif italic tracking-wider mb-4">
            {config.homeHeadline || "We're getting married!"}
          </p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-white tracking-tight mb-8">
            {config.brideName} & {config.groomName}
          </h1>
          <p className="text-white text-lg md:text-xl font-light tracking-widest uppercase mb-12">
            {isBasicMode && !showVenue
              ? config.weddingDate
              : `${config.weddingDate} • ${config.weddingLocation}`
            }
          </p>

          {!isBasicMode && (
          <div className="flex flex-col sm:flex-row gap-4">
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
        </div>
      </div>

      {/* Intro Section */}
      <div className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-serif text-gray-900 mb-6">
            {config.homeIntroTitle || "Join us for the celebration"}
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed mb-12 whitespace-pre-line">
            {config.homeIntroBody || `We are so excited to celebrate our special day with our family and friends.
            This website contains wedding day details, travel information, and much more - check back for updates!`}
          </p>

          <CountdownClock
            weddingDate={config.weddingDate}
            weddingTime={config.weddingTime}
            countdownMode={config.countdownMode as 'full' | 'simple' | 'days-only' | undefined}
          />

          <div className="w-24 h-px bg-accent mx-auto mt-12"></div>
        </div>
      </div>
    </div>
  );
}
