import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { parseChangelog } from '@/lib/changelog';

/**
 * The repository's CHANGELOG.md, parsed.
 *
 * Read at request time rather than imported, so the panel shows whatever the
 * deployed image actually carries — and so a docs-only change needs no rebuild
 * of anything but the image itself. The file is copied into the production image
 * by the Dockerfile; without that it exists only in the build stage.
 */
export async function GET(request: Request) {
    try {
        // process.cwd() is /app in the container and the repo root in dev.
        const file = path.join(process.cwd(), 'CHANGELOG.md');
        if (!fs.existsSync(file)) {
            return NextResponse.json(
                { releases: [], latest: null, error: 'CHANGELOG.md is not part of this build.' },
                { status: 200 },
            );
        }
        const releases = parseChangelog(fs.readFileSync(file, 'utf8'));

        // ?latest=1 answers "is there anything new" without shipping the whole
        // history — the unread dot needs that on every admin page load, and the
        // full list only when someone actually opens the panel.
        if (new URL(request.url).searchParams.has('latest')) {
            const newest = releases[0];
            return NextResponse.json({
                latest: newest ? newest.id : null,
                count: newest ? newest.count : 0,
            });
        }

        return NextResponse.json({ releases });
    } catch (error) {
        console.error('Error reading the changelog:', error);
        return NextResponse.json({ error: 'Failed to read the changelog' }, { status: 500 });
    }
}
