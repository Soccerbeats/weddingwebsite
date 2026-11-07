import { randomBytes } from 'crypto';
import path from 'path';
import sharp from 'sharp';

/**
 * Guards shared by every route that writes into or deletes from `public/photos`.
 *
 * Until these existed each upload route sanitised (or didn't) on its own: one
 * stripped whitespace, one stripped non-alphanumerics, the deletes joined the
 * caller's filename straight onto the photos directory. The receipt route had
 * an extension whitelist and a size cap; the rest accepted anything, including
 * `../` in a crafted multipart filename and SVGs that the photo route then
 * served as `image/svg+xml` from the site's own origin.
 */

export const PHOTOS_DIR = path.join(process.cwd(), 'public/photos');

/** Raster formats the photo route can serve safely and sharp can resize. */
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic']);

/** 25 MB — a phone's full-resolution photo is 3–8 MB; nothing legitimate is bigger. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function extensionOf(filename: string): string {
    return (filename.split('.').pop() ?? '').toLowerCase();
}

/**
 * A filename safe to write under the photos directory: a timestamp, a random
 * tag and a whitelisted image extension. Returns null when the upload is not an
 * image we serve.
 *
 * The original name is deliberately dropped (v0.10.39): photo URLs are public,
 * and a phone's filename can carry a date, a device or a place.
 */
export function safeImageFilename(original: string, prefix = ''): string | null {
    const ext = extensionOf(path.basename(original || ''));
    if (!IMAGE_EXTENSIONS.has(ext)) return null;
    return `${prefix}${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
}

/** Formats re-encoded on upload. GIF keeps its animation untouched; HEIC needs a decoder sharp may lack. */
const CLEANED = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

/**
 * The bytes to store for an uploaded image: turned upright from its EXIF
 * orientation, then written again *without* its metadata. A phone photo
 * carries the GPS position it was taken at, and every photo on the public
 * pages can be downloaded — so a picture of the couple at home published
 * their address. (Prompted by the flokaiser fork, 2026-09.)
 *
 * The format is kept, so the stored filename's extension stays true. Anything
 * sharp cannot read is stored as it came rather than refused.
 */
export async function cleanImageUpload(file: File): Promise<Buffer> {
    const original = Buffer.from(await file.arrayBuffer());
    const ext = extensionOf(file.name);
    if (!CLEANED.has(ext)) return original;
    try {
        // sharp drops all metadata unless asked to keep it; rotate() with no
        // angle applies the EXIF orientation before that tag is lost.
        const image = sharp(original, { failOn: 'none' }).rotate();
        if (ext === 'jpg' || ext === 'jpeg') return await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        if (ext === 'png') return await image.png().toBuffer();
        if (ext === 'webp') return await image.webp({ quality: 90 }).toBuffer();
        return await image.avif({ quality: 70 }).toBuffer();
    } catch (error) {
        console.error('Could not clean an uploaded image; storing it as sent:', error);
        return original;
    }
}

/** Reasons an upload is refused, as a message for the client, or null when it is fine. */
export function rejectUpload(file: File | null | undefined): string | null {
    if (!file) return 'No file provided';
    if (file.size === 0) return 'The file is empty';
    if (file.size > MAX_IMAGE_BYTES) return 'The file is larger than 25MB';
    if (!IMAGE_EXTENSIONS.has(extensionOf(file.name))) {
        return 'Use a JPG, PNG, GIF, WebP, AVIF or HEIC image';
    }
    if (file.type && !file.type.startsWith('image/')) return 'That is not an image';
    return null;
}

/**
 * Resolve a stored filename (possibly with a subfolder, e.g. `nav-cards/x.jpg`
 * or `receipts/y.pdf`) to an absolute path, refusing anything that escapes the
 * photos directory. Returns null when it would.
 */
export function resolveInPhotos(relative: string): string | null {
    if (!relative || relative.includes('\0')) return null;
    const full = path.resolve(PHOTOS_DIR, relative);
    if (full !== PHOTOS_DIR && !full.startsWith(PHOTOS_DIR + path.sep)) return null;
    return full;
}
