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
        const filePath = path.join(photosDir, ...filepath);

        // Security: ensure resolved path stays within photos dir
        if (!filePath.startsWith(photosDir + path.sep) && filePath !== photosDir) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Thumb mode: last segment is literally "thumb"
        if (filepath[filepath.length - 1] === 'thumb') {
            const thumbPath = path.join(photosDir, ...filepath.slice(0, -1));
            if (!thumbPath.startsWith(photosDir + path.sep)) {
                return new NextResponse('Forbidden', { status: 403 });
            }
            if (!fs.existsSync(thumbPath)) {
                return new NextResponse('Not found', { status: 404 });
            }
            try {
                const thumb = await sharp(thumbPath)
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
                const original = fs.readFileSync(thumbPath);
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
