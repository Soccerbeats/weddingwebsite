'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

interface ConditionalFooterProps {
    brideName?: string;
    groomName?: string;
    weddingDate?: string;
    weddingLocation?: string;
    footerHeroImage?: string;
}

export default function ConditionalFooter(props: ConditionalFooterProps) {
    const pathname = usePathname();
    if (pathname?.startsWith('/admin')) return null;
    return <Footer {...props} />;
}
