import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        const safeName = path.basename(filename);
        const filePath = path.join(process.cwd(), 'public/photos', safeName);

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
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
        const ext = path.extname(safeName).toLowerCase();
        const contentTypeMap: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
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
