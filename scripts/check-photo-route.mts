// Regression check for /api/photos/[...filepath].
//
//   npm run check:photos
//
// This route has broken twice: converting it to a catch-all for subfolder support
// left every "/thumb" URL returning 404, because the existence check ran against
// the raw request path ("<file>/thumb") instead of the file the thumb is derived
// from. That killed the admin slideshow picker and nav-card gallery thumbnails
// silently — the only symptom was broken-image icons.
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/photos/[...filepath]/route';

const photosDir = path.join(process.cwd(), 'public/photos');
const FIXTURE = 'thumbtest-fixture.jpg';
const SUBDIR_FIXTURE = ['thumbtest-sub', 'nested.jpg'];
const fixturePath = path.join(photosDir, FIXTURE);
const subFixturePath = path.join(photosDir, ...SUBDIR_FIXTURE);
// Uploaded photos live in a Docker volume, so copy in a bundled jpeg instead.
const source = path.join(process.cwd(), 'public/images/nav-defaults/photos.jpg');
fs.copyFileSync(source, fixturePath);
fs.mkdirSync(path.dirname(subFixturePath), { recursive: true });
fs.copyFileSync(source, subFixturePath);

const call = async (segments: string[], url = 'http://localhost/x') => {
    // Must be a NextRequest — the route reads request.nextUrl for the ?w= param.
    const req = new NextRequest(url);
    return GET(req, { params: Promise.resolve({ filepath: segments }) });
};

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
    if (!ok) failures++;
};

try {
    // The bug: a "/thumb" suffix 404s because existsSync runs on "<file>/thumb".
    const thumb = await call([FIXTURE, 'thumb']);
    const thumbBody = await thumb.arrayBuffer();
    check(
        'thumb of a file at the photos root',
        thumb.status === 200 && thumb.headers.get('Content-Type') === 'image/jpeg' && thumbBody.byteLength > 0,
        `${thumb.status} ${thumb.headers.get('Content-Type')} ${thumbBody.byteLength}b`
    );

    // Thumbs must work for photos in a subfolder too (why the route went catch-all).
    const subThumb = await call([...SUBDIR_FIXTURE, 'thumb']);
    const subBody = await subThumb.arrayBuffer();
    check(
        'thumb of a file in a subfolder',
        subThumb.status === 200 && subThumb.headers.get('Content-Type') === 'image/jpeg' && subBody.byteLength > 0,
        `${subThumb.status} ${subThumb.headers.get('Content-Type')} ${subBody.byteLength}b`
    );

    // Regressions guards: the paths that already worked must keep working.
    const full = await call([FIXTURE]);
    check('full-size still served', full.status === 200 && full.headers.get('Content-Type') === 'image/jpeg', `${full.status} ${full.headers.get('Content-Type')}`);

    const resized = await call([FIXTURE], 'http://localhost/x?w=320');
    check('?w= resize still served', resized.status === 200, `${resized.status}`);

    const missing = await call(['definitely-not-here.jpg']);
    check('missing file still 404s', missing.status === 404, `${missing.status}`);

    const missingThumb = await call(['definitely-not-here.jpg', 'thumb']);
    check('thumb of a missing file 404s', missingThumb.status === 404, `${missingThumb.status}`);

    const escape = await call(['..', '..', 'package.json']);
    check('path traversal blocked', escape.status === 403 || escape.status === 404, `${escape.status}`);

    const bareThumb = await call(['thumb']);
    check('bare /thumb does not 500', bareThumb.status === 404 || bareThumb.status === 403, `${bareThumb.status}`);
} finally {
    fs.unlinkSync(fixturePath);
    fs.rmSync(path.dirname(subFixturePath), { recursive: true, force: true });
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
