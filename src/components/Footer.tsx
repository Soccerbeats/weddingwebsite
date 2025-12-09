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
        <footer className="bg-gray-50 border-t border-gray-200 mt-20">
            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8">
                <div className="flex justify-center space-x-6 md:order-2">
                    {/* Add social links here if needed */}
                </div>
                <div className="mt-8 md:mt-0 md:order-1">
                    <p className="text-center text-base text-gray-500">
                        &copy; 2026 {brideName} & {groomName}. Can't wait to celebrate with you!
                    </p>
                </div>
            </div>
        </footer>
    );
}
