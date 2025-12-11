import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pump = promisify(pipeline);

const CONFIG_PATH = path.join(process.cwd(), 'public/config/photos.json');
const PHOTOS_DIR = path.join(process.cwd(), 'public/photos');

// Helper to read config
function getPhotos() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return [];
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data).photos || [];
}

// Helper to save config
function savePhotos(photos: any[]) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ photos }, null, 2));
}

export async function GET() {
    const photos = getPhotos();

    // Filter out photos where the actual file doesn't exist
    const validPhotos = photos.filter((photo: any) => {
        const filePath = path.join(PHOTOS_DIR, photo.filename);
        return fs.existsSync(filePath);
    });

    // If some photos were invalid, update the config
    if (validPhotos.length !== photos.length) {
        savePhotos(validPhotos);
    }

    // Sort by order field (ascending)
    validPhotos.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    return NextResponse.json({ photos: validPhotos });
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const category = formData.get('category') as string || 'gallery';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${Date.now()}-${file.name.replace(/\s/g, '-')}`;
        const filePath = path.join(PHOTOS_DIR, filename);

        // Ensure directory exists
        if (!fs.existsSync(PHOTOS_DIR)) {
            fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        }

        // Write file
        fs.writeFileSync(filePath, buffer);

        // Update Config
        const photos = getPhotos();
        const newPhoto = {
            id: Date.now(),
            filename,
            alt: file.name,
            category,
            hearted: false,
            order: photos.length // Place at end by default
        };

        photos.push(newPhoto);
        savePhotos(photos);

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

        const photos = getPhotos();
        const photoIndex = photos.findIndex((p: any) => p.id === id);

        if (photoIndex === -1) {
            return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
        }

        // Toggle hearted status
        if (hearted !== undefined) {
            photos[photoIndex].hearted = hearted;
        }

        // Update title and description if provided
        if (title !== undefined) {
            photos[photoIndex].title = title;
        }
        if (description !== undefined) {
            photos[photoIndex].description = description;
        }

        // Update order if reorder array provided
        if (reorder && Array.isArray(reorder)) {
            // reorder is an array of photo IDs in the new order
            const reorderedPhotos = reorder.map((photoId: number, index: number) => {
                const photo = photos.find((p: any) => p.id === photoId);
                if (photo) {
                    photo.order = index;
                }
                return photo;
            }).filter(Boolean);

            // Add any photos not in reorder array at the end
            const includedIds = new Set(reorder);
            const remainingPhotos = photos.filter((p: any) => !includedIds.has(p.id));
            remainingPhotos.forEach((photo: any, index: number) => {
                photo.order = reorder.length + index;
            });

            savePhotos([...reorderedPhotos, ...remainingPhotos]);
            return NextResponse.json({ success: true });
        }

        savePhotos(photos);
        return NextResponse.json({ success: true, photo: photos[photoIndex] });
    } catch (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json();
        const photos = getPhotos();
        const photoIndex = photos.findIndex((p: any) => p.id === id);

        if (photoIndex === -1) {
            return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
        }

        const photo = photos[photoIndex];
        const filePath = path.join(PHOTOS_DIR, photo.filename);

        // Delete file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from config
        photos.splice(photoIndex, 1);
        savePhotos(photos);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
