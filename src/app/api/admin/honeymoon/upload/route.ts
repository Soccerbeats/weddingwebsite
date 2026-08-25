import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PHOTOS_DIR, rejectUpload, resolveInPhotos, safeImageFilename } from '@/lib/uploads';

/**
 * Uploads for the honeymoon portal: place photos and trip documents.
 *
 * Its own route rather than the wedding photo route, because that one also
 * registers what it saves in `photos.json` — the public gallery's list. A
 * booking screenshot and a passport scan must never be able to appear on the
 * wedding website, and the surest way to guarantee that is to never write them
 * into the file the gallery reads.
 *
 * They still live in the same volume and are served by `/api/photos/[filename]`,
 * which is how every image in this app is served (see convention #3). That means
 * a file's URL is not secret — the same as every other upload here — so the
 * documents feature is for convenience on the trip, not for secrets.
 */

/** Documents may be PDFs as well as images; photos are images only. */
const DOC_EXTENSIONS = new Set(['.pdf']);
const MAX_DOC_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const kind = String(formData.get('kind') ?? 'photo');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const extension = path.extname(file.name).toLowerCase();
        let filename: string | null = null;

        if (kind === 'document' && DOC_EXTENSIONS.has(extension)) {
            if (file.size > MAX_DOC_BYTES) {
                return NextResponse.json({ error: 'That file is over 25 MB' }, { status: 400 });
            }
            // Same shape as safeImageFilename: basename only, timestamped, so
            // nothing can escape the directory or overwrite an existing file.
            const base = path.basename(file.name, extension)
                .replace(/[^a-zA-Z0-9-_]/g, '-')
                .slice(0, 60) || 'document';
            filename = `${Date.now()}-${base}.pdf`;
        } else {
            const problem = rejectUpload(file);
            if (problem) return NextResponse.json({ error: problem }, { status: 400 });
            filename = safeImageFilename(file.name);
        }

        if (!filename) {
            return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
        }
        const target = resolveInPhotos(filename);
        if (!target) return NextResponse.json({ error: 'Bad filename' }, { status: 400 });

        if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));

        return NextResponse.json({ success: true, filename });
    } catch (error) {
        console.error('Honeymoon upload failed:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

/** Remove a file this portal put in the volume. */
export async function DELETE(request: Request) {
    try {
        const filename = new URL(request.url).searchParams.get('filename') ?? '';
        const target = resolveInPhotos(filename);
        if (!target) return NextResponse.json({ error: 'Bad filename' }, { status: 400 });
        if (fs.existsSync(target)) fs.unlinkSync(target);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Honeymoon delete failed:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
