interface FooterProps {
    brideName?: string;
    groomName?: string;
    weddingDate?: string;
    weddingLocation?: string;
}

export default function Footer({
    brideName = 'Sarah',
    groomName = 'James',
    weddingDate = 'June 15, 2024',
    weddingLocation = 'Napa Valley, CA'
}: FooterProps) {
    return (
        <footer className="bg-white">
            {/* Floral Decorative Bar */}
            <div
                className="w-full h-24 bg-cover bg-center"
                style={{ backgroundImage: "url('/images/Gemini_Generated_Image_7xzkxd7xzkxd7xzk.png')" }}
            />

            {/* Footer Content */}
            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8 border-t border-gray-100">
                <div className="flex justify-center space-x-6 md:order-2">
                    {/* Add social links here if needed */}
                </div>
                <div className="mt-8 md:mt-0 md:order-1 w-full">
                    <p className="text-center text-base text-gray-900 font-serif">
                        &copy; 2026 {brideName} & {groomName}. We can't wait to celebrate with you!
                    </p>
                </div>
            </div>
        </footer>
    );
}
