import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import { detectImageType, PHOTO_MAX_DIMENSION, processPhoto } from './photo-pipeline';

// 29×100 px, from the pillow_heif test images (BSD-3-Clause). Prebuilt sharp can't write HEVC.
const HEIC_FIXTURE = path.resolve(__dirname, '../../../test/fixtures/sample-29x100.heic');

function blank(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#c08040' } });
}

async function rejection(input: Buffer): Promise<AppError> {
  const error: unknown = await processPhoto(input).catch((e: unknown) => e);
  if (!(error instanceof AppError)) throw new Error('Expected an AppError');
  return error;
}

describe('detectImageType', () => {
  it('recognises the supported types by their magic bytes', async () => {
    expect(detectImageType(await blank(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageType(await blank(4, 4).png().toBuffer())).toBe('png');
    expect(detectImageType(await blank(4, 4).webp().toBuffer())).toBe('webp');
    expect(detectImageType(await readFile(HEIC_FIXTURE))).toBe('heic');
  });

  it('rejects other content whatever it claims to be', async () => {
    expect(detectImageType(await blank(4, 4).gif().toBuffer())).toBeNull();
    // AVIF shares the container with HEIC but has its own brand.
    expect(detectImageType(await blank(4, 4).avif().toBuffer())).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('processPhoto', () => {
  it('strips EXIF including the GPS position', async () => {
    const input = await blank(64, 48)
      .jpeg()
      .withExif({
        IFD0: { Make: 'ToastCam', Copyright: 'Ann' },
        // IFD3 is the GPS directory; the datum is ASCII, so it is easy to find in the raw bytes.
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1', GPSMapDatum: 'WGS-84' },
      })
      .toBuffer();
    expect((await sharp(input).metadata()).exif?.includes('WGS-84')).toBe(true);

    const output = await processPhoto(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(output.includes('WGS-84')).toBe(false);
    expect(output.includes('ToastCam')).toBe(false);
  });

  it('applies the EXIF orientation before dropping it', async () => {
    // Orientation 6: the camera was turned 90°, so the upright photo is portrait.
    const input = await blank(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const metadata = await sharp(await processPhoto(input)).metadata();
    expect([metadata.width, metadata.height]).toEqual([100, 200]);
    expect(metadata.orientation).toBeUndefined();
  });

  it('shrinks the longest side to the maximum and keeps the aspect ratio', async () => {
    const input = await blank(4000, 3000).png().toBuffer();
    const metadata = await sharp(await processPhoto(input)).metadata();
    expect([metadata.width, metadata.height]).toEqual([PHOTO_MAX_DIMENSION, 1200]);
  });

  it('never enlarges a small photo', async () => {
    const metadata = await sharp(
      await processPhoto(await blank(300, 200).webp().toBuffer()),
    ).metadata();
    expect([metadata.width, metadata.height]).toEqual([300, 200]);
  });

  it('converts HEIC to WebP', async () => {
    const metadata = await sharp(await processPhoto(await readFile(HEIC_FIXTURE))).metadata();
    expect(metadata.format).toBe('webp');
    expect([metadata.width, metadata.height]).toEqual([29, 100]);
  });

  it('rejects an unsupported type with a field error', async () => {
    const error = await rejection(await blank(4, 4).gif().toBuffer());
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toHaveProperty('photo');
  });

  it('rejects a file that only starts like an image', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512, 7)]);
    const error = await rejection(fake);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Photo could not be read');
  });
});
