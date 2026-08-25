import { NextResponse } from 'next/server';
import { getSiteConfig, updateSiteConfig } from '@/lib/config';
import fs from 'fs';
import path from 'path';
import { extensionOf, IMAGE_EXTENSIONS, PHOTOS_DIR, rejectUpload, resolveInPhotos } from '@/lib/uploads';

const NAV_CARDS_DIR = path.join(PHOTOS_DIR, 'nav-cards');

// The pages the public /api/nav-cards route actually renders. 'about' used to
// be accepted here but had no card, so an upload for it went nowhere.
const VALID_SLUGS = ['our-story', 'wedding-party', 'schedule', 'photos', 'registry', 'rsvp'];

function removeOldVariants(slug: string, keep: string) {
  for (const oldExt of IMAGE_EXTENSIONS) {
    const old = path.join(NAV_CARDS_DIR, `${slug}.${oldExt}`);
    if (old !== keep && fs.existsSync(old)) fs.unlinkSync(old);
  }
}

async function record(slug: string, filename: string) {
  await updateSiteConfig((config) => {
    config.navCards = { ...(config.navCards ?? {}), [slug]: filename };
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const slug = String(formData.get('slug') ?? '');
    const file = formData.get('file');

    if (!slug || !(file instanceof File)) {
      return NextResponse.json({ error: 'slug and file required' }, { status: 400 });
    }
    if (!VALID_SLUGS.includes(slug)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }
    const problem = rejectUpload(file);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (!fs.existsSync(NAV_CARDS_DIR)) fs.mkdirSync(NAV_CARDS_DIR, { recursive: true });

    const filename = `${slug}.${extensionOf(file.name)}`;
    const filepath = path.join(NAV_CARDS_DIR, filename);
    removeOldVariants(slug, filepath);
    fs.writeFileSync(filepath, Buffer.from(await file.arrayBuffer()));

    await record(slug, filename);
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('nav-cards POST error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { slug, sourceFilename } = await request.json();

    if (!slug || typeof sourceFilename !== 'string' || !sourceFilename) {
      return NextResponse.json({ error: 'slug and sourceFilename required' }, { status: 400 });
    }
    if (!VALID_SLUGS.includes(slug)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }

    // A gallery filename, and only a gallery filename — no path segments, and
    // it has to be an image the photo route already serves.
    const sourcePath = resolveInPhotos(path.basename(sourceFilename));
    const ext = extensionOf(sourceFilename);
    if (!sourcePath || !IMAGE_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'Invalid source file' }, { status: 400 });
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return NextResponse.json({ error: 'Source file not found' }, { status: 404 });
    }

    if (!fs.existsSync(NAV_CARDS_DIR)) fs.mkdirSync(NAV_CARDS_DIR, { recursive: true });

    const filename = `${slug}.${ext}`;
    const destPath = path.join(NAV_CARDS_DIR, filename);
    removeOldVariants(slug, destPath);
    fs.copyFileSync(sourcePath, destPath);

    await record(slug, filename);
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('nav-cards PATCH error:', error);
    return NextResponse.json({ error: 'Link failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { slug } = await request.json();
    if (!slug || !VALID_SLUGS.includes(slug)) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const current = getSiteConfig().navCards ?? {};
    if (current[slug]) {
      const filepath = path.join(NAV_CARDS_DIR, path.basename(current[slug]));
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      await updateSiteConfig((config) => {
        const navCards = { ...(config.navCards ?? {}) };
        delete navCards[slug];
        config.navCards = navCards;
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('nav-cards DELETE error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
