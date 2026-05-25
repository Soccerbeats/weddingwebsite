import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');

export interface RegistryItem {
    id: string;
    store: 'target' | 'amazon' | 'other';
    title: string;
    description: string;
    image: string;
    price: string;
    url: string;
}

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch { return {}; }
}

function saveConfig(config: Record<string, unknown>) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// GET — return all registry items
export async function GET() {
    const config = getConfig();
    return NextResponse.json(config.registryItems || []);
}

// POST — add a new item
export async function POST(req: Request) {
    try {
        const item: RegistryItem = await req.json();
        const config = getConfig();
        const items: RegistryItem[] = config.registryItems || [];
        items.push(item);
        saveConfig({ ...config, registryItems: items });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}

// PATCH — update an item by id
export async function PATCH(req: Request) {
    try {
        const updated: RegistryItem = await req.json();
        const config = getConfig();
        const items: RegistryItem[] = config.registryItems || [];
        const idx = items.findIndex(i => i.id === updated.id);
        if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        items[idx] = updated;
        saveConfig({ ...config, registryItems: items });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

// DELETE — remove an item by id
export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        const config = getConfig();
        const items: RegistryItem[] = (config.registryItems || []).filter((i: RegistryItem) => i.id !== id);
        saveConfig({ ...config, registryItems: items });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
