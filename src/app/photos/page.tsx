import PhotoGallery from '@/components/PhotoGallery';
import { getSiteConfig } from '@/lib/config';

export default function PhotosPage() {
    const config = getSiteConfig();
    const bgColor = config.pageBgColors?.photos || '#ffffff';
    const photosSubtitle = config.photosSubtitle || 'Moments from our journey together.';

    return (
        <div style={{ backgroundColor: bgColor }} className="py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                        Photo Gallery
                    </h1>
                    <p className="mt-4 text-xl text-gray-500">
                        {photosSubtitle}
                    </p>
                </div>

                <PhotoGallery />
            </div>
        </div>
    );
}
