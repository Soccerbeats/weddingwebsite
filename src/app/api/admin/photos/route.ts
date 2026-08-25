import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from '@/lib/config';
import { PHOTOS_DIR, rejectUpload, resolveInPhotos, safeImageFilename } from '@/lib/uploads';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/photos.json');

interface Photo {
    id: number;
    filename: string;
    alt: string;
    category: string;
    hearted: boolean;
    order: number;
    title?: string;
    description?: string;
}

/**
 * Read photos.json. A missing file is an empty library; a corrupt one is an
 * error the caller reports rather than a blank grid with nothing in the log.
 */
function getPhotos(): Photo[] {
    if (!fs.existsSync(CONFIG_PATH)) return [];
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed?.photos) ? parsed.photos : [];
}

/**
 * Serialised, atomic writes — see `writeJsonAtomic`. Every mutation below reads
 * then writes inside this queue so two uploads landing together cannot each
 * save a list missing the other's photo.
 */
let queue: Promise<unknown> = Promise.resolve();
function withPhotos<T>(fn: (photos: Photo[]) => { photos: Photo[]; result: T }): Promise<T> {
    const run = queue.then(() => {
        const { photos, result } = fn(getPhotos());
        writeJsonAtomic(CONFIG_PATH, { photos });
        return result;
    });
    queue = run.catch(() => undefined);
    return run;
}

export async function GET() {
    try {
        // Files that have gone missing from the volume are filtered out of the
        // answer, but the file is no longer rewritten on a read.
        const photos = getPhotos()
            .filter((photo) => {
                const filePath = resolveInPhotos(photo.filename);
                return filePath != null && fs.existsSync(filePath);
            })
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        return NextResponse.json({ photos });
    } catch (error) {
        console.error('photos.json could not be read:', error);
        return NextResponse.json(
            { error: 'photos.json is unreadable — it may be corrupt. Check public/config/photos.json on the volume.' },
            { status: 500 },
        );
    }
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const category = String(formData.get('category') ?? 'gallery').slice(0, 50) || 'gallery';

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }
        const problem = rejectUpload(file);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });

        const filename = safeImageFilename(file.name);
        if (!filename) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });

        if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        fs.writeFileSync(path.join(PHOTOS_DIR, filename), Buffer.from(await file.arrayBuffer()));

        const newPhoto = await withPhotos((photos) => {
            const photo: Photo = {
                id: Date.now(),
                filename,
                alt: path.basename(file.name),
                category,
                hearted: false,
                order: photos.length, // Place at end by default
            };
            return { photos: [...photos, photo], result: photo };
        });

        return NextResponse.json({ success: true, photo: newPhoto });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, hearted, reorder, title, description } = body;

        const outcome = await withPhotos((photos) => {
            const photoIndex = photos.findIndex((p) => p.id === id);
            if (photoIndex === -1) return { photos, result: null };

            if (hearted !== undefined) photos[photoIndex].hearted = !!hearted;
            if (title !== undefined) photos[photoIndex].title = String(title);
            if (description !== undefined) photos[photoIndex].description = String(description);

            if (reorder && Array.isArray(reorder)) {
                // reorder is an array of photo IDs in the new order
                const reordered = reorder
                    .map((photoId: number, index: number) => {
                        const photo = photos.find((p) => p.id === photoId);
                        if (photo) photo.order = index;
                        return photo;
                    })
                    .filter((p): p is Photo => !!p);
                // Any photos not in reorder array go at the end
                const includedIds = new Set(reorder);
                const remaining = photos.filter((p) => !includedIds.has(p.id));
                remaining.forEach((photo, index) => { photo.order = reorder.length + index; });
                return { photos: [...reordered, ...remaining], result: photos[photoIndex] };
            }

            return { photos, result: photos[photoIndex] };
        });

        if (!outcome) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
        return NextResponse.json({ success: true, photo: outcome });
    } catch (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json();

        const removed = await withPhotos((photos) => {
            const photoIndex = photos.findIndex((p) => p.id === id);
            if (photoIndex === -1) return { photos, result: null };
            const [photo] = photos.splice(photoIndex, 1);
            return { photos, result: photo };
        });

        if (!removed) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

        const filePath = resolveInPhotos(removed.filename);
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
