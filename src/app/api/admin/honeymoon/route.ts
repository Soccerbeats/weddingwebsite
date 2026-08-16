import { NextResponse } from 'next/server';
import { getHoneymoonPayload } from '@/lib/honeymoonDb';

/** The whole honeymoon portal in one read — the client refetches this after every edit. */
export async function GET() {
    try {
        return NextResponse.json(await getHoneymoonPayload());
    } catch (error) {
        console.error('Error loading honeymoon payload:', error);
        return NextResponse.json({ error: 'Failed to load honeymoon data' }, { status: 500 });
    }
}
