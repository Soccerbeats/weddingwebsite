'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface Photo {
    id: number;
    filename: string;
    alt: string;
    category: string;
    hearted?: boolean;
    order?: number;
    title?: string;
    description?: string;
}

const ZOOM_SCALE = 4;
const DRAG_THRESHOLD = 4;   // px of movement before a drag suppresses the click-to-toggle
const SLIDE_MS = 300;       // slide animation duration
// The instant layer is full display-size (so it fills the window and sizes the
// frame) but heavily compressed — small file, low quality — not small pixels.
const LOWQ_W = 1920;        // width of the instant low-quality layer

// Full-resolution original, served off the volume via the API route.
// The raw /photos/ static handler and Next's image optimizer only see files
// that existed when the container started, so runtime-uploaded photos 404
// there. /api/photos reads straight off disk with fs and always works.
const fullSrc = (filename: string) => `/api/photos/${filename}`;
// Compressed instant layer — the API route resizes via sharp on the fly.
const lowqSrc = (filename: string) =>
    `/api/photos/${filename}?w=${LOWQ_W}`;

interface PhotoLightboxProps {
    photos: Photo[];
    /** Currently open photo index, or null when closed. */
    index: number | null;
    onClose: () => void;
    /** Controlled navigation — parent owns the index so mutations stay in sync. */
    onNavigate: (newIndex: number) => void;
    /** Optional toolbar rendered as a fixed bottom bar (e.g. admin controls). */
    controls?: (photo: Photo) => React.ReactNode;
}

export default function PhotoLightbox({ photos, index, onClose, onNavigate, controls }: PhotoLightboxProps) {
    const [mounted, setMounted] = useState(false);

    // Sliding carousel: we mount a 3-slot window [prev, current, next] and
    // translate the track. slotK is which slot is centered (0=prev, 1=current,
    // 2=next); base is 1. `animate` toggles the CSS transition off for the
    // silent recentre after a slide commits.
    const [slotK, setSlotK] = useState(1);
    const [animate, setAnimate] = useState(true);
    const slideBusy = useRef(false);

    // Zoom + pan (applies to the current slot only).
    const [zoomed, setZoomed] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);   // the visible window; expands to fill the browser while zoomed
    const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
    const suppressClickRef = useRef(false);

    // Prefetch bookkeeping. `cached` tracks which full images are warm;
    // `fullLoaded` drives the fade-in of the full layer per photo.
    const cached = useRef<Set<string>>(new Set());
    const [fullLoaded, setFullLoaded] = useState<Record<string, boolean>>({});
    const prefetchGen = useRef(0);

    useEffect(() => setMounted(true), []);

    const markFull = useCallback((filename: string) => {
        cached.current.add(filename);
        setFullLoaded(m => (m[filename] ? m : { ...m, [filename]: true }));
    }, []);

    // Sequentially warm every photo, starting from `pivot` and walking forward
    // (wrapping to the end of the list). Re-invoking supersedes any in-flight
    // pass via the generation guard, which is how opening/navigating re-orders
    // the queue to start from the photo you're looking at.
    const runPrefetch = useCallback((pivot: number) => {
        const n = photos.length;
        if (!n) return;
        const gen = ++prefetchGen.current;
        const order = Array.from({ length: n }, (_, k) => photos[(pivot + k) % n]);
        let i = 0;
        const step = () => {
            if (prefetchGen.current !== gen) return;            // superseded
            while (i < order.length && cached.current.has(order[i].filename)) i++;
            if (i >= order.length) return;                      // all warm
            const ph = order[i];
            // Warm the low-quality layer immediately (cheap)...
            const lq = new window.Image();
            lq.src = lowqSrc(ph.filename);
            // ...then the full original, advancing the queue when it lands.
            const full = new window.Image();
            const advance = () => { i++; step(); };
            full.onload = () => { markFull(ph.filename); advance(); };
            full.onerror = advance;
            full.src = fullSrc(ph.filename);
        };
        step();
    }, [photos, markFull]);

    // Cache all photos once loaded, and re-prioritise from the open photo.
    useEffect(() => {
        if (photos.length && index !== null) runPrefetch(index);
    }, [photos, index, runPrefetch]);

    const resetView = useCallback(() => {
        setZoomed(false);
        setPan({ x: 0, y: 0 });
    }, []);

    // Reset transient view state when the lightbox closes so the next open is clean.
    useEffect(() => {
        if (index === null) {
            resetView();
            setSlotK(1);
            setAnimate(true);
            slideBusy.current = false;
        }
    }, [index, resetView]);

    const closeLightbox = useCallback(() => {
        resetView();
        onClose();
    }, [resetView, onClose]);

    // Kick off a slide. The track animates to the neighbouring slot; the window
    // recentres silently in onTrackTransitionEnd once it arrives.
    const slide = useCallback((dir: 1 | -1) => {
        if (slideBusy.current || photos.length < 2) return;
        slideBusy.current = true;
        resetView();
        setAnimate(true);
        setSlotK(dir === 1 ? 2 : 0);
    }, [photos.length, resetView]);

    const handleNext = useCallback(() => slide(1), [slide]);
    const handlePrevious = useCallback(() => slide(-1), [slide]);

    const onTrackTransitionEnd = useCallback((e: React.TransitionEvent) => {
        if (e.propertyName !== 'transform') return;
        const n = photos.length;
        setAnimate(false);          // disable transition for the recentre jump
        if (index !== null) {
            if (slotK === 2) onNavigate((index + 1) % n);
            else if (slotK === 0) onNavigate((index - 1 + n) % n);
        }
        setSlotK(1);
        // Re-enable the transition after the jump has painted.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            setAnimate(true);
            slideBusy.current = false;
        }));
    }, [slotK, photos.length, index, onNavigate]);

    // Pan clamping keeps the scaled image from being dragged fully off-frame.
    const clampPan = useCallback((x: number, y: number) => {
        const img = imgRef.current;
        if (!img) return { x, y };
        // The visible window is the clip box, which expands to fill the browser
        // window while zoomed. Bound the pan so the scaled image can reach its
        // own edges but no further (0 = the image is smaller than the window on
        // that axis, so it stays centred).
        const clip = clipRef.current;
        const viewW = clip?.clientWidth ?? img.clientWidth;
        const viewH = clip?.clientHeight ?? img.clientHeight;
        const maxX = Math.max(0, (ZOOM_SCALE * img.clientWidth - viewW) / 2);
        const maxY = Math.max(0, (ZOOM_SCALE * img.clientHeight - viewH) / 2);
        return {
            x: Math.max(-maxX, Math.min(maxX, x)),
            y: Math.max(-maxY, Math.min(maxY, y)),
        };
    }, []);

    const handleImageClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        if (zoomed) {
            setZoomed(false);
            setPan({ x: 0, y: 0 });
            return;
        }
        // Zoom toward the clicked point: keep it under the cursor by panning by
        // (1 - scale) × the click's offset from the element centre. Capture the
        // rect synchronously — currentTarget is unreliable after the handler.
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - rect.left - rect.width / 2;
        const dy = e.clientY - rect.top - rect.height / 2;
        setPan(clampPan((1 - ZOOM_SCALE) * dx, (1 - ZOOM_SCALE) * dy));
        setZoomed(true);
    }, [zoomed, clampPan]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!zoomed) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    }, [zoomed, pan]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) d.moved = true;
        setPan(clampPan(d.panX + dx, d.panY + dy));
    }, [clampPan]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        suppressClickRef.current = d.moved;
        dragRef.current = null;
        setDragging(false);
    }, []);

    // Lock body scroll while the lightbox is open.
    useEffect(() => {
        if (index === null) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [index]);

    // Keyboard nav + close.
    useEffect(() => {
        if (index === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') handlePrevious();
            else if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [index, closeLightbox, handlePrevious, handleNext]);

    if (!mounted || index === null) return null;

    const n = photos.length;
    // The 3-slot window around the current photo.
    const slots = [(index - 1 + n) % n, index, (index + 1) % n];

    return createPortal(
        <div
            className="fixed inset-0 z-50 overflow-hidden bg-black/90"
            onClick={closeLightbox}
        >
            {/* Close button */}
            <button
                className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 z-50"
                onClick={closeLightbox}
                aria-label="Close"
            >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Previous button */}
            <button
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-50"
                aria-label="Previous photo"
            >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            {/* Next button */}
            <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-50"
                aria-label="Next photo"
            >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
            </button>

            {/* Sliding track: 3 full-width slots, translated by slot. */}
            <div
                className="flex h-full w-full"
                style={{
                    transform: `translateX(${-slotK * 100}%)`,
                    transition: animate ? `transform ${SLIDE_MS}ms ease` : 'none',
                }}
                onTransitionEnd={onTrackTransitionEnd}
            >
                {slots.map((photoIdx, pos) => {
                    const photo = photos[photoIdx];
                    const isCurrent = pos === 1;
                    const loaded = !!fullLoaded[photo.filename];
                    const hasCaption = !!(photo.title || photo.description);
                    return (
                        <div
                            key={`${photoIdx}-${pos}`}
                            className="flex h-full w-full flex-shrink-0 items-center justify-center p-[10px]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* When zoomed, the frame breaks out of its shrink-wrap and
                                fills the whole window (minus the slot's margin) so the
                                magnified image can use every available pixel. */}
                            <div className={`bg-white p-4 rounded text-black flex flex-col ${isCurrent && zoomed ? 'w-full h-full' : ''}`}>
                                {hasCaption && (
                                    <div className="mb-2 flex-shrink-0">
                                        {photo.title && <p className="font-bold text-lg">{photo.title}</p>}
                                        {photo.description && <p className="text-gray-600 text-sm">{photo.description}</p>}
                                    </div>
                                )}
                                {/* Zoom/pan viewport: image scales + translates inside this
                                    clipped box. It fills the frame while zoomed. */}
                                <div
                                    ref={isCurrent ? clipRef : undefined}
                                    className={`relative flex items-center justify-center overflow-hidden ${isCurrent && zoomed ? 'flex-1 w-full min-h-0' : ''}`}
                                >
                                    <div
                                        className="relative select-none touch-none"
                                        onClick={isCurrent ? handleImageClick : undefined}
                                        onPointerDown={isCurrent ? handlePointerDown : undefined}
                                        onPointerMove={isCurrent ? handlePointerMove : undefined}
                                        onPointerUp={isCurrent ? handlePointerUp : undefined}
                                        style={{
                                            transform: isCurrent && zoomed
                                                ? `translate(${pan.x}px, ${pan.y}px) scale(${ZOOM_SCALE})`
                                                : 'none',
                                            transition: dragging ? 'none' : 'transform 0.2s ease',
                                            cursor: isCurrent ? (zoomed ? (dragging ? 'grabbing' : 'grab') : 'zoom-in') : 'default',
                                        }}
                                    >
                                        {/* Low-quality layer — sizes the box, shows instantly */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            ref={isCurrent ? imgRef : undefined}
                                            src={lowqSrc(photo.filename)}
                                            alt={photo.alt}
                                            draggable={false}
                                            className="block object-contain select-none blur-[2px]"
                                            style={{
                                                maxWidth: 'calc(100vw - 40px)',
                                                maxHeight: `calc(100vh - ${hasCaption ? 130 : 80}px)`,
                                            }}
                                        />
                                        {/* Full-resolution layer — fades in on load */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={fullSrc(photo.filename)}
                                            alt={photo.alt}
                                            draggable={false}
                                            onLoad={() => markFull(photo.filename)}
                                            className="absolute inset-0 h-full w-full object-contain select-none"
                                            style={{
                                                opacity: loaded ? 1 : 0,
                                                transition: 'opacity 0.3s ease',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Optional controls toolbar (admin) — fixed bottom bar. */}
            {controls && (
                <div
                    className="absolute bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    {controls(photos[index])}
                </div>
            )}
        </div>,
        document.body
    );
}
