import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return { homeHero: null, aboutHero: null };
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
}

function saveConfig(config: any) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
    return NextResponse.json(getConfig());
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const config = getConfig();

        // Merge updates
        const newConfig = { ...config, ...body };
        saveConfig(newConfig);

        return NextResponse.json({ success: true, config: newConfig });
    } catch (error) {
        console.error('Config update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
