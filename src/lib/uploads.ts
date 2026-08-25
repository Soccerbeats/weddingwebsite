import path from 'path';

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
 * A filename safe to write under the photos directory: the basename only,
 * lower-risk characters, and a whitelisted image extension. Returns null when
 * the upload is not an image we serve.
 */
export function safeImageFilename(original: string, prefix = ''): string | null {
    const base = path.basename(original || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = extensionOf(base);
    if (!IMAGE_EXTENSIONS.has(ext)) return null;
    const stem = base.slice(0, base.length - ext.length - 1).replace(/^\.+/, '') || 'photo';
    return `${prefix}${Date.now()}-${stem.slice(0, 80)}.${ext}`;
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
