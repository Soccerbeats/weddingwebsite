'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Renders the hero as position:fixed inset-0 — directly anchored to viewport
 * edges in CSS, no viewport-unit calculations that can differ across browsers.
 * A spacer div of the same height keeps document flow correct so content
 * below the hero starts at the right place.
 */
export default function HeroWrapper({ children }: { children: ReactNode }) {
    const spacerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Keep spacer height in sync with the actual visible viewport
        const update = () => {
            if (spacerRef.current) {
                spacerRef.current.style.height = `${window.innerHeight}px`;
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    return (
        <>
            {/* Fixed to viewport edges — guaranteed exact fullscreen on every browser */}
            <div className="fixed inset-0" style={{ zIndex: 1 }}>
                {children}
            </div>
            {/* Spacer holds space in document flow; pointer-events:none so hero stays clickable */}
            <div
                ref={spacerRef}
                aria-hidden="true"
                style={{ height: '100svh', pointerEvents: 'none' }}
            />
        </>
    );
}
