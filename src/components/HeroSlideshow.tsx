'use client';

import { useState, useEffect, useRef } from 'react';

interface HeroSlideshowProps {
    images: string[];
    interval?: number;
    fallbackImage?: string;
}

export default function HeroSlideshow({ images, interval = 5000, fallbackImage }: HeroSlideshowProps) {
    const [current, setCurrent] = useState(0);
    const [allReady, setAllReady] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const srcs = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

    // Pick URL based on device pixel width — mobile gets a smaller version
    const photoUrl = (src: string) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            return `/api/photos/${src}?w=1200`;
        }
        return `/api/photos/${src}`;
    };

    // Preload all images and wait until they are fully decoded (paint-ready)
    useEffect(() => {
        if (srcs.length === 0) return;
        setAllReady(false);
        setCurrent(0);

        let cancelled = false;
        const status = new Array(srcs.length).fill(false);

        const markDone = (i: number) => {
            if (cancelled) return;
            status[i] = true;
            if (status.every(Boolean)) setAllReady(true);
        };

        srcs.forEach((src, i) => {
            const img = new window.Image();
            img.src = photoUrl(src);
            // decode() waits until the image is fully decoded and GPU-ready,
            // eliminating the black-flash on first transition
            img.decode()
                .then(() => markDone(i))
                .catch(() => markDone(i)); // still proceed if decode fails
        });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [srcs.join(',')]);

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (srcs.length <= 1) return;
        timerRef.current = setInterval(() => {
            setCurrent(c => (c + 1) % srcs.length);
        }, interval);
    };

    // Start slideshow only after all images are decoded
    useEffect(() => {
        if (!allReady) return;
        startTimer();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allReady, srcs.length, interval]);

    const goTo = (i: number) => {
        setCurrent(i);
        startTimer();
    };

    if (srcs.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center text-gray-700 bg-gray-200">
                [Hero Image: Couple B&W Photo]
            </div>
        );
    }

    // Next slide sits fully visible underneath the current one.
    // When current fades out it reveals next already behind it — no simultaneous
    // fade-in needed, which eliminates the black flash on iPhone.
    const next = srcs.length > 1 ? (current + 1) % srcs.length : -1;

    return (
        <>
            {srcs.map((src, i) => {
                const isCurrent = i === current;
                const isNext = i === next;
                return (
                    <img
                        key={src}
                        src={photoUrl(src)}
                        alt="Hero"
                        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
                        style={{
                            opacity: isCurrent || isNext ? 1 : 0,
                            zIndex: isCurrent ? 1 : 0,
                        }}
                    />
                );
            })}

            {/* Slide indicator dots */}
            {srcs.length > 1 && (
                <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2 z-20">
                    {srcs.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => goTo(i)}
                            aria-label={`Go to slide ${i + 1}`}
                            className="transition-all duration-300 rounded-full focus:outline-none"
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
