'use client';

interface FooterProps {
    /** Unused for display, kept so the shell's props still type-check. */
    brideName?: string;
    groomName?: string;
    weddingDate?: string;
    weddingLocation?: string;
    footerHeroImage?: string;
    /** The photo on phones, when the couple picked one; the main one otherwise. */
    footerHeroImageMobile?: string;
}

import { parseDateParts } from '@/lib/weddingDate';
import { useI18n } from '@/components/I18nProvider';

export default function Footer({
    brideName = '',
    groomName = '',
    weddingDate = '',
    footerHeroImage,
    footerHeroImageMobile,
}: FooterProps) {
    // The copyright year is the wedding's year, not a number typed into the
    // template in 2026.
    const year = parseDateParts(weddingDate)?.year ?? new Date().getFullYear();
    const { m } = useI18n();
    const couple = brideName && groomName ? `${brideName} & ${groomName}` : '';
    const imageUrl = footerHeroImage
        ? `/api/photos/${footerHeroImage}`
        : '/images/Gemini_Generated_Image_7xzkxd7xzkxd7xzk.png';
    const phoneUrl = footerHeroImageMobile ? `/api/photos/${footerHeroImageMobile}` : imageUrl;

    return (
        // Two custom properties and a breakpoint rather than two elements: the
        // browser only downloads the one the screen uses.
        <footer
            className="bg-white bg-cover bg-center relative min-h-[300px] bg-[image:var(--footer-photo)] max-md:bg-[image:var(--footer-photo-phone)]"
            style={{
                '--footer-photo': `url('${imageUrl}')`,
                '--footer-photo-phone': `url('${phoneUrl}')`,
            } as React.CSSProperties}
        >
            {/* Footer Content */}
            <div className="max-w-7xl mx-auto pt-24 pb-12 px-4 sm:px-6 md:flex md:items-start md:justify-between lg:px-8">
                <div className="flex justify-center space-x-6 md:order-2">
                    {/* Add social links here if needed */}
                </div>
                <div className="mt-0 md:mt-0 md:order-1 w-full">
                    <p className="text-center text-base text-gray-900 font-serif">
                        &copy; {year}{couple ? ` ${couple}.` : ''} {m.footer.tagline}
                    </p>
                </div>
            </div>
        </footer>
    );
}
