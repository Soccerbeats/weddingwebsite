import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';

export async function GET() {
    const cookieStore = await cookies();
    const session = await verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
    return NextResponse.json({ isAdmin: session !== null });
}
