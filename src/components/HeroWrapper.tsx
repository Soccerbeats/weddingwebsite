'use client';

import { useEffect, useRef } from 'react';

export default function HeroWrapper({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const setHeight = () => {
            if (ref.current) {
                ref.current.style.height = `${window.innerHeight}px`;
            }
        };
        setHeight();
        window.addEventListener('resize', setHeight);
        return () => window.removeEventListener('resize', setHeight);
    }, []);

    return (
        <div ref={ref} className="relative" style={{ height: '100svh' }}>
            {children}
        </div>
    );
}
