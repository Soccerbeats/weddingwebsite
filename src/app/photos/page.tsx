import PhotoGallery from '@/components/PhotoGallery';

export default function PhotosPage() {
    return (
        <div className="bg-white py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl">
                        Photo Gallery
                    </h1>
                    <p className="mt-4 text-xl text-gray-500">
                        Moments from our journey together.
                    </p>
                </div>

                <PhotoGallery />
            </div>
        </div>
    );
}
