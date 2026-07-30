import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filepath: string[] }> }
) {
    try {
        const { filepath } = await params;
        const photosDir = path.join(process.cwd(), 'public/photos');

        // A trailing "thumb" segment asks for a resized thumbnail, so the file on
        // disk is the path *without* it. This has to be resolved before the
        // existence check below — checking the raw request path would stat
        // "<file>/thumb", which never exists, and 404 every thumbnail.
        const isThumb = filepath[filepath.length - 1] === 'thumb';
        const segments = isThumb ? filepath.slice(0, -1) : filepath;
        if (segments.length === 0) {
            return new NextResponse('File not found', { status: 404 });
        }

        const filePath = path.join(photosDir, ...segments);

        // Security: ensure resolved path stays within photos dir
        if (!filePath.startsWith(photosDir + path.sep)) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        if (isThumb) {
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
                // sharp can't handle it (e.g. an SVG) — serve the original.
                const original = fs.readFileSync(filePath);
                return new NextResponse(new Uint8Array(original), {
                    headers: { 'Content-Type': 'image/jpeg' },
                });
            }
        }

        // Optional width resize via ?w=1200
        const { searchParams } = request.nextUrl;
        const w = parseInt(searchParams.get('w') || '0');

        if (w > 0) {
            const resized = await sharp(filePath)
                .resize(w, undefined, { fit: 'inside', withoutEnlargement: true })
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
        const ext = path.extname(filePath).toLowerCase();
        const contentTypeMap: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.avif': 'image/avif',
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Error serving photo:', error);
        return new NextResponse('Error serving file', { status: 500 });
    }
}
