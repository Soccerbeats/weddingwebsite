'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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
                  <div className="absolute inset-0 bg-gradient-to-br from-accent to-accent-dark" />
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
