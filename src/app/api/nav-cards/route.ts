import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';
import pool from '@/lib/db';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_PASSWORD || 'default_secret_password');

async function isAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return false;
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

interface NavCard {
  href: string;
  slug: string;
  label: string;
  eyebrow: string;
  subtitle: string;
  image: string | null;
}

const ALL_PAGES: NavCard[] = [
  { href: '/our-story',     slug: 'our-story',     label: 'Timeline',      eyebrow: 'Our Journey', subtitle: '', image: null },
  { href: '/wedding-party', slug: 'wedding-party', label: 'Wedding Party', eyebrow: 'The Crew',    subtitle: '', image: null },
  { href: '/schedule',      slug: 'schedule',      label: 'Schedule',      eyebrow: 'The Day',     subtitle: '', image: null },
  { href: '/photos',        slug: 'photos',        label: 'Photos',        eyebrow: 'Gallery',     subtitle: '', image: null },
  { href: '/registry',      slug: 'registry',      label: 'Registry',      eyebrow: 'Gifts',       subtitle: '', image: null },
  { href: '/rsvp',          slug: 'rsvp',          label: 'RSVP',          eyebrow: 'Join Us',     subtitle: '', image: null },
];

function getSitePhotos(): string[] {
  try {
    const photosPath = path.join(process.cwd(), 'public/config/photos.json');
    if (!fs.existsSync(photosPath)) return [];
    const data = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
    const photos: { filename: string; hearted?: boolean }[] = data.photos || [];
    // Hearted first, then the rest
    const hearted = photos.filter(p => p.hearted).map(p => p.filename);
    const rest = photos.filter(p => !p.hearted).map(p => p.filename);
    return [...hearted, ...rest];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const config = getSiteConfig();
    const admin = await isAdmin();

    const hiddenPaths = new Set<string>();
    if (!admin) {
      try {
        const result = await pool.query('SELECT page_path, is_hidden FROM wip_toggles');
        for (const row of result.rows) {
          if (row.is_hidden) hiddenPaths.add(row.page_path);
        }
      } catch {
        // DB unavailable — show all cards
      }
    }

    const subtitleMap: Record<string, string> = {
      'our-story':     config.timelineSubtitle      || '',
      'wedding-party': config.weddingPartySubtitle  || '',
      'schedule':      config.scheduleSubtitle      || '',
      'photos':        config.photosSubtitle        || '',
      'registry':      config.registryPageSubtitle  || '',
      'rsvp':          config.rsvpSubtitle          || '',
    };

    const navCards = config.navCards || {};
    const sitePhotos = getSitePhotos();

    const cards = ALL_PAGES
      .filter(p => {
        if (hiddenPaths.has(p.href)) return false;
        if (p.slug === 'registry' && !config.registry?.enabled) return false;
        return true;
      })
      .map((p, i) => ({
        ...p,
        subtitle: subtitleMap[p.slug] || '',
        // Use custom image if set, otherwise cycle through site photos as defaults
        image: navCards[p.slug] || null,
        defaultPhoto: sitePhotos.length > 0 ? sitePhotos[i % sitePhotos.length] : null,
      }));

    return NextResponse.json(cards);
  } catch (error) {
    console.error('nav-cards GET error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
