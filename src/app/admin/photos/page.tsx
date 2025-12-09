'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface Photo {
    id: number;
    filename: string;
    alt: string;
    category: string;
}

export default function AdminPhotos() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [siteConfig, setSiteConfig] = useState({ homeHero: '', aboutHero: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchPhotos();
        fetchConfig();
    }, []);

    const fetchPhotos = async () => {
        const res = await fetch('/api/admin/photos');
        const data = await res.json();
        setPhotos(data.photos || []);
    };

    const fetchConfig = async () => {
        const res = await fetch('/api/admin/site-config');
        const data = await res.json();
        setSiteConfig(data);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        setUploading(true);
        const files = Array.from(e.target.files);
        let successCount = 0;

        // Disable input during upload
        if (fileInputRef.current) fileInputRef.current.value = '';

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', 'gallery');

            try {
                const res = await fetch('/api/admin/photos', {
                    method: 'POST',
                    body: formData,
                });

                if (res.ok) {
                    successCount++;
                }
            } catch (err) {
                console.error('Upload error for file:', file.name, err);
            }
        }

        await fetchPhotos();
        setUploading(false);

        if (successCount < files.length) {
            alert(`Uploaded ${successCount}/${files.length} photos. Some failed.`);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this photo?')) return;

        try {
            const res = await fetch('/api/admin/photos', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });

            if (res.ok) {
                setPhotos(prev => prev.filter(p => p.id !== id));
            } else {
                alert('Delete failed');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const setHero = async (type: 'homeHero' | 'aboutHero', filename: string) => {
        try {
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [type]: filename }),
            });
            if (res.ok) {
                setSiteConfig(prev => ({ ...prev, [type]: filename }));
                alert(`Updated ${type === 'homeHero' ? 'Home' : 'About'} Hero Image`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to update config');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Photo Management</h1>
                <div>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent-dark disabled:opacity-50 transition-colors"
                    >
                        {uploading ? 'Uploading...' : 'Upload Photos'}
                    </button>
                </div>
            </div>

            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Current Hero Images</h2>
                <div className="flex gap-4">
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Home Page</span>
                        {siteConfig.homeHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative">
                                <img src={`/photos/${siteConfig.homeHero}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">About Page</span>
                        {siteConfig.aboutHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative">
                                <img src={`/photos/${siteConfig.aboutHero}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs">None</div>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {photos.map((photo) => (
                    <div key={photo.id} className="relative group bg-gray-100 rounded-lg overflow-hidden border border-gray-200 aspect-square">
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 break-all p-2 bg-gray-50">
                            {/* Fallback if image fails to load in admin (e.g. if new upload vs container sync issue) */}
                            {photo.filename}
                        </div>
                        {/* Optimized Thumbnail */}
                        <Image
                            src={`/photos/${photo.filename}`}
                            alt={photo.alt}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="absolute inset-0 w-full h-full object-cover"
                        />

                        <div className="absolute inset-0 bg-black/80 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between">
                            <div className="flex flex-col gap-2 mt-2">
                                <button
                                    onClick={() => setHero('homeHero', photo.filename)}
                                    className="text-xs bg-white/10 hover:bg-white/20 text-white py-1 px-2 rounded border border-white/30"
                                >
                                    Set Home Hero
                                </button>
                                <button
                                    onClick={() => setHero('aboutHero', photo.filename)}
                                    className="text-xs bg-white/10 hover:bg-white/20 text-white py-1 px-2 rounded border border-white/30"
                                >
                                    Set About Hero
                                </button>
                            </div>

                            <div className="flex justify-between items-end">
                                <span className="text-white text-xs truncate max-w-[70%]">{photo.alt}</span>
                                <button
                                    onClick={() => handleDelete(photo.id)}
                                    className="text-red-400 hover:text-red-200"
                                    title="Delete"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
