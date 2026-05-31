import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';
import pool from '@/lib/db';

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

export async function GET() {
  try {
    const config = getSiteConfig();

    const hiddenPaths = new Set<string>();
    try {
      const result = await pool.query('SELECT page_path, is_hidden FROM wip_toggles');
      for (const row of result.rows) {
        if (row.is_hidden) hiddenPaths.add(row.page_path);
      }
    } catch {
      // DB unavailable — show all cards
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

    const cards = ALL_PAGES
      .filter(p => {
        if (hiddenPaths.has(p.href)) return false;
        if (p.slug === 'registry' && !config.registry?.enabled) return false;
        return true;
      })
      .map(p => ({
        ...p,
        subtitle: subtitleMap[p.slug] || '',
        image: navCards[p.slug] || null,
      }));

    return NextResponse.json(cards);
  } catch (error) {
    console.error('nav-cards GET error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
