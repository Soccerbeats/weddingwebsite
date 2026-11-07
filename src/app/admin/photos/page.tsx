'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SaveStatus, useAutosave } from '@/components/admin/useAutosave';
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
import PhotoLightbox from '@/components/PhotoLightbox';
import { Drawer } from '@/components/admin/Drawer';

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
    onSetHero: (type: HeroSlot, filename: string) => void;
    onDelete: (id: number) => void;
    onToggleHeart: (id: number, hearted: boolean) => void;
    onEdit: (photo: Photo) => void;
    onOpen: () => void;
}

function SortablePhoto({ photo, onSetHero, onDelete, onToggleHeart, onEdit, onOpen }: SortablePhotoProps) {
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
            onClick={onOpen}
            className="relative group bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 aspect-square shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
        >
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 break-all p-2 bg-gray-50">
                {photo.filename}
            </div>
            <Image
                src={`/api/photos/${photo.filename}?w=640`}
                alt={photo.alt}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Heart button (always visible in top left) - has higher z-index to stay above overlay */}
            <button
                onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onToggleHeart(photo.id, !photo.hearted); }}
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
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 z-20 bg-white/90 hover:bg-white rounded-full p-1.5 cursor-grab active:cursor-grabbing shadow-lg hover:shadow-xl transition-all duration-300"
                title="Drag to reorder"
            >
                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                </svg>
            </button>

            {/* Overlay background bubbles clicks up to open the viewer; each
                action button stops propagation so it only does its own thing. */}
            <div className="absolute inset-0 bg-black/80 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between z-10">
                <div className="flex flex-col gap-2 items-center justify-center flex-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(photo); }}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white py-1.5 px-3 rounded-lg border border-blue-400 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Edit Details
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetHero('homeHero', photo.filename); }}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Home Hero
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetHero('aboutHero', photo.filename); }}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set About Hero
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetHero('footerHeroImage', photo.filename); }}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Footer Hero
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetHero('weddingLogo', photo.filename); }}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Wedding Logo
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetHero('venuePhoto', photo.filename); }}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg border border-white/30 shadow-md hover:shadow-lg transition-all duration-300"
                    >
                        Set Venue Photo
                    </button>
                </div>

                <div className="flex justify-between items-end">
                    <div className="text-white text-xs max-w-[70%]">
                        <div className="font-semibold truncate">{photo.title || photo.alt}</div>
                        {photo.description && <div className="text-gray-300 text-[10px] truncate">{photo.description}</div>}
                        <div className="text-gray-400 text-[10px] truncate mt-1">{photo.filename}</div>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
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

/** Every site.json key that holds one chosen photo. */
type HeroSlot =
    | 'homeHero' | 'homeHeroMobile' | 'aboutHero' | 'footerHeroImage' | 'footerHeroImageMobile'
    | 'weddingLogo' | 'venuePhoto';

const SLOT_NAMES: Record<HeroSlot, string> = {
    homeHero: 'Home Hero Image',
    homeHeroMobile: 'Home Hero Image for phones',
    aboutHero: 'About Hero Image',
    footerHeroImage: 'Footer Hero Image',
    footerHeroImageMobile: 'Footer Image for phones',
    weddingLogo: 'Wedding Logo',
    venuePhoto: 'Venue Photo',
};

/**
 * The phone version of a photo slot: a portrait thumbnail, the photo it falls
 * back to when none is chosen, and the two things you can do about it.
 */
function PhoneSlot({ label, own, fallback, onChoose, onClear }: {
    label: string;
    own: string;
    fallback: string;
    onChoose: () => void;
    onClear: () => void;
}) {
    const shown = own || fallback;
    return (
        <div>
            <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
            <div className="mt-1 flex items-end gap-3">
                <button
                    type="button"
                    onClick={onChoose}
                    className="group relative h-28 w-16 shrink-0 overflow-hidden rounded-xl border-[3px] border-gray-900 bg-gray-200 shadow-md transition-transform hover:-translate-y-0.5"
                    title="Choose the photo phones show"
                >
                    {shown
                        ? <img src={`/api/photos/${shown}?w=320`} alt="" className={`h-full w-full object-cover ${own ? '' : 'opacity-60 grayscale'}`} />
                        : <span className="flex h-full items-center justify-center text-[10px] text-gray-500">None</span>}
                    <span className="absolute left-1/2 top-1 h-1 w-5 -translate-x-1/2 rounded-full bg-gray-900/80" aria-hidden="true" />
                </button>
                <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-[11px] leading-snug text-gray-500">
                        {own ? 'Its own photo' : 'Same as the main one, cropped'}
                    </p>
                    <button
                        type="button"
                        onClick={onChoose}
                        className="self-start rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:ring-accent transition"
                    >
                        {own ? 'Change' : 'Choose…'}
                    </button>
                    {own && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="self-start px-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                            Use the main one
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminPhotos() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [siteConfig, setSiteConfig] = useState<Record<HeroSlot, string>>({
        homeHero: '', homeHeroMobile: '', aboutHero: '', footerHeroImage: '', footerHeroImageMobile: '',
        weddingLogo: '', venuePhoto: '',
    });
    /** Which phone slot the photo picker is choosing for, when it is open. */
    const [phonePicker, setPhonePicker] = useState<'homeHeroMobile' | 'footerHeroImageMobile' | null>(null);
    const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
    const [editForm, setEditForm] = useState({ title: '', description: '' });
    const [photosSubtitle, setPhotosSubtitle] = useState('Moments from our journey together.');
    const [subtitleLoaded, setSubtitleLoaded] = useState(false);
    // The lightbox tracks the open photo by id (not index) so that hearting —
    // which re-sorts the grid — keeps the same photo in view.
    const [viewerPhotoId, setViewerPhotoId] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const viewerIndex = viewerPhotoId === null
        ? null
        : photos.findIndex((p) => p.id === viewerPhotoId);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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
        setSiteConfig(prev => ({ ...prev, ...data }));
        if (data.photosSubtitle) setPhotosSubtitle(data.photosSubtitle);
        setSubtitleLoaded(true);
    };

    // Placed after both fetchers on purpose: referencing a `const` arrow
    // function from an effect above its declaration is a use-before-declare the
    // hooks lint rules reject. Both are async, so the state they set lands in a
    // promise rather than synchronously in the effect body — which the rule
    // below cannot see from the call site.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPhotos();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchConfig();
    }, []);

    const saveSubtitle = useCallback(async (value: string) => {
        const res = await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photosSubtitle: value }),
        });
        if (!res.ok) throw new Error(String(res.status));
    }, []);

    const { state: subtitleState, retry: retrySubtitle } =
        useAutosave({ value: photosSubtitle, ready: subtitleLoaded, save: saveSubtitle });

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
        // Hearting re-sorts the photo toward the top of the grid; capture the
        // current scroll position so the reorder doesn't jump the page up.
        const scrollY = window.scrollY;
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
                // Restore the viewport position after the reorder re-renders.
                requestAnimationFrame(() => window.scrollTo(0, scrollY));
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

    const setHero = async (type: HeroSlot, filename: string, quiet = false) => {
        try {
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [type]: filename }),
            });
            if (res.ok) {
                setSiteConfig(prev => ({ ...prev, [type]: filename }));
                if (!quiet) alert(`Updated ${SLOT_NAMES[type]}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to update config');
        }
    };

    // Delete from within the lightbox: after removal, advance to the next photo
    // (or close if it was the last one) so the viewer never lands on nothing.
    const handleViewerDelete = async (photo: Photo) => {
        if (!confirm('Are you sure you want to delete this photo?')) return;

        const idx = photos.findIndex((p) => p.id === photo.id);
        const remaining = photos.filter((p) => p.id !== photo.id);

        try {
            const res = await fetch('/api/admin/photos', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: photo.id }),
            });

            if (res.ok) {
                setPhotos(remaining);
                if (remaining.length === 0) {
                    setViewerPhotoId(null);
                } else {
                    const nextIdx = Math.min(idx, remaining.length - 1);
                    setViewerPhotoId(remaining[nextIdx].id);
                }
            } else {
                alert('Delete failed');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const heroButtons: { type: HeroSlot; label: string }[] = [
        { type: 'homeHero', label: 'Home Hero' },
        { type: 'aboutHero', label: 'About Hero' },
        { type: 'homeHeroMobile', label: 'Phone Hero' },
        { type: 'footerHeroImage', label: 'Footer Hero' },
        { type: 'footerHeroImageMobile', label: 'Phone Footer' },
        { type: 'weddingLogo', label: 'Wedding Logo' },
        { type: 'venuePhoto', label: 'Venue Photo' },
    ];

    // Compact control bar rendered inside the lightbox for the current photo.
    const renderViewerControls = (photo: Photo) => (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/70 px-3 py-2 shadow-xl backdrop-blur max-w-full">
            <button
                onClick={() => handleToggleHeart(photo.id, !photo.hearted)}
                className={`rounded-full p-2 shadow-md transition-all duration-300 ${
                    photo.hearted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/90 hover:bg-white'
                }`}
                title={photo.hearted ? 'Unheart photo' : 'Heart photo'}
            >
                <svg className={`w-5 h-5 ${photo.hearted ? 'text-white fill-current' : 'text-gray-700'}`} viewBox="0 0 20 20" fill={photo.hearted ? 'currentColor' : 'none'} stroke={photo.hearted ? 'none' : 'currentColor'} strokeWidth={photo.hearted ? 0 : 2}>
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
            </button>

            <span className="mx-1 h-6 w-px bg-white/30" aria-hidden />

            {heroButtons.map(({ type, label }) => (
                <button
                    key={type}
                    onClick={() => setHero(type, photo.filename)}
                    className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white shadow-md transition-all duration-300 hover:bg-white/20"
                >
                    Set {label}
                </button>
            ))}

            <span className="mx-1 h-6 w-px bg-white/30" aria-hidden />

            <button
                onClick={() => handleEditPhoto(photo)}
                className="rounded-lg border border-blue-400 bg-blue-500 px-3 py-1.5 text-xs text-white shadow-md transition-all duration-300 hover:bg-blue-600"
            >
                Edit Details
            </button>
            <button
                onClick={() => handleViewerDelete(photo)}
                className="rounded-lg border border-red-400 bg-red-500 px-3 py-1.5 text-xs text-white shadow-md transition-all duration-300 hover:bg-red-600"
            >
                Delete
            </button>
        </div>
    );

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
                    <SaveStatus state={subtitleState} onRetry={retrySubtitle} />
                </div>
            </div>

            <div className="mb-8 p-6 bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-2xl border border-accent/20 shadow-lg">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Current Hero Images</h2>
                <p className="text-sm text-gray-500 mb-4">
                    A phone is tall and narrow, so a wide photo is cropped to fit it. Give the home page and the footer a
                    portrait photo of their own for phones, or leave them on the main one.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Home Page</span>
                        {siteConfig.homeHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/api/photos/${siteConfig.homeHero}?w=320`} alt="Home hero" className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <PhoneSlot
                        label="Home Page · phones"
                        own={siteConfig.homeHeroMobile}
                        fallback={siteConfig.homeHero}
                        onChoose={() => setPhonePicker('homeHeroMobile')}
                        onClear={() => setHero('homeHeroMobile', '', true)}
                    />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">About Page</span>
                        {siteConfig.aboutHero ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/api/photos/${siteConfig.aboutHero}?w=320`} alt="About hero" className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Footer</span>
                        {siteConfig.footerHeroImage ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/api/photos/${siteConfig.footerHeroImage}?w=320`} alt="Footer hero" className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <PhoneSlot
                        label="Footer · phones"
                        own={siteConfig.footerHeroImageMobile}
                        fallback={siteConfig.footerHeroImage}
                        onChoose={() => setPhonePicker('footerHeroImageMobile')}
                        onClear={() => setHero('footerHeroImageMobile', '', true)}
                    />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Wedding Logo</span>
                        {siteConfig.weddingLogo ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/api/photos/${siteConfig.weddingLogo}?w=320`} alt="Wedding logo" className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase">Venue Photo</span>
                        {siteConfig.venuePhoto ? (
                            <div className="h-20 w-32 bg-gray-200 mt-1 relative rounded-lg overflow-hidden shadow-md">
                                <img src={`/api/photos/${siteConfig.venuePhoto}?w=320`} alt="Venue" className="h-full w-full object-cover" />
                            </div>
                        ) : <div className="h-20 w-32 bg-gray-200 mt-1 flex items-center justify-center text-xs rounded-lg">None</div>}
                    </div>
                </div>
            </div>

            <Drawer
                open={phonePicker !== null}
                onClose={() => setPhonePicker(null)}
                width="lg"
                title={
                    <h2 className="pt-1.5 text-lg font-bold text-gray-900">
                        {phonePicker ? SLOT_NAMES[phonePicker] : ''}
                    </h2>
                }
            >
                {phonePicker && (
                    <div>
                        <p className="mb-4 text-sm text-gray-500">
                            Portrait photos are marked — they fill a phone screen without losing anything.
                        </p>
                        {photos.length === 0 && (
                            <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                                No photos yet — upload some on this page, then choose one here.
                            </p>
                        )}
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                            {photos.map(photo => {
                                const chosen = siteConfig[phonePicker] === photo.filename;
                                return (
                                    <button
                                        key={photo.id}
                                        type="button"
                                        onClick={async () => {
                                            await setHero(phonePicker, photo.filename, true);
                                            setPhonePicker(null);
                                        }}
                                        className={`group relative aspect-[9/16] overflow-hidden rounded-xl bg-gray-100 ring-2 transition ${chosen ? 'ring-accent' : 'ring-transparent hover:ring-accent/50'}`}
                                    >
                                        <img
                                            src={`/api/photos/${photo.filename}?w=320`}
                                            alt={photo.title || ''}
                                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            onLoad={e => {
                                                const img = e.currentTarget;
                                                img.parentElement?.toggleAttribute('data-portrait', img.naturalHeight > img.naturalWidth);
                                            }}
                                        />
                                        <span className="pointer-events-none absolute left-1.5 top-1.5 hidden rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white group-data-[portrait]:inline-block">
                                            Portrait
                                        </span>
                                        {chosen && (
                                            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white shadow">✓</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Drawer>

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
                                onSetHero={setHero}
                                onDelete={handleDelete}
                                onToggleHeart={handleToggleHeart}
                                onEdit={handleEditPhoto}
                                onOpen={() => setViewerPhotoId(photo.id)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <PhotoLightbox
                photos={photos}
                index={viewerIndex !== null && viewerIndex >= 0 ? viewerIndex : null}
                onClose={() => setViewerPhotoId(null)}
                onNavigate={(newIndex) => setViewerPhotoId(photos[newIndex].id)}
                controls={renderViewerControls}
            />

            {/* Edit Photo Modal */}
            <Drawer
                open={!!editingPhoto}
                onClose={() => setEditingPhoto(null)}
                title={<h3 className="pt-1.5 text-lg font-bold text-gray-900">Edit Photo Details</h3>}
            >
                {editingPhoto && (<>
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
                </>)}
            </Drawer>

            {/* Scroll to top */}
            <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed bottom-6 right-6 z-40 bg-accent text-white rounded-full p-3 shadow-lg hover:bg-accent-dark hover:shadow-xl transition-all duration-300"
                title="Scroll to top"
                aria-label="Scroll to top"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            </button>
        </div>
    );
}
