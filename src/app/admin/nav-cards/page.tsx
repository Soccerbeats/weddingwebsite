'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface PageConfig {
  slug: string;
  label: string;
  href: string;
  image: string | null;
}

const PAGE_DEFS: Omit<PageConfig, 'image'>[] = [
  { slug: 'about',         label: 'About',         href: '/#about' },
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

  useEffect(() => {
    fetch('/api/nav-cards')
      .then(r => r.json())
      .then((cards: { slug: string; image: string | null }[]) => {
        const imageMap: Record<string, string | null> = {};
        cards.forEach(c => { imageMap[c.slug] = c.image; });
        setPages(PAGE_DEFS.map(p => ({ ...p, image: imageMap[p.slug] || null })));
      });
  }, []);

  const handleUpload = async (slug: string, file: File) => {
    setUploading(slug);
    setMessage('');
    const fd = new FormData();
    fd.append('slug', slug);
    fd.append('file', file);
    const res = await fetch('/api/admin/nav-cards', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      setPages(prev => prev.map(p => p.slug === slug ? { ...p, image: data.filename } : p));
      setMessage('Image updated!');
    } else {
      setMessage('Upload failed.');
    }
    setUploading(null);
    setTimeout(() => setMessage(''), 3000);
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
      setMessage('Image removed.');
    }
    setUploading(null);
    setTimeout(() => setMessage(''), 3000);
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
            <div className="w-24 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-accent/30 to-accent-dark/30 flex-shrink-0 relative">
              {page.image ? (
                <Image
                  src={`/api/photos/nav-cards/${page.image}`}
                  alt={page.label}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-accent/60 font-sans">
                  No image
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">{page.label}</div>
              <div className="text-sm text-gray-500 font-mono">{page.href}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
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
                onClick={() => fileInputRefs.current[page.slug]?.click()}
                disabled={uploading === page.slug}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
              >
                {uploading === page.slug ? 'Uploading…' : page.image ? 'Replace' : 'Upload'}
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
    </div>
  );
}
