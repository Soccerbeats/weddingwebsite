'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

interface SortablePhotoProps {
    photo: Photo;
    siteConfig: any;
    onSetHero: (type: 'homeHero' | 'aboutHero' | 'footerHeroImage' | 'weddingLogo', filename: string) => void;
    onDelete: (id: number) => void;
    onToggleHeart: (id: number, hearted: boolean) => void;
    onEdit: (photo: Photo) => void;
}

function SortablePhoto({ photo, siteConfig, onSetHero, onDelete, onToggleHeart, onEdit }: SortablePhotoProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: photo.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="relative group bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 aspect-square shadow-lg hover:shadow-xl transition-all duration-300"
        >
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 break-all p-2 bg-gray-50">
                {photo.filename}
            </div>
            <Image
                src={`/photos/${photo.filename}`}
                alt={photo.alt}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Heart button (always visible in top left) - has higher z-index to stay above overlay */}
            <button
                onClick={() => onToggleHeart(photo.id, !photo.hearted)}
                className={`absolute top-2 left-2 z-20 rounded-full p-1.5 shadow-lg transition-all duration-300 ${
                    photo.hearted
                        ? 'bg-red-500 hover:bg-red-600 hover:shadow-xl'
                        : 'bg-white/90 hover:bg-white hover:shadow-xl'
                }`}
                title={photo.hearted ? 'Unheart photo' : 'Heart photo'}
            >
                <svg className={`w-4 h-4 ${photo.hearted ? 'text-white fill-current' : 'text-gray-700'}`} viewBox="0 0 20 20" fill={photo.hearted ? 'currentColor' : 'none'} stroke={photo.hearted ? 'none' : 'currentColor'} strokeWidth={photo.hearted ? 0 : 2}>
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Drag handle (always visible in top right) - has higher z-index to stay above overlay */}
            <button
                {...listeners}
                {...attributes}
                className="absolute top-2 right-2 z-20 bg-white/90 hover:bg-white rounded-full p-1.5 cursor-grab active:cursor-grabbing shadow-lg hover:shadow-xl transition-all duration-300"
                title="Drag to reorder"
            >
                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                </svg>
            </button>

            <div className="absolute inset-0 bg-black/80 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between z-10">
                <div className="flex flex-col gap-2 items-center justify-center flex-1">
                    <button
                        onClick={() => onEdit(photo)}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white py-1.5 px-3 rounded-lg border border-blue-400 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Edit Details
                    </button>
                    <button
                        onClick={() => onSetHero('homeHero', photo.filename)}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Home Hero
                    </button>
                    <button
                        onClick={() => onSetHero('aboutHero', photo.filename)}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set About Hero
                    </button>
                    <button
                        onClick={() => onSetHero('footerHeroImage', photo.filename)}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Footer Hero
                    </button>
                    <button
                        onClick={() => onSetHero('weddingLogo', photo.filename)}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Wedding Logo
                    </button>
                </div>

                <div className="flex justify-between items-end">
                    <div className="text-white text-xs max-w-[70%]">
                        <div className="font-semibold truncate">{photo.title || photo.alt}</div>
                        {photo.description && <div className="text-gray-300 text-[10px] truncate">{photo.description}</div>}
                        <div className="text-gray-400 text-[10px] truncate mt-1">{photo.filename}</div>
                    </div>
                    <button
                        onClick={() => onDelete(photo.id)}
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
    );
}

export default function AdminPhotos() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [siteConfig, setSiteConfig] = useState({ homeHero: '', aboutHero: '', footerHeroImage: '', weddingLogo: '' });
    const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
    const [editForm, setEditForm] = useState({ title: '', description: '' });
    const [photosSubtitle, setPhotosSubtitle] = useState('Moments from our journey together.');
    const [subtitleSaving, setSubtitleSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        fetchPhotos();
        fetchConfig();
    }, []);

    const fetchPhotos = async () => {
        const res = await fetch('/api/admin/photos');
        const data = await res.json();
        // Sort by hearted status first (hearted=true comes first), then by order
        const sortedPhotos = (data.photos || []).sort((a: Photo, b: Photo) => {
            // First sort by hearted status (hearted photos first)
            if (a.hearted && !b.hearted) return -1;
            if (!a.hearted && b.hearted) return 1;
            // Then sort by order
            return (a.order || 0) - (b.order || 0);
        });
        setPhotos(sortedPhotos);
    };

    const fetchConfig = async () => {
        const res = await fetch('/api/admin/site-config');
        const data = await res.json();
        setSiteConfig(data);
        if (data.photosSubtitle) setPhotosSubtitle(data.photosSubtitle);
    };

    const handleSaveSubtitle = async () => {
        setSubtitleSaving(true);
        try {
            await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photosSubtitle }),
            });
        } catch (err) {
            console.error('Failed to save subtitle:', err);
        } finally {
            setSubtitleSaving(false);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = photos.findIndex((p) => p.id === active.id);
            const newIndex = photos.findIndex((p) => p.id === over.id);

            const newPhotos = arrayMove(photos, oldIndex, newIndex);
            setPhotos(newPhotos);

            // Update order on server
            const reorder = newPhotos.map((p) => p.id);
            try {
                await fetch('/api/admin/photos', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: active.id, reorder }),
                });
            } catch (err) {
                console.error('Failed to update order:', err);
                // Revert on error
                fetchPhotos();
            }
        }
    };

    const handleToggleHeart = async (id: number, hearted: boolean) => {
        try {
            const res = await fetch('/api/admin/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, hearted }),
            });

            if (res.ok) {
                setPhotos((prev) => {
                    const updated = prev.map((p) => (p.id === id ? { ...p, hearted } : p));
                    // Re-sort after toggling heart
                    return updated.sort((a, b) => {
                        if (a.hearted && !b.hearted) return -1;
                        if (!a.hearted && b.hearted) return 1;
                        return (a.order || 0) - (b.order || 0);
                    });
                });
            }
        } catch (err) {
            console.error('Failed to toggle heart:', err);
        }
    };

    const handleEditPhoto = (photo: Photo) => {
        setEditingPhoto(photo);
        setEditForm({
            title: photo.title || '',
            description: photo.description || ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingPhoto) return;

        try {
            const res = await fetch('/api/admin/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingPhoto.id,
                    title: editForm.title,
                    description: editForm.description
                }),
            });

            if (res.ok) {
                setPhotos((prev) =>
                    prev.map((p) =>
                        p.id === editingPhoto.id
                            ? { ...p, title: editForm.title, description: editForm.description }
                            : p
                    )
                );
                setEditingPhoto(null);
            }
        } catch (err) {
            console.error('Failed to update photo details:', err);
        }
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

    const setHero = async (type: 'homeHero' | 'aboutHero' | 'footerHeroImage' | 'weddingLogo', filename: string) => {
        try {
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [type]: filename }),
            });
            if (res.ok) {
                setSiteConfig(prev => ({ ...prev, [type]: filename }));
                const heroName = type === 'homeHero' ? 'Home' : type === 'aboutHero' ? 'About' : type === 'footerHeroImage' ? 'Footer' : 'Wedding Logo';
                alert(`Updated ${heroName} ${type === 'weddingLogo' ? '' : 'Hero Image'}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to update config');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Photo Management</h1>
                    <p className="text-gray-600">Upload, organize, and manage your wedding photos</p>
                </div>
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
                        className="bg-accent text-white px-6 py-3 rounded-xl hover:bg-accent-dark hover:shadow-xl disabled:opacity-50 transition-all duration-300 shadow-lg font-medium"
                    >
                        {uploading ? 'Uploading...' : 'Upload Photos'}
                    </button>
                </div>
            </div>

            {/* Page Subtitle Editor */}
            <div className="mb-6 p-6 bg-white rounded-2xl border border-gray-200 shadow-lg">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Page Subtitle</h2>
                <p className="text-sm text-gray-500 mb-3">Displayed under &quot;Photo Gallery&quot; on the public photos page.</p>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={photosSubtitle}
                        onChange={(e) => setPhotosSubtitle(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-accent focus:border-accent text-gray-900"
                        placeholder="e.g. Moments from our journey together."
                    />
                    <button
                        onClick={handleSaveSubtitle}
                        disabled={subtitleSaving}
                        className="px-5 py-2 bg-accent text-white rounded-xl hover:bg-accent-dark disabled:opacity-50 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                    >
                        {subtitleSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            <div className="mb-8 p-6 bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-2xl border border-accent/20 shadow-lg">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Current Hero Images</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Home Page</span>
                        {siteConfig.homeHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/photos/${siteConfig.homeHero}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">About Page</span>
                        {siteConfig.aboutHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/photos/${siteConfig.aboutHero}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Footer</span>
                        {siteConfig.footerHeroImage ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/photos/${siteConfig.footerHeroImage}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Wedding Logo</span>
                        {siteConfig.weddingLogo ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/photos/${siteConfig.weddingLogo}`} className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                        {photos.map((photo) => (
                            <SortablePhoto
                                key={photo.id}
                                photo={photo}
                                siteConfig={siteConfig}
                                onSetHero={setHero}
                                onDelete={handleDelete}
                                onToggleHeart={handleToggleHeart}
                                onEdit={handleEditPhoto}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* Edit Photo Modal */}
            {editingPhoto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Photo Details</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-accent focus:border-accent"
                                    placeholder="Photo title"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={editForm.description}
                                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-accent focus:border-accent"
                                    placeholder="Photo description"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setEditingPhoto(null)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="flex-1 px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-dark transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
