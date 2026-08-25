import { NextResponse } from 'next/server';
import { getSiteConfig, updateSiteConfig } from '@/lib/config';

export interface RegistryItem {
    id: string;
    store: 'target' | 'amazon' | 'other';
    title: string;
    description: string;
    image: string;
    price: string;
    url: string;
}

function itemsOf(config: { registryItems?: unknown[] }): RegistryItem[] {
    return Array.isArray(config.registryItems) ? (config.registryItems as RegistryItem[]) : [];
}

// GET — return all registry items
export async function GET() {
    return NextResponse.json(itemsOf(getSiteConfig()));
}

// POST — add a new item. Read-modify-write happens inside the config queue so
// two adds in the same second cannot each save a list missing the other's.
export async function POST(req: Request) {
    try {
        const item: RegistryItem = await req.json();
        if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') {
            return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
        }
        await updateSiteConfig((config) => {
            config.registryItems = [...itemsOf(config), item];
        });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}

// PATCH — update an item by id
export async function PATCH(req: Request) {
    try {
        const updated: RegistryItem = await req.json();
        let found = false;
        await updateSiteConfig((config) => {
            const items = itemsOf(config);
            const idx = items.findIndex((i) => i.id === updated.id);
            if (idx === -1) return;
            found = true;
            items[idx] = updated;
            config.registryItems = items;
        });
        if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

// DELETE — remove an item by id
export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        await updateSiteConfig((config) => {
            config.registryItems = itemsOf(config).filter((i) => i.id !== id);
        });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
