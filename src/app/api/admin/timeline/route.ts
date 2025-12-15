import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/timeline.json');
const PHOTOS_DIR = path.join(process.cwd(), 'public/photos');

// Helper to read timeline data
function getTimeline() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return [];
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data).milestones || [];
}

// Helper to save timeline data
function saveTimeline(milestones: any[]) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ milestones }, null, 2));
}

export async function GET() {
    const milestones = getTimeline();

    // Sort by date (oldest first)
    milestones.sort((a: any, b: any) => {
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

        // Ensure directory exists
        if (!fs.existsSync(PHOTOS_DIR)) {
            fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        }

        // Handle file1 upload if provided
        if (file1) {
            const buffer = Buffer.from(await file1.arrayBuffer());
            const filename = `${Date.now()}-1-${file1.name.replace(/\s/g, '-')}`;
            const filePath = path.join(PHOTOS_DIR, filename);
            fs.writeFileSync(filePath, buffer);
            photos.push(filename);
            photoAligns.push(photo1Align);
        }

        // Handle file2 upload if provided
        if (file2) {
            const buffer = Buffer.from(await file2.arrayBuffer());
            const filename = `${Date.now()}-2-${file2.name.replace(/\s/g, '-')}`;
            const filePath = path.join(PHOTOS_DIR, filename);
            fs.writeFileSync(filePath, buffer);
            photos.push(filename);
            photoAligns.push(photo2Align);
        }

        const milestones = getTimeline();
        const newMilestone = {
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
        const milestoneIndex = milestones.findIndex((m: any) => m.id === id);

        if (milestoneIndex === -1) {
            return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
        }

        // Update text fields
        if (title !== undefined) {
            milestones[milestoneIndex].title = title;
        }
        if (date !== undefined) {
            milestones[milestoneIndex].date = date;
        }
        if (dateFormat !== undefined) {
            milestones[milestoneIndex].dateFormat = dateFormat;
        }
        if (description !== undefined) {
            milestones[milestoneIndex].description = description;
        }

        // Parse existing photos and alignments
        let existingPhotos: string[] = [];
        let existingAligns: string[] = [];
        try {
            existingPhotos = JSON.parse(existingPhotosStr || '[]');
            existingAligns = JSON.parse(existingAlignsStr || '[]');
        } catch (e) {
            existingPhotos = [];
            existingAligns = [];
        }

        // Delete photos that were removed
        const oldPhotos = milestones[milestoneIndex].photos || [];
        const photosToDelete = oldPhotos.filter((p: string) => !existingPhotos.includes(p));
        photosToDelete.forEach((photo: string) => {
            const filePath = path.join(PHOTOS_DIR, photo);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        // Start with existing photos and alignments
        const updatedPhotos = [...existingPhotos];
        const updatedAligns = [...existingAligns];

        // Ensure directory exists
        if (!fs.existsSync(PHOTOS_DIR)) {
            fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        }

        // Add new photos if provided
        if (file1 && updatedPhotos.length < 2) {
            const buffer = Buffer.from(await file1.arrayBuffer());
            const filename = `${Date.now()}-1-${file1.name.replace(/\s/g, '-')}`;
            const filePath = path.join(PHOTOS_DIR, filename);
            fs.writeFileSync(filePath, buffer);
            updatedPhotos.push(filename);
            updatedAligns.push(photo1Align);
        }

        if (file2 && updatedPhotos.length < 2) {
            const buffer = Buffer.from(await file2.arrayBuffer());
            const filename = `${Date.now()}-2-${file2.name.replace(/\s/g, '-')}`;
            const filePath = path.join(PHOTOS_DIR, filename);
            fs.writeFileSync(filePath, buffer);
            updatedPhotos.push(filename);
            updatedAligns.push(photo2Align);
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
        const milestoneIndex = milestones.findIndex((m: any) => m.id === id);

        if (milestoneIndex === -1) {
            return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
        }

        const milestone = milestones[milestoneIndex];

        // Delete associated photos if they exist
        if (milestone.photos && Array.isArray(milestone.photos)) {
            milestone.photos.forEach((photo: string) => {
                const filePath = path.join(PHOTOS_DIR, photo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        // Backwards compatibility: handle old single photo field
        if (milestone.photo) {
            const filePath = path.join(PHOTOS_DIR, milestone.photo);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        milestones.splice(milestoneIndex, 1);
        saveTimeline(milestones);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Timeline delete error:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
