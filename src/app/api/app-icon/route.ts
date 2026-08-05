/**
 * Home-screen / PWA icon.
 *
 * iOS needs a real square icon; without one it screenshots the page and uses
 * that. Generated rather than committed so it follows the couple's uploaded
 * logo and accent colour instead of going stale the moment either changes.
 *
 * Deliberately renders no text — Alpine has no fonts installed, so anything
 * font-dependent would rasterise to blank boxes in the production image.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getSiteConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

const PHOTOS_DIR = path.join(process.cwd(), 'public/photos');
const ALLOWED = [180, 192, 256, 512, 1024];

/** A heart drawn as a path so it needs no font to render. */
function heartTile(size: number, bg: string, fg: string) {
    const s = size;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="${bg}"/>
            <path fill="${fg}" d="M50 78c-1.2 0-2.4-.4-3.3-1.3L26.4 57.6a16.6 16.6 0 0 1 0-23.9 17.4 17.4 0 0 1 24.2 0l-.6.6.6-.6a17.4 17.4 0 0 1 24.2 0 16.6 16.6 0 0 1 0 23.9L53.3 76.7A4.7 4.7 0 0 1 50 78z"/>
        </svg>`,
    );
}

function isSafeColor(value: string | undefined): value is string {
    return !!value && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

export async function GET(request: NextRequest) {
    const requested = Number(request.nextUrl.searchParams.get('size'));
    const size = ALLOWED.includes(requested) ? requested : 512;

    const config = getSiteConfig();
    // The admin icon uses a neutral ground so the two Home Screen icons are
    // distinguishable at a glance — same logo, obviously different app.
    //
    // Light, not dark: wedding logos are typically dark artwork on
    // transparency, and this one is black calligraphy that all but disappears
    // against a dark slate. Light grey keeps it legible and still reads as
    // clearly not the vivid accent-coloured public icon.
    const isAdmin = request.nextUrl.searchParams.get('variant') === 'admin';
    const bg = isAdmin
        ? '#e5e7eb'
        : (isSafeColor(config.accentColor) ? config.accentColor : '#D4AF37');

    try {
        let png: Buffer;

        // Prefer the couple's own logo, padded onto the accent colour so the
        // icon stays square and never gets letterboxed by the OS.
        const logo = config.weddingLogo;
        const logoPath = logo ? path.join(PHOTOS_DIR, logo) : null;
        const hasLogo = !!logoPath
            && path.resolve(logoPath).startsWith(path.resolve(PHOTOS_DIR))
            && fs.existsSync(logoPath);

        if (hasLogo) {
            const inner = Math.round(size * 0.72);
            const art = await sharp(logoPath!)
                .resize(inner, inner, { fit: 'inside', withoutEnlargement: false })
                .toBuffer();
            png = await sharp({
                create: {
                    width: size, height: size, channels: 4,
                    background: bg,
                },
            })
                .composite([{ input: art, gravity: 'center' }])
                .png()
                .toBuffer();
        } else {
            // Foreground has to follow the ground, or the admin variant would
            // draw a white heart on light grey and show nothing at all.
            png = await sharp(heartTile(size, bg, isAdmin ? '#374151' : '#ffffff')).png().toBuffer();
        }

        return new NextResponse(new Uint8Array(png), {
            headers: {
                'Content-Type': 'image/png',
                // Short cache: the logo and accent colour are admin-editable.
                'Cache-Control': 'public, max-age=3600, must-revalidate',
            },
        });
    } catch (error) {
        console.error('App icon generation failed:', error);
        // A flat tile still beats iOS falling back to a screenshot of the page.
        const flat = await sharp({
            create: { width: size, height: size, channels: 4, background: bg },
        }).png().toBuffer();
        return new NextResponse(new Uint8Array(flat), {
            headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
        });
    }
}
