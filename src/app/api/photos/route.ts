import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/photos.json');

/**
 * The public gallery's photo list.
 *
 * Hearted photos only, in the admin's drag-and-drop order — the two facts
 * `photos.json` carries that the gallery needs, and nothing else (no unhearted
 * filenames, no admin-only metadata).
 *
 * The gallery used to fetch `/config/photos.json` as a static file. With
 * `output: "standalone"` Next lists the `public/` folder once at boot, so a
 * photos.json first written into the config volume *after* the container
 * started returned 404 until a restart — every fresh install and every demo
 * boot where the seeder lost the race to the web service. Reading the file
 * here, at request time, is what the photo route already does for the images.
 */
export const dynamic = 'force-dynamic';

interface StoredPhoto {
    id: number;
    filename: string;
    alt?: string;
    hearted?: boolean;
    order?: number;
    title?: string;
    description?: string;
}

export async function GET() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return NextResponse.json({ photos: [] });
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { photos?: StoredPhoto[] };
        const photos = (parsed.photos ?? [])
            .filter((p) => p && p.hearted === true && typeof p.filename === 'string')
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((p) => ({
                id: p.id,
                filename: p.filename,
                alt: p.alt ?? '',
                hearted: true,
                order: p.order ?? 0,
                title: p.title,
                description: p.description,
            }));
        return NextResponse.json({ photos }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error reading photos.json for the gallery:', error);
        return NextResponse.json({ photos: [] }, { status: 500 });
    }
}
