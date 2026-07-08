'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import PhotoLightbox, { Photo } from './PhotoLightbox';

export default function PhotoGallery() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    useEffect(() => {
        fetch('/config/photos.json')
            .then(res => res.json())
            .then(data => {
                const heartedPhotos = (data.photos || []).filter((photo: Photo) => photo.hearted === true);
                setPhotos(heartedPhotos);
            })
            .catch(err => console.error('Error loading photos:', err));
    }, []);

    return (
        <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {photos.map((photo, index) => (
                    <div
                        key={photo.id}
                        className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => setSelectedIndex(index)}
                    >
                        <Image
                            src={`/api/photos/${photo.filename}?w=640`}
                            alt={photo.alt}
                            fill
                            unoptimized
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover object-center group-hover:opacity-75"
                        />
                    </div>
                ))}
            </div>

            <PhotoLightbox
                photos={photos}
                index={selectedIndex}
                onClose={() => setSelectedIndex(null)}
                onNavigate={setSelectedIndex}
            />
        </div>
    );
}
