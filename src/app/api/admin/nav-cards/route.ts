import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');
const NAV_CARDS_DIR = path.join(process.cwd(), 'public/photos/nav-cards');

const VALID_SLUGS = ['about', 'our-story', 'wedding-party', 'schedule', 'photos', 'registry', 'rsvp'];

function saveConfig(config: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const slug = formData.get('slug') as string;
    const file = formData.get('file') as File;

    if (!slug || !file) {
      return NextResponse.json({ error: 'slug and file required' }, { status: 400 });
    }

    if (!VALID_SLUGS.includes(slug)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }

    if (!fs.existsSync(NAV_CARDS_DIR)) {
      fs.mkdirSync(NAV_CARDS_DIR, { recursive: true });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${slug}.${ext}`;
    const filepath = path.join(NAV_CARDS_DIR, filename);

    // Remove old file if extension changed
    for (const oldExt of ['jpg', 'jpeg', 'png', 'webp', 'avif']) {
      const old = path.join(NAV_CARDS_DIR, `${slug}.${oldExt}`);
      if (old !== filepath && fs.existsSync(old)) fs.unlinkSync(old);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    const config = getSiteConfig() as unknown as Record<string, unknown>;
    const navCards = (config.navCards as Record<string, string>) || {};
    navCards[slug] = filename;
    config.navCards = navCards;
    saveConfig(config);

    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('nav-cards POST error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { slug } = await request.json();
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const config = getSiteConfig() as unknown as Record<string, unknown>;
    const navCards = (config.navCards as Record<string, string>) || {};

    if (navCards[slug]) {
      const filepath = path.join(NAV_CARDS_DIR, navCards[slug]);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      delete navCards[slug];
      config.navCards = navCards;
      saveConfig(config);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('nav-cards DELETE error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
