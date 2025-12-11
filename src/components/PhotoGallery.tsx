'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Photo {
    id: number;
    filename: string;
    alt: string;
    category: string;
    hearted?: boolean;
    order?: number;
    title?: string;
    description?: string;
}

export default function PhotoGallery() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

    useEffect(() => {
        fetch('/config/photos.json')
            .then(res => res.json())
            .then(data => {
                // Filter to only show hearted photos
                const heartedPhotos = (data.photos || []).filter((photo: Photo) => photo.hearted === true);
                setPhotos(heartedPhotos);
            })
            .catch(err => console.error('Error loading photos:', err));
    }, []);

    const handlePrevious = () => {
        if (!selectedPhoto) return;
        const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id);
        const previousIndex = currentIndex > 0 ? currentIndex - 1 : photos.length - 1;
        setSelectedPhoto(photos[previousIndex]);
    };

    const handleNext = () => {
        if (!selectedPhoto) return;
        const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id);
        const nextIndex = currentIndex < photos.length - 1 ? currentIndex + 1 : 0;
        setSelectedPhoto(photos[nextIndex]);
    };

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
                    {/* Close button */}
                    <button
                        className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 z-50"
                        onClick={() => setSelectedPhoto(null)}
                    >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Previous button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handlePrevious();
                        }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-50"
                        aria-label="Previous photo"
                    >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    {/* Next button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleNext();
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-50"
                        aria-label="Next photo"
                    >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    <div
                        className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center pointer-events-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-white p-4 rounded text-black pointer-events-auto">
                            {(selectedPhoto.title || selectedPhoto.description) && (
                                <div className="mb-2">
                                    {selectedPhoto.title && <p className="font-bold text-lg">{selectedPhoto.title}</p>}
                                    {selectedPhoto.description && <p className="text-gray-600 text-sm">{selectedPhoto.description}</p>}
                                </div>
                            )}
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
