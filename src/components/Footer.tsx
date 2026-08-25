interface FooterProps {
    /** Unused for display, kept so the shell's props still type-check. */
    brideName?: string;
    groomName?: string;
    weddingDate?: string;
    weddingLocation?: string;
    footerHeroImage?: string;
}

import { parseDateParts } from '@/lib/weddingDate';

export default function Footer({
    brideName = '',
    groomName = '',
    weddingDate = '',
    footerHeroImage
}: FooterProps) {
    // The copyright year is the wedding's year, not a number typed into the
    // template in 2026.
    const year = parseDateParts(weddingDate)?.year ?? new Date().getFullYear();
    const couple = brideName && groomName ? `${brideName} & ${groomName}` : '';
    const imageUrl = footerHeroImage
        ? `/api/photos/${footerHeroImage}`
        : '/images/Gemini_Generated_Image_7xzkxd7xzkxd7xzk.png';

    return (
        <footer
            className="bg-white bg-cover bg-center relative min-h-[300px]"
            style={{ backgroundImage: `url('${imageUrl}')` }}
        >
            {/* Footer Content */}
            <div className="max-w-7xl mx-auto pt-24 pb-12 px-4 sm:px-6 md:flex md:items-start md:justify-between lg:px-8">
                <div className="flex justify-center space-x-6 md:order-2">
                    {/* Add social links here if needed */}
                </div>
                <div className="mt-0 md:mt-0 md:order-1 w-full">
                    <p className="text-center text-base text-gray-900 font-serif">
                        &copy; {year}{couple ? ` ${couple}.` : ''} We can&apos;t wait to celebrate with you!
                    </p>
                </div>
            </div>
        </footer>
    );
}
