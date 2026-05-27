/**
 * photoSrc — generate an optimally-sized photo URL.
 *
 * We serve every image through /api/photos/[filename]?w=N which pipes
 * the original through sharp and returns a JPEG at the requested width.
 * The image is cached immutably (1 year) so each distinct ?w= value is
 * only generated once per deployment.
 *
 * Breakpoints follow the most common display sizes × 2× DPR:
 *   thumb   — 320px  (avatar, tiny thumbnail)
 *   small   — 640px  (half-width mobile card, gallery thumb)
 *   medium  — 960px  (full-width mobile, half-width desktop)
 *   large   — 1280px (full-width tablet, half-width desktop retina)
 *   xl      — 1920px (full-width desktop retina hero)
 *
 * Usage:
 *   <img src={photoSrc(filename, 'medium')} ... />
 *   <img srcSet={photoSrcSet(filename)} sizes="(max-width:768px) 100vw, 50vw" ... />
 */

export type PhotoSize = 'thumb' | 'small' | 'medium' | 'large' | 'xl';

const WIDTHS: Record<PhotoSize, number> = {
  thumb:  320,
  small:  640,
  medium: 960,
  large:  1280,
  xl:     1920,
};

export function photoSrc(filename: string, size: PhotoSize = 'large'): string {
  return `/api/photos/${filename}?w=${WIDTHS[size]}`;
}

/**
 * Returns a full srcSet string covering all breakpoints.
 * Let the browser pick the right one via `sizes`.
 */
export function photoSrcSet(filename: string): string {
  return Object.entries(WIDTHS)
    .map(([, w]) => `/api/photos/${filename}?w=${w} ${w}w`)
    .join(', ');
}
