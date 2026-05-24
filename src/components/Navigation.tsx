'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

interface NavigationProps {
    brideName?: string;
    groomName?: string;
    logoMode?: boolean;
    weddingLogo?: string;
    isAdmin?: boolean;
}

export default function Navigation({ brideName = 'Sarah', groomName = 'James', logoMode = false, weddingLogo = '', isAdmin = false }: NavigationProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [basicMode, setBasicMode] = useState(false);
    const [registryEnabled, setRegistryEnabled] = useState(false);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                setBasicMode(data.basicMode || false);
                setRegistryEnabled(data.registry?.enabled || false);
            })
            .catch(err => console.error('Error fetching config:', err));
    }, []);

    const allLinks = [
        { href: '/', label: 'Home' },
        { href: '/about', label: 'About' },
        { href: '/our-story', label: 'Timeline' },
        { href: '/wedding-party', label: 'Wedding Party' },
        { href: '/schedule', label: 'Schedule' },
        { href: '/photos', label: 'Photos' },
        { href: '/registry', label: 'Registry' },
        { href: '/rsvp', label: 'RSVP' },
    ];

    // In Basic Mode, only show limited pages — but admins always see everything
    const basicModePages = ['/', '/about', '/our-story', '/photos'];
    const links = (basicMode && !isAdmin
        ? allLinks.filter(link => basicModePages.includes(link.href))
        : allLinks
    ).filter(link => link.href !== '/registry' || registryEnabled || isAdmin);

    return (
        <nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-white/90 backdrop-blur-md shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-20">
                    <div className="flex-shrink-0 flex items-center">
                        <Link href="/" className={logoMode && weddingLogo ? 'block py-1' : 'font-serif text-2xl font-bold tracking-tighter text-accent hover:text-accent-light transition-colors'}>
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

                    {/* Desktop Menu */}
                    <div className="hidden md:ml-6 md:flex md:space-x-8 md:items-center">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="text-gray-900 hover:text-accent px-3 py-2 rounded-md text-sm font-medium transition-colors uppercase tracking-widest"
                            >
                                {link.label}
                            </Link>
                        ))}
                        {isAdmin && (
                            <Link
                                href="/admin"
                                className="ml-2 px-4 py-1.5 rounded-full bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-dark transition-colors shadow"
                            >
                                Admin
                            </Link>
                        )}
                    </div>

                    {/* Mobile menu button */}
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
                            onClick={() => setIsOpen(!isOpen)}
                            type="button"
                            className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-accent hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
                            aria-controls="mobile-menu"
                            aria-expanded="false"
                        >
                            <span className="sr-only">Open main menu</span>
                            {!isOpen ? (
                                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            ) : (
                                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <div className="md:hidden bg-white border-b border-gray-100" id="mobile-menu">
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setIsOpen(false)}
                                className="text-gray-900 hover:text-accent hover:bg-gray-50 block px-3 py-2 rounded-md text-base font-medium uppercase tracking-widest text-center"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    );
}
