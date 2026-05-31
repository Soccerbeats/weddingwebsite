'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

  // Mobile-specific refs
  const mobileSectionRef = useRef<HTMLDivElement>(null);
  const mobileMidRef    = useRef<HTMLDivElement>(null);
  const mobileTopRef    = useRef<HTMLDivElement>(null);
  const mobileBotRef    = useRef<HTMLDivElement>(null);
  const mobileTextRef   = useRef<HTMLDivElement>(null);
  const mobileHintRef   = useRef<HTMLDivElement>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement>(null);
  const mobileStateRef  = useRef<CollapseState>('full');
  const mobileProgressRef = useRef(0);
  const mobileRafRef    = useRef<number>(0);
  const mobileParticles = useRef<Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; life: number; decay: number;
    color: string; rot: number; rotV: number; isPetal: boolean;
  }>>([]);
  const mobileParticleRaf = useRef<number>(0);
  const mobilePostHintRef  = useRef<HTMLDivElement>(null);

  // ── Detect mobile (also responds to resize / DevTools viewport changes) ──
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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

  // ── Mobile: vertical collapse animation on first scroll ──────────────────
  // useLayoutEffect so refs are populated by the time this runs after every
  // render — critical when isMobile flips true in DevTools/resize because
  // useEffect fires before the browser has committed the new mobile JSX.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    if (!isMobile) return;

    const mid  = mobileMidRef.current;
    const top  = mobileTopRef.current;
    const bot  = mobileBotRef.current;
    const text = mobileTextRef.current;
    const hint = mobileHintRef.current;
    if (!mid || !top || !bot) return;

    function applyMobileProgress(p: number) {
      if (!mid || !top || !bot || !text || !hint) return;
      const e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2;

      // Middle strip: full → center third
      mid.style.top    = (33.333 * e) + '%';
      mid.style.height = (100 - 66.666 * e) + '%';

      // Separator lines ride with the mid strip's edges
      const lineAlpha = Math.max(0, Math.min(1, (p - 0.3) / 0.4)).toFixed(3);
      mid.style.borderTop    = `2px solid rgba(255,255,255,${lineAlpha})`;
      mid.style.borderBottom = `2px solid rgba(255,255,255,${lineAlpha})`;

      // Top strip slides in from above (0.15s delay)
      const topE = (() => { const t = Math.max(0, Math.min(1, (p - 0.15) / 0.85)); return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; })();
      top.style.transform = `translateY(${-100 * (1 - topE)}%)`;
      bot.style.transform = `translateY(${100 * (1 - topE)}%)`;

      // Hero text fades out during collapse
      if (text) {
        text.style.opacity   = String(Math.max(0, 1 - e * 3));
        text.style.transform = `translateY(${-e * 30}px)`;
      }

      // Pre-collapse scroll hint fades out
      hint.style.opacity = String(Math.max(0, 1 - p * 5));

      // Post-collapse scroll hint fades in on bottom strip
      const postHint = mobilePostHintRef.current;
      if (postHint) postHint.style.opacity = String(Math.max(0, (p - 0.85) / 0.15));

      // On expand complete, restore text overlay
      if (p === 0 && text) {
        text.style.opacity   = '1';
        text.style.transform = '';
      }
    }

    function fireParticles(direction: 'collapse' | 'expand') {
      const canvas = mobileCanvasRef.current;
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const count = 32;
      for (let i = 0; i < count; i++) {
        let x: number, y: number, vx: number, vy: number;
        if (direction === 'collapse') {
          const seam = Math.random() < 0.5 ? H * 0.333 : H * 0.667;
          x = Math.random() * W;
          y = seam + (Math.random() - 0.5) * 8;
          const angle = (Math.random() - 0.5) * Math.PI * 1.4;
          const speed = 1.2 + Math.random() * 2.2;
          vx = Math.cos(angle) * speed;
          vy = Math.sin(angle) * speed * 0.6;
        } else {
          x = W / 2 + (Math.random() - 0.5) * 40;
          y = H / 2 + (Math.random() - 0.5) * 40;
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 3;
          vx = Math.cos(angle) * speed;
          vy = Math.sin(angle) * speed;
        }
        const type = Math.random();
        mobileParticles.current.push({
          x, y, vx, vy,
          size:    2 + Math.random() * 3,
          life:    1,
          decay:   0.012 + Math.random() * 0.018,
          color:   type < 0.5 ? 'rgba(212,175,55,A)' : type < 0.75 ? 'rgba(255,255,255,A)' : 'rgba(220,140,140,A)',
          rot:     Math.random() * Math.PI * 2,
          rotV:    (Math.random() - 0.5) * 0.15,
          isPetal: Math.random() < 0.35,
        });
      }
      if (mobileParticleRaf.current) cancelAnimationFrame(mobileParticleRaf.current);
      function particleTick() {
        const canvas = mobileCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        mobileParticles.current = mobileParticles.current.filter(p => p.life > 0);
        for (const p of mobileParticles.current) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.045; p.vx *= 0.978;
          p.rot += p.rotV; p.life -= p.decay;
          const alpha = Math.max(0, p.life);
          const col = p.color.replace('A', alpha.toFixed(2));
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          if (p.isPetal) {
            ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.6, p.size * 1.4, 0, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill();
          }
          ctx.restore();
        }
        if (mobileParticles.current.length > 0) mobileParticleRaf.current = requestAnimationFrame(particleTick);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      mobileParticleRaf.current = requestAnimationFrame(particleTick);
    }

    function runMobileAnimation(target: number, onDone: () => void) {
      const from = mobileProgressRef.current;
      const start = performance.now();
      let particleFired = false;
      if (mobileRafRef.current) cancelAnimationFrame(mobileRafRef.current);
      function tick(now: number) {
        const t = Math.min(1, (now - start) / ANIM_DURATION);
        mobileProgressRef.current = from + (target - from) * t;
        applyMobileProgress(mobileProgressRef.current);
        if (!particleFired && mobileProgressRef.current >= 0.65 && mobileProgressRef.current <= 0.85) {
          particleFired = true;
          fireParticles(target === 1 ? 'collapse' : 'expand');
        }
        if (t < 1) mobileRafRef.current = requestAnimationFrame(tick);
        else { mobileProgressRef.current = target; applyMobileProgress(target); onDone(); }
      }
      mobileRafRef.current = requestAnimationFrame(tick);
    }

    // Scroll room = outer section height minus one viewport (mirrors desktop pattern)
    const mobileSectionScrollRoom = () => {
      const section = mobileSectionRef.current;
      if (!section) return 0;
      return section.offsetTop + section.offsetHeight - window.innerHeight;
    };

    function collapse() {
      if (mobileStateRef.current !== 'full') return;
      mobileStateRef.current = 'animating';
      window.dispatchEvent(new CustomEvent('hero-collapsing'));
      runMobileAnimation(1, () => {
        mobileStateRef.current = 'collapsed';
        // Jump scroll to end of section so normal page scroll works — mirrors desktop
        window.scrollTo({ top: mobileSectionScrollRoom(), behavior: 'instant' });
      });
    }

    function expand() {
      if (mobileStateRef.current !== 'collapsed') return;
      mobileStateRef.current = 'animating';
      window.dispatchEvent(new CustomEvent('hero-expanded'));
      runMobileAnimation(0, () => {
        // scrollTo first while state is still 'animating' — this way the
        // scroll event fires with state='animating' (ignored by both jobs)
        // and can't accidentally trigger the job-1 snap-to-collapsed race.
        window.scrollTo({ top: 0, behavior: 'instant' });
        setTimeout(() => { mobileStateRef.current = 'full'; }, 50);
      });
    }

    // Scroll watcher — two jobs:
    // 1. Snap to collapsed if page scrolled past hero without the animation
    //    (back-button, hash nav, etc.)
    // 2. Auto-trigger expand when scrolling back up to the section boundary,
    //    including during iOS momentum scrolling where touch events don't fire.
    const onScroll = () => {
      const s = mobileStateRef.current;

      // Job 1: snap to collapsed
      if (s === 'full' && mobileProgressRef.current === 0 && window.scrollY > 10) {
        cancelAnimationFrame(mobileRafRef.current);
        mobileStateRef.current = 'collapsed';
        mobileProgressRef.current = 1;
        applyMobileProgress(1);
        window.dispatchEvent(new CustomEvent('hero-collapsing'));
        return;
      }

      // Job 2: auto-expand when momentum/active-scroll brings us back to boundary.
      // Use a negative buffer so this only fires when the user has scrolled
      // UP past the landing point, not immediately after the collapse jump.
      if (s === 'collapsed' && window.scrollY <= mobileSectionScrollRoom() - 80) {
        expand();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    let touchStartY: number | null = null;
    function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY; }
    function onTouchMove(e: TouchEvent) {
      const s = mobileStateRef.current;

      // Always block scroll during animation
      if (s === 'animating') { e.preventDefault(); return; }

      if (touchStartY === null) return;
      const dy = touchStartY - e.touches[0].clientY;

      // Hero is full: any downward intent → consume entirely, trigger animation
      if (s === 'full') {
        e.preventDefault(); // block ALL scroll while hero is full
        if (dy > 5) collapse();
        return;
      }

      // Hero is collapsed and user is at section boundary: upward swipe → expand
      if (s === 'collapsed') {
        const atBoundary = window.scrollY <= mobileSectionScrollRoom() + 10;
        if (atBoundary && dy < -5) { e.preventDefault(); expand(); return; }
      }
    }
    function onTouchEnd() { touchStartY = null; }

    // Wheel handler — for desktop browsers at phone-sized viewport widths.
    // Real mobile devices send touch events (above); desktop sends wheel events.
    // Both paths call the same collapse()/expand() so behaviour is identical.
    const onWheel = (e: WheelEvent) => {
      const s = mobileStateRef.current;
      if (s === 'animating') { e.preventDefault(); return; }
      if (s === 'full' && e.deltaY > 0) {
        e.preventDefault();
        collapse();
        return;
      }
      if (s === 'collapsed' && e.deltaY < 0) {
        const atBoundary = window.scrollY <= mobileSectionScrollRoom() + 8;
        if (atBoundary) { e.preventDefault(); expand(); }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    window.addEventListener('wheel',      onWheel,      { passive: false });

    applyMobileProgress(0);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener('wheel',      onWheel);
      window.removeEventListener('scroll', onScroll);
      if (mobileRafRef.current) cancelAnimationFrame(mobileRafRef.current);
      if (mobileParticleRaf.current) cancelAnimationFrame(mobileParticleRaf.current);
    };
  }, [isMobile]);

  if (isMobile) {
    const topSrc = srcs[1] ?? srcs[0];
    const botSrc = srcs[2] ?? srcs[0];
    // 200svh outer section mirrors desktop 200vh pattern:
    // sticky inner stays at top while scroll room lets us jump scrollY after animation
    return (
      <div ref={mobileSectionRef} style={{ height: '200svh' }}>
      <div className="relative" style={{ position: 'sticky', top: 0, height: '100svh', overflow: 'hidden', backgroundColor: bgColor }}>
        {/* Particle canvas — dimensions set via ResizeObserver so they're correct after layout */}
        <canvas
          ref={el => {
            (mobileCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
            if (!el) return;
            const ro = new ResizeObserver(() => {
              el.width  = el.offsetWidth;
              el.height = el.offsetHeight;
            });
            ro.observe(el);
            // Store cleanup on element for GC
            (el as HTMLCanvasElement & { _ro?: ResizeObserver })._ro = ro;
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 30, pointerEvents: 'none' }}
        />

        {/* TOP strip — slides in from above */}
        <div ref={mobileTopRef} style={{
          position: 'absolute', left: 0, right: 0,
          top: 0, height: '33.333%',
          overflow: 'hidden',
          transform: 'translateY(-100%)',
          zIndex: 5,
        }}>
          <div style={{ position: 'absolute', inset: 0, height: '300%', top: 0 }}>
            <div className="absolute inset-0 bg-gray-800 transition-opacity duration-700"
                 style={{ opacity: firstReady ? 0 : 1, zIndex: 2 }} />
            <img src={photoSrc(topSrc, 'medium')} alt=""
                 style={{ position: 'absolute', inset: 0, width: '100%', height: '33.333%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1 }} />
          </div>
        </div>

        {/* MIDDLE strip — main slideshow, images only (text lives outside) */}
        <div ref={mobileMidRef} style={{
          position: 'absolute', left: 0, right: 0,
          top: 0, height: '100%',
          overflow: 'hidden',
          zIndex: 10,
        }}>
          <div className="absolute inset-0 bg-gray-800 transition-opacity duration-700"
               style={{ opacity: firstReady ? 0 : 1, zIndex: 2 }} />
          {srcs.map((src, i) => (
            <img key={src} src={photoSrc(src, 'large')} alt="Hero"
                 fetchPriority={i === 0 ? 'high' : 'low'}
                 className="absolute inset-0 w-full h-full object-cover"
                 style={{
                   opacity: i === currentSlide ? 1 : 0,
                   transition: 'opacity 1200ms cubic-bezier(0.4,0,0.2,1)',
                   zIndex: i === currentSlide ? 1 : 0,
                 }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)', zIndex: 3 }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '160px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)',
            zIndex: 4, pointerEvents: 'none',
          }} />
          {/* Slide dots — above text overlay so always tappable; raised above scroll hint */}
          {srcs.length > 1 && (
            <div style={{
              position: 'absolute', bottom: '56px', left: 0, right: 0,
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

        {/* BOTTOM strip — slides in from below */}
        <div ref={mobileBotRef} style={{
          position: 'absolute', left: 0, right: 0,
          bottom: 0, height: '33.333%',
          overflow: 'hidden',
          transform: 'translateY(100%)',
          zIndex: 5,
        }}>
          <div style={{ position: 'absolute', inset: 0, height: '300%', bottom: 0, top: 'auto' }}>
            <img src={photoSrc(botSrc, 'medium')} alt=""
                 style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', height: '33.333%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1 }} />
          </div>
        </div>

        {/* ── Text overlay ── */}
        <div ref={mobileTextRef} style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {children}
        </div>

        {/* Pre-collapse scroll hint */}
        <div ref={mobileHintRef} style={{
          position: 'absolute', bottom: '20px', left: 0, right: 0,
          textAlign: 'center', zIndex: 21, pointerEvents: 'none',
        }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        animation: 'hint-bounce 1.8s ease-in-out infinite' }}>
            <span style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>scroll</span>
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)' }}>↓</span>
          </div>
        </div>

        {/* Post-collapse scroll hint — on the bottom strip, fades in when animation completes */}
        <div ref={mobilePostHintRef} style={{
          position: 'absolute', bottom: '20px', left: 0, right: 0,
          textAlign: 'center', zIndex: 21, opacity: 0, pointerEvents: 'none',
        }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        animation: 'hint-bounce 1.8s ease-in-out infinite' }}>
            <span style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>scroll</span>
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)' }}>↓</span>
          </div>
        </div>

        <style>{`@keyframes hint-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(5px)} }`}</style>
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
