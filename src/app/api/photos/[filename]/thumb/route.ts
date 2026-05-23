import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const safeName = path.basename(filename);
    const filePath = path.join(process.cwd(), 'public/photos', safeName);

    if (!fs.existsSync(filePath)) {
        return new NextResponse('Not found', { status: 404 });
    }

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
        // Fallback: serve original if sharp fails
        const original = fs.readFileSync(filePath);
        return new NextResponse(new Uint8Array(original), {
            headers: { 'Content-Type': 'image/jpeg' },
        });
    }
}
