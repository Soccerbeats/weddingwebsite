import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { PHOTOS_DIR, rejectUpload, resolveInPhotos, safeImageFilename } from '@/lib/uploads';

/** Photo uploads for wedding-party members. The member data itself lives in site.json. */

// POST - Upload photo for wedding party member
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('photo');
        const memberType = String(formData.get('memberType') ?? 'member').replace(/[^a-z]/gi, '') || 'member';

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        const problem = rejectUpload(file);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });

        const filename = safeImageFilename(file.name, `wedding-party-${memberType}-`);
        if (!filename) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });

        if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        await writeFile(path.join(PHOTOS_DIR, filename), Buffer.from(await file.arrayBuffer()));

        return NextResponse.json({ success: true, filename, message: 'Photo uploaded successfully' });
    } catch (error) {
        console.error('Error uploading photo:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

// DELETE - Delete wedding party member photo
export async function DELETE(request: NextRequest) {
    try {
        const filename = new URL(request.url).searchParams.get('filename');
        if (!filename) {
            return NextResponse.json({ error: 'No filename provided' }, { status: 400 });
        }

        // Basename only: the filename came from the browser, and `../` in it
        // used to reach anything under the app directory.
        const filepath = resolveInPhotos(path.basename(filename));
        if (!filepath) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });

        if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
            await unlink(filepath);
        }

        return NextResponse.json({ success: true, message: 'Photo deleted successfully' });
    } catch (error) {
        console.error('Error deleting photo:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
