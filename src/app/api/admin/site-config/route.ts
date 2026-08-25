import { NextResponse } from 'next/server';
import { DEFAULT_SITE_CONFIG, getSiteConfig, updateSiteConfig, type SiteConfig } from '@/lib/config';

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const COLOR_KEYS = ['accentColor', 'accentLightColor', 'accentDarkColor'] as const;

export async function GET() {
    return NextResponse.json({ ...DEFAULT_SITE_CONFIG, countdownMode: 'full', ...getSiteConfig() });
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
