import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = process.env.ADMIN_PASSWORD || 'default_secret_password';
const JWT_SECRET = new TextEncoder().encode(SECRET_KEY);

export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
        return NextResponse.json({ isAdmin: false });
    }

    try {
        await jwtVerify(token, JWT_SECRET);
        return NextResponse.json({ isAdmin: true });
    } catch (error) {
        return NextResponse.json({ isAdmin: false });
    }
}
