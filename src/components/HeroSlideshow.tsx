'use client';

import { useState, useEffect } from 'react';

interface HeroSlideshowProps {
    images: string[];       // filenames from public/photos
    interval?: number;      // ms between slides, default 5000
    fallbackImage?: string; // single homeHero filename if slideshow off
}

export default function HeroSlideshow({ images, interval = 5000, fallbackImage }: HeroSlideshowProps) {
    const [current, setCurrent] = useState(0);
    const [prev, setPrev] = useState<number | null>(null);

    const srcs = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

    useEffect(() => {
        if (srcs.length <= 1) return;
        const timer = setInterval(() => {
            setPrev(current);
            setCurrent(c => (c + 1) % srcs.length);
        }, interval);
        return () => clearInterval(timer);
    }, [srcs.length, interval, current]);

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
                    style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
                />
            ))}
        </>
    );
}
