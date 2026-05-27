'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, CSSProperties } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationProps {
    brideName?: string;
    groomName?: string;
    logoMode?: boolean;
    weddingLogo?: string;
    isAdmin?: boolean;
}

export default function Navigation({
    brideName = 'Sarah',
    groomName = 'James',
    logoMode = false,
    weddingLogo = '',
    isAdmin = false,
}: NavigationProps) {
    const [isOpen, setIsOpen]       = useState(false);
    const [basicMode, setBasicMode] = useState(false);
    const [registryEnabled, setReg] = useState(false);
    const [hiddenPaths, setHidden]  = useState<Set<string>>(new Set());
    const [scrolled, setScrolled]   = useState(false);
    const [pillWidth, setPillWidth] = useState(0);
    const logoRef  = useRef<HTMLDivElement>(null);
    const linksRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const isHome = pathname === '/';
    const [aboutInView, setAboutInView] = useState(false);

    // All pages: full banner at top, island when scrolled.
    const island = scrolled;

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(r => r.json())
            .then(d => { setBasicMode(d.basicMode || false); setReg(d.registry?.enabled || false); })
            .catch(() => {});
        if (!isAdmin) {
            fetch('/api/wip-status')
                .then(r => r.json())
                .then((d: Record<string, { is_hidden: boolean }>) =>
                    setHidden(new Set(Object.entries(d).filter(([, v]) => v.is_hidden).map(([k]) => k))))
                .catch(() => {});
        }
    }, [isAdmin]);

    // Listen for scroll changes
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 60);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Sync with hero collapse animation on the home page.
    // The hero hijacks wheel events so scrollY never changes during the animation —
    // these custom events let the nav transition in perfect sync with the hero.
    useEffect(() => {
        const onCollapsing = () => setScrolled(true);
        const onExpanded   = () => setScrolled(false);
        window.addEventListener('hero-collapsing', onCollapsing);
        window.addEventListener('hero-expanded',   onExpanded);
        return () => {
            window.removeEventListener('hero-collapsing', onCollapsing);
            window.removeEventListener('hero-expanded',   onExpanded);
        };
    }, []);

    // On every route change: re-check actual scroll position.
    // Navigation lives in the layout and never unmounts, so `scrolled` state
    // would carry over from the previous page without this reset.
    useEffect(() => {
        setScrolled(window.scrollY > 60);
        setIsOpen(false);
    }, [pathname]);

    // Track whether the #about section is visible so we can highlight the About nav link.
    useEffect(() => {
        if (pathname !== '/') { setAboutInView(false); return; }
        const el = document.getElementById('about');
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setAboutInView(entry.isIntersecting),
            { threshold: 0.2 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [pathname]);

    const allLinks = [
        { href: '/', label: 'Home' },
        { href: '/#about', label: 'About' },
        { href: '/our-story', label: 'Timeline' },
        { href: '/wedding-party', label: 'Wedding Party' },
        { href: '/schedule', label: 'Schedule' },
        { href: '/photos', label: 'Photos' },
        { href: '/registry', label: 'Registry' },
        { href: '/rsvp', label: 'RSVP' },
    ];
    const basicModePages = ['/', '/#about', '/our-story', '/photos'];
    const links = (basicMode && !isAdmin
        ? allLinks.filter(l => basicModePages.includes(l.href))
        : allLinks
    ).filter(l => l.href !== '/registry' || registryEnabled || isAdmin)
     .filter(l => isAdmin || !hiddenPaths.has(l.href));

    const isActive = (href: string) => {
        if (href === '/#about') return aboutInView;
        if (href === '/') return pathname === '/' && !aboutInView;
        return pathname?.startsWith(href);
    };

    // Measure content width so the island hugs the logo + links tightly.
    // 56px = 28px padding each side, 32px = gap between logo and links.
    useEffect(() => {
        const measure = () => {
            const lw = logoRef.current?.offsetWidth  ?? 0;
            const rw = linksRef.current?.offsetWidth ?? 0;
            if (lw + rw > 0) setPillWidth(lw + rw + 56 + 32);
        };
        measure();
        const t = setTimeout(measure, 150);
        return () => clearTimeout(t);
    }, [links.length, logoMode, weddingLogo, isAdmin]);

    // ── Positioning ────────────────────────────────────────────────────────────
    // Full-bar:  left:0  right:0  top:0   → edge-to-edge banner
    // Island desktop: centered pill sized to content via calc(50% - halfWidth)
    // Island mobile:  edge-to-edge with 16px insets (logo + hamburger need full width)
    const INSET = 16;
    const halfPill = Math.round((pillWidth || 600) / 2);
    // On mobile (no desktop links visible) always use inset style so hamburger fits
    const [isMobileNav, setIsMobileNav] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const update = () => setIsMobileNav(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    const islandL = island ? (isMobileNav ? `${INSET}px` : `calc(50% - ${halfPill}px)`) : '0';
    const islandR = island ? (isMobileNav ? `${INSET}px` : `calc(50% - ${halfPill}px)`) : '0';

    const barStyle: CSSProperties = {
        position: 'fixed',
        top:   island ? '12px' : '0',
        left:  island ? islandL : '0',
        right: island ? islandR : '0',
        zIndex: 50,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:     '32px',
        padding: island ? '0 28px' : '0 24px',
        height:  island ? '68px'   : '80px',
        background:           'rgba(255,255,255,0.88)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: island ? '20px' : '0',
        boxShadow: island
            ? '0 8px 40px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset'
            : '0 1px 3px rgba(0,0,0,0.06)',
        border: island ? '1px solid rgba(255,255,255,0.65)' : 'none',
        transition: 'top 500ms ease, left 500ms ease, right 500ms ease, height 500ms ease, border-radius 500ms ease, box-shadow 500ms ease, border 500ms ease, padding 500ms ease',
    };

    const linkColor   = '#111827';
    const activeColor = 'var(--accent)';
    const underlineBg = 'var(--accent)';
    const hoverBg     = 'rgba(212,175,55,0.3)';

    // Mobile drawer: sits just below the bar
    const barBottom = island ? 12 + 68 : 80; // top + height

    return (
        <>
            {/* ── Nav bar ── */}
            <div style={barStyle}>

                {/* Logo */}
                <div ref={logoRef} style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Link
                        href="/"
                        className={logoMode && weddingLogo
                            ? 'block py-1'
                            : 'font-serif text-2xl font-bold tracking-tighter'}
                        style={{ color: 'var(--accent)' }}
                    >
                        {logoMode && weddingLogo ? (
                            <Image
                                src={`/api/photos/${weddingLogo}`}
                                alt="Wedding Logo"
                                width={400}
                                height={72}
                                className="h-[72px] w-auto object-contain"
                                unoptimized
                            />
                        ) : (
                            <>{brideName} & {groomName}</>
                        )}
                    </Link>
                </div>

                {/* Desktop links */}
                <div ref={linksRef} className="hidden md:flex items-center" style={{ gap: '4px' }}>
                    {links.map(link => {
                        const active = isActive(link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="relative px-3 py-2 text-sm font-medium uppercase tracking-widest group whitespace-nowrap"
                                style={{
                                    color: active ? activeColor : linkColor,
                                    transition: 'color 300ms ease',
                                }}
                            >
                                {link.label}
                                <span
                                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full origin-left transition-all duration-300"
                                    style={{
                                        background: underlineBg,
                                        transform:  active ? 'scaleX(1)' : 'scaleX(0)',
                                        opacity:    active ? 1 : 0,
                                    }}
                                />
                                {!active && (
                                    <span
                                        className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-200"
                                        style={{ background: hoverBg }}
                                    />
                                )}
                            </Link>
                        );
                    })}
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="ml-2 px-4 py-1.5 rounded-full bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-dark transition-colors shadow"
                        >
                            Admin
                        </Link>
                    )}
                </div>

                {/* Mobile hamburger */}
                <div className="flex items-center gap-3 md:hidden">
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="px-3 py-1 rounded-full bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-dark transition-colors shadow"
                        >
                            Admin
                        </Link>
                    )}
                    <button
                        onClick={() => setIsOpen(o => !o)}
                        type="button"
                        className="inline-flex items-center justify-center p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
                        style={{ color: '#374151' }}
                        aria-controls="mobile-menu"
                        aria-expanded={isOpen}
                    >
                        <span className="sr-only">Open main menu</span>
                        <div className="relative w-6 h-5 flex flex-col justify-between">
                            <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${isOpen ? 'rotate-45 translate-y-2.5' : ''}`} />
                            <span className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${isOpen ? 'opacity-0 scale-x-0' : ''}`} />
                            <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                        </div>
                    </button>
                </div>

            </div>

            {/* ── Mobile drawer ── */}
            <div
                id="mobile-menu"
                className="fixed md:hidden overflow-hidden"
                style={{
                    top:       `${barBottom + 4}px`,
                    left:      island ? islandL : '0',
                    right:     island ? islandR : '0',
                    zIndex:    49,
                    maxHeight: isOpen ? '500px' : '0px',
                    opacity:   isOpen ? 1 : 0,
                    borderRadius: island ? '0 0 20px 20px' : '0',
                    transition: 'max-height 300ms ease, opacity 200ms ease, top 500ms ease, left 500ms ease, right 500ms ease',
                }}
            >
                <div className="bg-white/95 backdrop-blur-xl border border-white/60 shadow-xl px-2 pt-2 pb-3 space-y-1 sm:px-3">
                    {links.map((link, i) => {
                        const active = isActive(link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`block px-4 py-3 rounded-lg text-base font-medium uppercase tracking-widest text-center transition-all duration-200 ${
                                    active ? 'text-accent bg-accent/5' : 'text-gray-900 hover:text-accent hover:bg-gray-50'
                                }`}
                                style={{
                                    transitionDelay: isOpen ? `${i * 30}ms` : '0ms',
                                    transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
                                    opacity:   isOpen ? 1 : 0,
                                }}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
