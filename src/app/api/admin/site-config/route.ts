import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');

const DEFAULT_CONFIG = {
    brideName: 'Sarah',
    groomName: 'James',
    weddingDate: 'June 15, 2024',
    weddingLocation: 'The Garden Estate',
    weddingTime: '4:00 PM',
    homeHero: null,
    aboutHero: null,
    countdownMode: 'full' // 'full' = days/hours/minutes/seconds, 'simple' = days/hours, 'days-only' = days only (larger)
};

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return DEFAULT_CONFIG;
    }
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (error) {
        console.error('Error reading config:', error);
        return DEFAULT_CONFIG;
    }
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
