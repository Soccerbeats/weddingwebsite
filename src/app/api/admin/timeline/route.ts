import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from '@/lib/config';
import { PHOTOS_DIR, rejectUpload, resolveInPhotos, safeImageFilename } from '@/lib/uploads';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/timeline.json');

interface Milestone {
    id: number;
    title: string;
    date: string;
    dateFormat?: string;
    description: string;
    photos?: string[];
    photoAligns?: string[];
    /** Legacy single-photo field from before `photos`. */
    photo?: string;
}

/** Save an uploaded milestone photo, or return the reason it was refused. */
function storePhoto(file: File, slot: 1 | 2): Promise<{ filename: string } | { error: string }> {
    const problem = rejectUpload(file);
    if (problem) return Promise.resolve({ error: problem });
    const filename = safeImageFilename(file.name, `${Date.now()}-${slot}-`);
    if (!filename) return Promise.resolve({ error: 'Unsupported image type' });
    if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    return file.arrayBuffer().then((buf) => {
        fs.writeFileSync(path.join(PHOTOS_DIR, filename), Buffer.from(buf));
        return { filename };
    });
}

function removeStored(filename: string) {
    const filePath = resolveInPhotos(path.basename(filename));
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// Helper to read timeline data
function getTimeline(): Milestone[] {
    if (!fs.existsSync(CONFIG_PATH)) {
        return [];
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data).milestones || [];
}

// Helper to save timeline data
function saveTimeline(milestones: Milestone[]) {
    writeJsonAtomic(CONFIG_PATH, { milestones });
}

export async function GET() {
    const milestones = getTimeline();

    // Sort by date (oldest first)
    milestones.sort((a: Milestone, b: Milestone) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
    });

    return NextResponse.json({ milestones });
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const title = formData.get('title') as string;
        const date = formData.get('date') as string;
        const dateFormat = formData.get('dateFormat') as string || 'exact';
        const description = formData.get('description') as string;
        const file1 = formData.get('file1') as File | null;
        const file2 = formData.get('file2') as File | null;
        const photo1Align = formData.get('photo1Align') as string || 'center';
        const photo2Align = formData.get('photo2Align') as string || 'center';

        if (!title || !date || !description) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const photos: string[] = [];
        const photoAligns: string[] = [];

        for (const [file, align, slot] of [[file1, photo1Align, 1], [file2, photo2Align, 2]] as const) {
            if (!(file instanceof File)) continue;
            const stored = await storePhoto(file, slot);
            if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: 400 });
            photos.push(stored.filename);
            photoAligns.push(align);
        }

        const milestones = getTimeline();
        const newMilestone: Milestone = {
            id: Date.now(),
            title,
            date,
            dateFormat,
            description,
            photos,
            photoAligns
        };

        milestones.push(newMilestone);
        saveTimeline(milestones);

        return NextResponse.json({ success: true, milestone: newMilestone });
    } catch (error) {
        console.error('Timeline create error:', error);
        return NextResponse.json({ error: 'Create failed' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);
        const title = formData.get('title') as string;
        const date = formData.get('date') as string;
        const dateFormat = formData.get('dateFormat') as string;
        const description = formData.get('description') as string;
        const existingPhotosStr = formData.get('existingPhotos') as string;
        const existingAlignsStr = formData.get('existingAligns') as string;
        const file1 = formData.get('file1') as File | null;
        const file2 = formData.get('file2') as File | null;
        const photo1Align = formData.get('photo1Align') as string || 'center';
        const photo2Align = formData.get('photo2Align') as string || 'center';

        const milestones = getTimeline();
        const milestoneIndex = milestones.findIndex((m: Milestone) => m.id === id);

        if (milestoneIndex === -1) {
            return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
        }

        // Update text fields. formData.get() returns null (not undefined) for
        // an absent field, so an omitted field must leave the value alone.
        if (title != null) milestones[milestoneIndex].title = title;
        if (date != null) milestones[milestoneIndex].date = date;
        if (dateFormat != null) milestones[milestoneIndex].dateFormat = dateFormat;
        if (description != null) milestones[milestoneIndex].description = description;

        // Parse existing photos and alignments
        let existingPhotos: string[] = [];
        let existingAligns: string[] = [];
        try {
            existingPhotos = JSON.parse(existingPhotosStr || '[]');
            existingAligns = JSON.parse(existingAlignsStr || '[]');
        } catch {
            existingPhotos = [];
            existingAligns = [];
        }

        // Delete photos that were removed
        const oldPhotos = milestones[milestoneIndex].photos || [];
        const photosToDelete = oldPhotos.filter((p: string) => !existingPhotos.includes(p));
        photosToDelete.forEach((photo: string) => removeStored(photo));

        // Start with existing photos and alignments
        const updatedPhotos = [...existingPhotos];
        const updatedAligns = [...existingAligns];

        for (const [file, align, slot] of [[file1, photo1Align, 1], [file2, photo2Align, 2]] as const) {
            if (!(file instanceof File) || updatedPhotos.length >= 2) continue;
            const stored = await storePhoto(file, slot);
            if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: 400 });
            updatedPhotos.push(stored.filename);
            updatedAligns.push(align);
        }

        milestones[milestoneIndex].photos = updatedPhotos;
        milestones[milestoneIndex].photoAligns = updatedAligns;

        saveTimeline(milestones);
        return NextResponse.json({ success: true, milestone: milestones[milestoneIndex] });
    } catch (error) {
        console.error('Timeline update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json();
        const milestones = getTimeline();
        const milestoneIndex = milestones.findIndex((m: Milestone) => m.id === id);

        if (milestoneIndex === -1) {
            return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
        }

        const milestone = milestones[milestoneIndex];

        // Delete associated photos if they exist
        if (milestone.photos && Array.isArray(milestone.photos)) {
            milestone.photos.forEach((photo: string) => removeStored(photo));
        }
        // Backwards compatibility: handle old single photo field
        if (milestone.photo) removeStored(milestone.photo);

        milestones.splice(milestoneIndex, 1);
        saveTimeline(milestones);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Timeline delete error:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
