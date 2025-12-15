import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import fs from 'fs';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');
const PHOTOS_DIR = path.join(process.cwd(), 'public/photos');

// Ensure photos directory exists
if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return {};
    }
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading config:', error);
        return {};
    }
}

function saveConfig(config: any) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// POST - Upload photo for wedding party member
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('photo') as File;
        const memberType = formData.get('memberType') as string; // 'bride', 'groom', 'officiant'
        const memberId = formData.get('memberId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `wedding-party-${memberType}-${timestamp}-${originalName}`;
        const filepath = path.join(PHOTOS_DIR, filename);

        // Save the file
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filepath, buffer);

        return NextResponse.json({
            success: true,
            filename,
            message: 'Photo uploaded successfully'
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

// DELETE - Delete wedding party member photo
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const filename = searchParams.get('filename');

        if (!filename) {
            return NextResponse.json({ error: 'No filename provided' }, { status: 400 });
        }

        const filepath = path.join(PHOTOS_DIR, filename);

        // Check if file exists
        if (fs.existsSync(filepath)) {
            await unlink(filepath);
        }

        return NextResponse.json({ success: true, message: 'Photo deleted successfully' });
    } catch (error) {
        console.error('Error deleting photo:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
