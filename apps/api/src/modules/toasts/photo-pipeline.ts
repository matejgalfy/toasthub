import { PHOTO_FIELD } from '@toasthub/shared';
import heicDecode from 'heic-decode';
import sharp, { type Sharp } from 'sharp';

import { AppError } from '../../common/errors/app-error';

export type ImageType = 'jpeg' | 'png' | 'webp' | 'heic';

/** Longest side of a stored photo, in pixels (SPEC §4.3 BR-TOAST-2). */
export const PHOTO_MAX_DIMENSION = 1600;
export const PHOTO_CONTENT_TYPE = 'image/webp';

// Guards against decompression bombs: a small file can declare a huge canvas. 100 MP is well above any
// phone camera.
const MAX_INPUT_PIXELS = 100_000_000;

// ISO base media major brands of HEIC/HEIF stills and sequences.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The image type from the file's first bytes; the name and declared MIME type are never trusted. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 12))) return 'heic';
  return null;
}

// Prebuilt sharp has no HEVC decoder (patents), so HEIC goes through libheif compiled to WebAssembly.
async function decodeHeic(input: Buffer): Promise<Sharp> {
  const images = await heicDecode.all({ buffer: input });
  try {
    // The typings leave out the size, which libheif reads from the header without decoding.
    const first = images[0] as (typeof images)[number] & { width: number; height: number };
    if (first.width * first.height > MAX_INPUT_PIXELS) throw new Error('HEIC image too large');
    const { width, height, data } = await first.decode();
    return sharp(data, { raw: { width, height, channels: 4 } });
  } finally {
    (images as typeof images & { dispose: () => void }).dispose();
  }
}

function invalidPhoto(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { [PHOTO_FIELD]: message });
}

/**
 * Re-encodes an uploaded photo to WebP: turned upright by its EXIF orientation, at most
 * `PHOTO_MAX_DIMENSION` on the longest side, and without any metadata (EXIF incl. GPS, XMP, ICC).
 * Throws a 400 for anything that isn't a readable JPEG, PNG, WebP or HEIC.
 */
export async function processPhoto(input: Buffer): Promise<Buffer> {
  const type = detectImageType(input);
  if (!type) throw invalidPhoto('Photo must be a JPEG, PNG, WebP or HEIC image');

  try {
    const image =
      type === 'heic'
        ? await decodeHeic(input)
        : sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    // sharp drops all metadata unless asked to keep it, so `rotate()` must apply the orientation first.
    return await image
      .rotate()
      .resize({
        width: PHOTO_MAX_DIMENSION,
        height: PHOTO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw invalidPhoto('Photo could not be read');
  }
}
