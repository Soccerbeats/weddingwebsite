import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.delete('admin_token');
    response.cookies.delete('admin_hint');
    return response;
}
