'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Photo {
    id: number;
    filename: string;
    alt: string;
    category: string;
}

export default function PhotoGallery() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

    useEffect(() => {
        fetch('/config/photos.json')
            .then(res => res.json())
            .then(data => setPhotos(data.photos))
            .catch(err => console.error('Error loading photos:', err));
    }, []);

    return (
        <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {photos.map((photo) => (
                    <div
                        key={photo.id}
                        className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-2xl bg-gray-200 xl:aspect-w-7 xl:aspect-h-8 shadow-sm group-hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => setSelectedPhoto(photo)}
                    >
                        <div className="relative h-64 w-full">
                            <Image
                                src={`/photos/${photo.filename}`}
                                alt={photo.alt}
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                className="object-cover object-center group-hover:opacity-75"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Lightbox Modal */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" onClick={() => setSelectedPhoto(null)}>
                    <button className="absolute top-4 right-4 text-white hover:text-gray-300 p-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center pointer-events-none">
                        <div className="bg-white p-4 rounded text-black pointer-events-auto">
                            <p className="font-bold text-lg mb-2">{selectedPhoto.alt}</p>
                            <div className="relative h-[80vh] w-full flex items-center justify-center">
                                <img
                                    src={`/photos/${selectedPhoto.filename}`}
                                    alt={selectedPhoto.alt}
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
