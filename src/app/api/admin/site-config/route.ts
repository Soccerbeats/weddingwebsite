import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { DEFAULT_SITE_CONFIG, getSiteConfig, updateSiteConfig, type SiteConfig } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { publicScheduleEvents } from '@/lib/schedule';

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const COLOR_KEYS = ['accentColor', 'accentLightColor', 'accentDarkColor'] as const;

/**
 * This GET is one of three under `/api/admin/` that `src/middleware.ts` answers
 * without the admin cookie, because the nav, the RSVP form and the registry page
 * all read it. Everything it returns is therefore world-readable — which the
 * schedule stopped being the moment events could be marked private.
 *
 * So the caller is checked here, and a caller without the cookie gets the
 * schedule a guest would see. The alternative — trusting that no private key
 * ever lands in `site.json` — is the assumption that made this a hole in the
 * first place. A demo instance is login-free by design and its data is
 * fictional, so it answers in full.
 */
async function isAdminRequest(): Promise<boolean> {
    if (isDemoMode()) return true;
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    return (await verifyAdminToken(token)) !== null;
}

export async function GET() {
    const config = { ...DEFAULT_SITE_CONFIG, countdownMode: 'full', ...getSiteConfig() } as SiteConfig;
    if (await isAdminRequest()) return NextResponse.json(config);
    return NextResponse.json({ ...config, scheduleEvents: publicScheduleEvents(config.scheduleEvents) });
}

/**
 * Merge the posted keys into the config.
 *
 * Shallow, except `pageBgColors`, which is merged one level down: the Registry
 * page owns one colour in it and the Colour page owns the rest, and a shallow
 * merge let either wipe the other's. Colours are validated because they are
 * written straight into a `<style>` tag; an invalid value would break the
 * theme site-wide rather than one field.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
        }
        const updates = body as Partial<SiteConfig> & Record<string, unknown>;

        for (const key of COLOR_KEYS) {
            const value = updates[key];
            if (value !== undefined && value !== '' && (typeof value !== 'string' || !HEX.test(value))) {
                return NextResponse.json({ error: `${key} must be a hex colour like #D4AF37` }, { status: 400 });
            }
        }

        const newConfig = await updateSiteConfig((current) => {
            const { pageBgColors, ...rest } = updates;
            const next: SiteConfig = { ...current, ...(rest as Partial<SiteConfig>) };
            if (pageBgColors && typeof pageBgColors === 'object') {
                next.pageBgColors = { ...(current.pageBgColors ?? {}), ...pageBgColors };
            }
            return next;
        });

        return NextResponse.json({ success: true, config: newConfig });
    } catch (error) {
        console.error('Config update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
