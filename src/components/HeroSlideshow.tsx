'use client';

import { useState, useEffect, useRef } from 'react';
import { photoSrc, photoSrcSet } from '@/lib/photoSrc';

interface HeroSlideshowProps {
  images: string[];
  interval?: number;
  fallbackImage?: string;
}

export default function HeroSlideshow({ images, interval = 5000, fallbackImage }: HeroSlideshowProps) {
  const [current, setCurrent] = useState(0);
  // firstReady: first image is decoded and can be shown
  const [firstReady, setFirstReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobileRef = useRef(false);

  const srcs = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

  // Detect mobile once on mount
  useEffect(() => {
    isMobileRef.current = window.matchMedia('(max-width: 768px)').matches;
  }, []);

  // Use photoSrc for preload — choose medium (960) for mobile, xl (1920) for desktop
  const preloadUrl = (src: string) =>
    photoSrc(src, isMobileRef.current ? 'medium' : 'xl');

  // Decode first image immediately → show hero ASAP
  // Then preload the rest silently in the background
  useEffect(() => {
    if (srcs.length === 0) return;
    setFirstReady(false);
    setCurrent(0);

    let cancelled = false;

    // Step 1: decode first image → unblock render
    const first = new window.Image();
    first.src = preloadUrl(srcs[0]);
    first.decode()
      .then(() => { if (!cancelled) setFirstReady(true); })
      .catch(() => { if (!cancelled) setFirstReady(true); });

    // Step 2: preload the rest in the background
    if (srcs.length > 1) {
      srcs.slice(1).forEach(src => {
        const img = new window.Image();
        img.src = preloadUrl(src);
        img.decode().catch(() => {});
      });
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcs.join(',')]);

  // Start slideshow once the first image is ready
  useEffect(() => {
    if (!firstReady || srcs.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % srcs.length);
    }, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstReady, srcs.length, interval]);

  const goTo = (i: number) => {
    setCurrent(i);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % srcs.length);
    }, interval);
  };

  if (srcs.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-700 bg-gray-200">
        [Hero Image: Couple B&W Photo]
      </div>
    );
  }

  const next = srcs.length > 1 ? (current + 1) % srcs.length : -1;

  return (
    <>
      {/* Placeholder — solid dark bg while first image decodes */}
      <div
        className="absolute inset-0 bg-gray-900 transition-opacity duration-700"
        style={{ opacity: firstReady ? 0 : 1, zIndex: 2, pointerEvents: 'none' }}
      />

      {srcs.map((src, i) => {
        const isCurrent = i === current;
        const isNext = i === next;
        // Only render images that are current, next, or the very first (pre-decoded)
        if (!isCurrent && !isNext && i !== 0) return null;
        return (
          <img
            key={src}
            src={photoSrc(src, 'xl')}
            srcSet={photoSrcSet(src)}
            sizes="100vw"
            alt="Hero"
            fetchPriority={i === 0 ? 'high' : 'low'}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: isCurrent || isNext ? 1 : 0,
              zIndex: isCurrent ? 1 : 0,
              transition: 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        );
      })}

      {/* Slide dots */}
      {srcs.length > 1 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2 z-20">
          {srcs.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="rounded-full focus:outline-none transition-all duration-300"
              style={{
                width: i === current ? '24px' : '10px',
                height: '10px',
                backgroundColor: i === current ? 'white' : 'rgba(255,255,255,0.5)',
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
