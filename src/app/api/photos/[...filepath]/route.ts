import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { resolveInPhotos } from '@/lib/uploads';

/**
 * Content types by extension. SVG is deliberately *not* served as
 * `image/svg+xml`: an SVG can carry script, and served from this origin it
 * would run with the admin's cookies. Anything not listed is a download.
 */
const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.heic': 'image/heic',
    '.pdf': 'application/pdf',
};

/** Only these widths are generated, so the cache can hold at most six variants per photo. */
const WIDTHS = [320, 640, 960, 1280, 1920];

function snapWidth(raw: number): number {
    return WIDTHS.find((w) => w >= raw) ?? WIDTHS[WIDTHS.length - 1];
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filepath: string[] }> }
) {
    try {
        const { filepath } = await params;

        // A trailing "thumb" segment asks for a resized thumbnail, so the file on
        // disk is the path *without* it. This has to be resolved before the
        // existence check below — checking the raw request path would stat
        // "<file>/thumb", which never exists, and 404 every thumbnail.
        const isThumb = filepath[filepath.length - 1] === 'thumb';
        const segments = isThumb ? filepath.slice(0, -1) : filepath;
        if (segments.length === 0) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Security: the resolved path must stay within the photos directory.
        const filePath = resolveInPhotos(segments.join('/'));
        if (!filePath) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return new NextResponse('File not found', { status: 404 });
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
        const isRaster = contentType.startsWith('image/');

        if (isThumb) {
            if (isRaster) {
                try {
                    const thumb = await sharp(filePath)
                        .resize(300, 200, { fit: 'cover', position: 'centre' })
                        .jpeg({ quality: 70 })
                        .toBuffer();
                    return new NextResponse(new Uint8Array(thumb), {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'public, max-age=31536000, immutable',
                        },
                    });
                } catch {
                    // sharp can't decode it — fall through and serve the original,
                    // labelled as what it actually is.
                }
            }
            const original = fs.readFileSync(filePath);
            return new NextResponse(new Uint8Array(original), {
                headers: { 'Content-Type': contentType },
            });
        }

        // Optional width resize via ?w=1200 — snapped to a fixed ladder so a
        // caller cannot mint an unbounded number of cached variants.
        const { searchParams } = request.nextUrl;
        const w = parseInt(searchParams.get('w') || '0', 10);

        if (w > 0 && isRaster) {
            const resized = await sharp(filePath)
                .resize(snapWidth(w), undefined, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer();
            return new NextResponse(new Uint8Array(resized), {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Vary': 'Accept',
                },
            });
        }

        // Full resolution
        const fileBuffer = fs.readFileSync(filePath);
        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                ...(isRaster || contentType === 'application/pdf'
                    ? {}
                    : { 'Content-Disposition': 'attachment' }),
            },
        });
    } catch (error) {
        console.error('Error serving photo:', error);
        return new NextResponse('Error serving file', { status: 500 });
    }
}
