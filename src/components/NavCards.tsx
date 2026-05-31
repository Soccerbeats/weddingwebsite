'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// Default themed backgrounds shown before a custom image is uploaded
const DEFAULT_BACKGROUNDS: Record<string, { gradient: string; icon: string }> = {
  'our-story': {
    gradient: 'from-rose-900 via-rose-700 to-pink-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>`,
  },
  'wedding-party': {
    gradient: 'from-violet-900 via-purple-700 to-fuchsia-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  'schedule': {
    gradient: 'from-sky-900 via-blue-700 to-cyan-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  },
  'photos': {
    gradient: 'from-amber-900 via-orange-700 to-yellow-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  },
  'registry': {
    gradient: 'from-emerald-900 via-green-700 to-teal-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  },
  'rsvp': {
    gradient: 'from-slate-800 via-gray-700 to-zinc-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="64" height="64" opacity="0.25"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1.24h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z"/></svg>`,
  },
};

function DefaultCardBg({ slug }: { slug: string }) {
  const def = DEFAULT_BACKGROUNDS[slug] || DEFAULT_BACKGROUNDS['rsvp'];
  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${def.gradient} flex items-center justify-center`}>
      <div dangerouslySetInnerHTML={{ __html: def.icon }} />
    </div>
  );
}

interface NavCard {
  href: string;
  slug: string;
  label: string;
  eyebrow: string;
  subtitle: string;
  image: string | null;
}

export default function NavCards() {
  const [cards, setCards] = useState<NavCard[]>([]);

  useEffect(() => {
    fetch('/api/nav-cards')
      .then(r => r.json())
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  if (cards.length === 0) return null;

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-serif text-center text-gray-900 mb-10 tracking-tight">
          Explore
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map(card => (
            <Link key={card.slug} href={card.href} className="group block">
              <div
                className="relative h-64 rounded-2xl overflow-hidden cursor-pointer shadow-md
                           transition-all duration-[350ms] ease-out
                           group-hover:-translate-y-[6px] group-hover:shadow-xl"
              >
                {card.image ? (
                  <Image
                    src={`/api/photos/nav-cards/${card.image}`}
                    alt={card.label}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-[350ms] ease-out group-hover:scale-105"
                  />
                ) : (
                  <DefaultCardBg slug={card.slug} />
                )}

                {/* Dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Text */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-[11px] font-sans tracking-[3px] uppercase text-accent mb-1">
                    {card.eyebrow}
                  </p>
                  <h3 className="text-white font-serif text-2xl leading-tight">
                    {card.label}
                  </h3>
                  {card.subtitle && (
                    <p className="text-white/60 text-sm mt-1 font-sans">
                      {card.subtitle}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
