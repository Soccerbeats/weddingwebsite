'use client';

import { useEffect, useRef, useState } from 'react';
import { photoSrc } from '@/lib/photoSrc';

interface HeroCollapseProps {
  images: string[];
  fallbackImage?: string;
  interval?: number;
  bgColor?: string;
  children?: React.ReactNode;
}

// Photo positions — center-anchored offsets (vw/vh) from the sticky container center.
// Each div has negative margin to center it on its anchor, so these are true center offsets.
const SCATTER: { x: number; y: number; rot: number; w: number }[] = [
  { x: -34, y: -24, rot: -7, w: 19 },
  { x:  34, y: -24, rot:  6, w: 19 },
  { x: -34, y:  14, rot:  5, w: 19 },
  { x:  34, y:  14, rot: -7, w: 19 },
];

// Animation duration (ms)
const ANIM_DURATION = 900;
// Section height in vh (100vh hero + 100vh "already scrolled past" scroll room)
const SECTION_VH    = 200;

type CollapseState = 'full' | 'animating' | 'collapsed';

/** Ease in-out cubic */
function eio(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function HeroCollapse({
  images,
  fallbackImage,
  bgColor = '#ffffff',
  children,
  interval = 5000,
}: HeroCollapseProps) {
  const srcs = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [firstReady,   setFirstReady]   = useState(false);
  const [isMobile,     setIsMobile]     = useState(false);

  const sectionRef   = useRef<HTMLDivElement>(null);
  const mainImgRef   = useRef<HTMLDivElement>(null);
  const textRef      = useRef<HTMLDivElement>(null);
  const scatterRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef       = useRef<number>(0);

  // Animation state — stored in refs so wheel handler always sees latest values
  const stateRef    = useRef<CollapseState>('full');
  const progressRef = useRef(0); // 0 = full screen, 1 = fully collapsed

  // ── Detect mobile ────────────────────────────────────────────────────────
  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 768px)').matches);
  }, []);

  // ── Preload images ────────────────────────────────────────────────────────
  useEffect(() => {
    if (srcs.length === 0) return;
    let cancelled = false;
    const first = new window.Image();
    first.src = photoSrc(srcs[0], isMobile ? 'medium' : 'xl');
    first.decode()
      .then(() => { if (!cancelled) setFirstReady(true); })
      .catch(() => { if (!cancelled) setFirstReady(true); });
    srcs.slice(1).forEach(s => {
      const i = new window.Image();
      i.src = photoSrc(s, isMobile ? 'small' : 'large');
      i.decode().catch(() => {});
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcs.join(','), isMobile]);

  // ── Slideshow timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!firstReady || srcs.length <= 1) return;
    timerRef.current = setInterval(() => setCurrentSlide(c => (c + 1) % srcs.length), interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [firstReady, srcs.length, interval]);

  // ── Apply visual state to DOM (called from RAF loop) ─────────────────────
  // p is RAW linear 0→1. We apply easing within each element.
  const applyProgress = (p: number) => {
    const e = eio(p); // eased p for main image / text

    // Main image: full viewport → condensed strip
    if (mainImgRef.current) {
      mainImgRef.current.style.width        = `${100 - 64 * e}vw`;
      mainImgRef.current.style.height       = `${100 - 20 * e}vh`;
      mainImgRef.current.style.borderRadius = `${e * 20}px`;
      const overlay = mainImgRef.current.querySelector<HTMLElement>('.hero-overlay');
      if (overlay) overlay.style.opacity = String(0.4 - 0.3 * e);
    }

    // Hero text: fade + rise
    if (textRef.current) {
      const tp = Math.max(0, 1 - e * 3);
      textRef.current.style.opacity   = String(tp);
      textRef.current.style.transform = `translateY(${-e * 40}px)`;
    }

    // Scattered photos: fly in/out from off-screen with individual delays + easing
    scatterRefs.current.forEach((el, i) => {
      if (!el) return;
      const delay  = 0.18 + i * 0.10;
      const sp     = Math.max(0, Math.min(1, (p - delay) / 0.38));
      const se     = eio(sp); // eased scatter progress (applies to both in and out)
      const s      = SCATTER[i];
      const startX = s.x < 0 ? -120 : 120;
      el.style.opacity   = String(Math.min(1, sp * 2.5));
      el.style.transform =
        `translate(${startX + (s.x - startX) * se}vw, ${s.y}vh) rotate(${s.rot * se}deg)`;
    });
  };

  // ── Timed animation runner ────────────────────────────────────────────────
  const runAnimation = (target: number, onDone: () => void) => {
    const from  = progressRef.current;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ANIM_DURATION);
      const p = from + (target - from) * t; // linear interpolation — easing is inside applyProgress
      progressRef.current = p;
      applyProgress(p);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        progressRef.current = target;
        applyProgress(target);
        onDone();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  // ── Snap to collapsed if page scrolls past hero without wheel animation ──
  // This handles hash-link navigation (e.g. clicking "About" in the nav),
  // which jumps scrollY past the section without triggering the wheel handler.
  useEffect(() => {
    if (isMobile) return;

    const snapIfNeeded = () => {
      if (stateRef.current !== 'full' || progressRef.current > 0) return;
      if (window.scrollY < 10) return;
      // Programmatic scroll bypassed the wheel animation — snap instantly to collapsed
      cancelAnimationFrame(rafRef.current);
      stateRef.current = 'collapsed';
      progressRef.current = 1;
      applyProgress(1);
      window.dispatchEvent(new CustomEvent('hero-collapsing'));
    };

    window.addEventListener('scroll', snapIfNeeded, { passive: true });
    // Also check immediately in case the page loaded with a hash already scrolled
    snapIfNeeded();
    return () => window.removeEventListener('scroll', snapIfNeeded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // ── Wheel / touch event hijacking (desktop only) ─────────────────────────
  useEffect(() => {
    if (isMobile) return;

    const sectionScrollRoom = () => {
      // The "collapsed" scroll position = section start + SECTION_VH - 100vh
      const section = sectionRef.current;
      if (!section) return 0;
      return section.offsetTop + section.offsetHeight - window.innerHeight;
    };

    const onWheel = (e: WheelEvent) => {
      const state = stateRef.current;

      // Lock scroll during animation
      if (state === 'animating') {
        e.preventDefault();
        return;
      }

      // Collapse: hero is full, user scrolls down
      if (state === 'full' && e.deltaY > 0) {
        e.preventDefault();
        stateRef.current = 'animating';
        // Tell the nav to become an island pill at the same moment the hero starts collapsing
        window.dispatchEvent(new CustomEvent('hero-collapsing'));
        runAnimation(1, () => {
          stateRef.current = 'collapsed';
          // Jump scroll to the end of the section so the page content is reachable
          window.scrollTo({ top: sectionScrollRoom(), behavior: 'instant' });
        });
        return;
      }

      // Expand: hero is collapsed, user scrolls up, and they're still at the section boundary
      if (state === 'collapsed' && e.deltaY < 0) {
        const atSectionBoundary = window.scrollY <= sectionScrollRoom() + 8;
        if (atSectionBoundary) {
          e.preventDefault();
          stateRef.current = 'animating';
          // Tell the nav to go back to full banner at the same moment the hero starts expanding
          window.dispatchEvent(new CustomEvent('hero-expanded'));
          runAnimation(0, () => {
            stateRef.current = 'full';
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
        }
      }
    };

    // Non-passive so we can preventDefault
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // ── Early returns ─────────────────────────────────────────────────────────
  if (srcs.length === 0) {
    return (
      <div style={{ height: '100svh', background: '#1a1a1a' }}
           className="flex items-center justify-center text-gray-400">
        [Add hero photos in admin]
      </div>
    );
  }

  // ── Mobile: normal hero, no collapse ─────────────────────────────────────
  if (isMobile) {
    return (
      <div className="relative" style={{ height: '100svh' }}>
        <div className="absolute inset-0 overflow-hidden bg-gray-900">
          <div className="absolute inset-0 bg-gray-800 transition-opacity duration-700 z-10"
               style={{ opacity: firstReady ? 0 : 1 }} />
          {srcs.map((src, i) => (
            <img key={src} src={photoSrc(src, 'medium')} alt="Hero"
                 fetchPriority={i === 0 ? 'high' : 'low'}
                 className="absolute inset-0 w-full h-full object-cover"
                 style={{
                   opacity: i === currentSlide ? 1 : 0,
                   transition: 'opacity 1200ms cubic-bezier(0.4,0,0.2,1)',
                   zIndex: i === currentSlide ? 1 : 0,
                 }} />
          ))}
          <div className="absolute inset-0 bg-black/40 z-20" />
          <div className="absolute top-0 left-0 right-0 h-40 z-30 pointer-events-none"
               style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)' }} />
        </div>
        <div className="relative z-40 h-full flex flex-col items-center justify-center text-center px-4">
          {children}
        </div>
      </div>
    );
  }

  // ── Desktop: snap-animated collapse ──────────────────────────────────────
  // Section is SECTION_VH tall: 100vh = hero + 100vh scroll room (jumped past on collapse).
  return (
    <div ref={sectionRef} style={{ height: `${SECTION_VH}vh` }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: bgColor,
        }}
      >
        {/* ── Top gradient — ensures white nav text is readable ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '160px', zIndex: 18, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)',
        }} />

        {/* ── Scattered photos — fly in from off-screen ── */}
        {srcs.slice(1, 1 + SCATTER.length).map((src, i) => (
          <div
            key={src}
            ref={el => { scatterRefs.current[i] = el; }}
            style={{
              position: 'absolute',
              left: '50%',
              top:  '50%',
              marginLeft: `-${SCATTER[i].w / 2}vw`,
              marginTop:  `-${SCATTER[i].w * (4 / 3) / 2}vh`,
              width:  `${SCATTER[i].w}vw`,
              aspectRatio: '3 / 4',
              overflow: 'hidden',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: '4px solid white',
              opacity: 0,
              transform: `translate(${SCATTER[i].x < 0 ? -120 : 120}vw, ${SCATTER[i].y}vh) rotate(0deg)`,
              transition: 'none',
              zIndex: 15,
            }}
          >
            <img src={photoSrc(src, 'medium')} alt=""
                 style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}

        {/* ── Main hero image (starts full-screen, condenses to strip) ── */}
        <div
          ref={mainImgRef}
          style={{
            position: 'absolute',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '100vw', height: '100vh',
            overflow: 'hidden',
            borderRadius: '0px',
            transition: 'none',
            zIndex: 10,
          }}
        >
          <div className="absolute inset-0 bg-gray-800 z-30 transition-opacity duration-700"
               style={{ opacity: firstReady ? 0 : 1, pointerEvents: 'none' }} />
          {srcs.map((src, i) => (
            <img key={src} src={photoSrc(src, 'xl')} alt="Hero"
                 fetchPriority={i === 0 ? 'high' : 'low'}
                 style={{
                   position: 'absolute', inset: 0,
                   width: '100%', height: '100%', objectFit: 'cover',
                   opacity: i === currentSlide ? 1 : 0,
                   transition: 'opacity 1200ms cubic-bezier(0.4,0,0.2,1)',
                   zIndex: i === currentSlide ? 1 : 0,
                 }} />
          ))}
          <div className="hero-overlay absolute inset-0 z-20"
               style={{ background: 'rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
        </div>

        {/* ── Hero text ── */}
        <div
          ref={textRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {children}
        </div>

        {/* ── Slide dots ── */}
        {srcs.length > 1 && (
          <div style={{
            position: 'absolute', bottom: '2rem', left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: '8px', zIndex: 25,
          }}>
            {srcs.map((_, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                      aria-label={`Slide ${i + 1}`}
                      style={{
                        width: i === currentSlide ? '24px' : '10px', height: '10px',
                        borderRadius: '9999px', border: 'none', cursor: 'pointer', padding: 0,
                        background: i === currentSlide ? 'white' : 'rgba(255,255,255,0.5)',
                        transition: 'all 300ms',
                      }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
