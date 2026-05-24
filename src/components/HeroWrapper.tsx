'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Sets hero height to the exact viewport size by measuring an invisible
 * position:fixed element — the only CSS that's guaranteed to be exactly
 * viewport-sized on every browser. The hero itself stays in normal flow
 * so it scrolls away like a regular section.
 */
export default function HeroWrapper({ children }: { children: ReactNode }) {
    const heroRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const update = () => {
            if (!heroRef.current) return;
            // Create a temporary fixed inset-0 element to read the true viewport height
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;visibility:hidden;pointer-events:none;z-index:-9999';
            document.body.appendChild(probe);
            const h = probe.offsetHeight;
            document.body.removeChild(probe);
            heroRef.current.style.height = `${h}px`;
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    return (
        <div ref={heroRef} className="relative" style={{ height: '100svh' }}>
            {children}
        </div>
    );
}
