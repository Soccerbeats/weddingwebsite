import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';


const SECRET_KEY = process.env.ADMIN_PASSWORD || 'default_secret_password';
const JWT_SECRET = new TextEncoder().encode(SECRET_KEY);

export async function POST(request: Request) {
    const { password } = await request.json();

    if (password === SECRET_KEY) {
        const token = await new SignJWT({ role: 'admin' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(JWT_SECRET);

        const response = NextResponse.json({ success: true });

        response.cookies.set('admin_token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7200,
            path: '/',
        });

        // Non-httpOnly hint cookie so the nav can read admin state synchronously
        response.cookies.set('admin_hint', '1', {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            maxAge: 7200,
            path: '/',
        });

        return response;
    }

    return NextResponse.json({ success: false }, { status: 401 });
}
