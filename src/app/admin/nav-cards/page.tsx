'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const SLUG_GRADIENTS: Record<string, string> = {
  'our-story':     'from-rose-900 via-rose-700 to-pink-600',
  'wedding-party': 'from-violet-900 via-purple-700 to-fuchsia-600',
  'schedule':      'from-sky-900 via-blue-700 to-cyan-600',
  'photos':        'from-amber-900 via-orange-700 to-yellow-600',
  'registry':      'from-emerald-900 via-green-700 to-teal-600',
  'rsvp':          'from-slate-800 via-gray-700 to-zinc-600',
};

interface PageConfig {
  slug: string;
  label: string;
  href: string;
  image: string | null;
}

interface SitePhoto {
  id: number;
  filename: string;
  alt: string;
  title: string;
}

const PAGE_DEFS: Omit<PageConfig, 'image'>[] = [
  { slug: 'our-story',     label: 'Timeline',      href: '/our-story' },
  { slug: 'wedding-party', label: 'Wedding Party', href: '/wedding-party' },
  { slug: 'schedule',      label: 'Schedule',      href: '/schedule' },
  { slug: 'photos',        label: 'Photos',        href: '/photos' },
  { slug: 'registry',      label: 'Registry',      href: '/registry' },
  { slug: 'rsvp',          label: 'RSVP',          href: '/rsvp' },
];

export default function AdminNavCards() {
  const [pages, setPages] = useState<PageConfig[]>(
    PAGE_DEFS.map(p => ({ ...p, image: null }))
  );
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Photo picker state
  const [pickerSlug, setPickerSlug] = useState<string | null>(null);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  useEffect(() => {
    fetch('/api/nav-cards')
      .then(r => r.json())
      .then((cards: { slug: string; image: string | null }[]) => {
        const imageMap: Record<string, string | null> = {};
        cards.forEach(c => { imageMap[c.slug] = c.image; });
        setPages(PAGE_DEFS.map(p => ({ ...p, image: imageMap[p.slug] || null })));
      });
  }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleUpload = async (slug: string, file: File) => {
    setUploading(slug);
    const fd = new FormData();
    fd.append('slug', slug);
    fd.append('file', file);
    const res = await fetch('/api/admin/nav-cards', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      setPages(prev => prev.map(p => p.slug === slug ? { ...p, image: data.filename } : p));
      showMessage('Image updated!');
    } else {
      showMessage('Upload failed.');
    }
    setUploading(null);
  };

  const handleRemove = async (slug: string) => {
    setUploading(slug);
    const res = await fetch('/api/admin/nav-cards', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if ((await res.json()).success) {
      setPages(prev => prev.map(p => p.slug === slug ? { ...p, image: null } : p));
      showMessage('Image removed.');
    }
    setUploading(null);
  };

  const openPicker = async (slug: string) => {
    setPickerSlug(slug);
    if (sitePhotos.length === 0) {
      setPhotosLoading(true);
      const res = await fetch('/api/admin/photos');
      const data = await res.json();
      setSitePhotos(Array.isArray(data) ? data : (data.photos || []));
      setPhotosLoading(false);
    }
  };

  const handlePickPhoto = async (slug: string, filename: string) => {
    setPickerSlug(null);
    setUploading(slug);
    const res = await fetch('/api/admin/nav-cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, sourceFilename: filename }),
    });
    const data = await res.json();
    if (data.success) {
      setPages(prev => prev.map(p => p.slug === slug ? { ...p, image: data.filename } : p));
      showMessage('Image set from gallery!');
    } else {
      showMessage('Failed to set image.');
    }
    setUploading(null);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Nav Cards</h1>
      <p className="text-gray-600 mb-8">
        Set background images for the navigation cards that appear at the bottom of the home page.
        Cards only show for pages that are active in Work in Progress settings.
      </p>

      {message && (
        <div className={`p-4 rounded-xl mb-6 ${message.includes('fail') || message.includes('Failed') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        {pages.map(page => (
          <div key={page.slug} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-center gap-6">
            {/* Thumbnail */}
            <div className="w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 relative">
              <Image
                src={page.image
                  ? `/api/photos/nav-cards/${page.image}`
                  : `/images/nav-defaults/${page.slug}.jpg`}
                alt={page.label}
                fill
                unoptimized
                className="object-cover grayscale"
              />
              {!page.image && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <span className="text-[9px] text-white/70 font-sans uppercase tracking-wider">Default</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">{page.label}</div>
              <div className="text-sm text-gray-500 font-mono">{page.href}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={el => { fileInputRefs.current[page.slug] = el; }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(page.slug, f);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => openPicker(page.slug)}
                disabled={uploading === page.slug}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Gallery
              </button>
              <button
                onClick={() => fileInputRefs.current[page.slug]?.click()}
                disabled={uploading === page.slug}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
              >
                {uploading === page.slug ? 'Saving…' : page.image ? 'Replace' : 'Upload'}
              </button>
              {page.image && (
                <button
                  onClick={() => handleRemove(page.slug)}
                  disabled={uploading === page.slug}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Photo picker modal */}
      {pickerSlug && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Pick from site photos — {PAGE_DEFS.find(p => p.slug === pickerSlug)?.label}
              </h2>
              <button
                onClick={() => setPickerSlug(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {photosLoading ? (
                <div className="text-center text-gray-400 py-12">Loading photos…</div>
              ) : sitePhotos.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  No photos uploaded yet. Upload photos in the Photos section first.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {sitePhotos.map(photo => (
                    <button
                      key={photo.id}
                      onClick={() => handlePickPhoto(pickerSlug, photo.filename)}
                      className="group relative aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-accent transition-all"
                    >
                      <Image
                        src={`/api/photos/${photo.filename}/thumb`}
                        alt={photo.alt || photo.filename}
                        fill
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      {photo.title && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-white text-xs truncate">{photo.title}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
