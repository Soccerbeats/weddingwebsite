'use client';

import { useState, useEffect, useRef } from 'react';

interface HeroSlideshowProps {
    images: string[];
    interval?: number;
    fallbackImage?: string;
}

export default function HeroSlideshow({ images, interval = 5000, fallbackImage }: HeroSlideshowProps) {
    const [current, setCurrent] = useState(0);
    const [loaded, setLoaded] = useState<boolean[]>([]);
    const [allReady, setAllReady] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const srcs = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

    // Preload all images up front via Image() objects
    useEffect(() => {
        if (srcs.length === 0) return;
        setLoaded(new Array(srcs.length).fill(false));
        setAllReady(false);
        setCurrent(0);

        const status = new Array(srcs.length).fill(false);
        let cancelled = false;

        srcs.forEach((src, i) => {
            const img = new window.Image();
            img.src = `/photos/${src}`;
            const done = () => {
                if (cancelled) return;
                status[i] = true;
                setLoaded([...status]);
                if (status.every(Boolean)) setAllReady(true);
            };
            img.onload = done;
            img.onerror = done; // still advance even if one fails
        });

        return () => { cancelled = true; };
    }, [srcs.join(',')]);

    // Start slideshow only after all images are preloaded
    useEffect(() => {
        if (!allReady || srcs.length <= 1) return;
        timerRef.current = setInterval(() => {
            setCurrent(c => (c + 1) % srcs.length);
        }, interval);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [allReady, srcs.length, interval]);

    if (srcs.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center text-gray-700 bg-gray-200">
                [Hero Image: Couple B&W Photo]
            </div>
        );
    }

    return (
        <>
            {srcs.map((src, i) => (
                <img
                    key={src}
                    src={`/photos/${src}`}
                    alt="Hero"
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
                    style={{ opacity: i === current ? 1 : 0 }}
                />
            ))}
        </>
    );
}
