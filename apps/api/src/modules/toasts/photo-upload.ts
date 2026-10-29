import { PHOTO_FIELD } from '@toasthub/shared';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error';

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

/**
 * The bytes of the optional `photo` file part, or null for a request that isn't multipart or has no file.
 * `@fastify/multipart` enforces the size limit while streaming (413 past `PHOTO_MAX_BYTES`).
 */
export async function readPhotoUpload(request: FastifyRequest): Promise<Buffer | null> {
  if (!request.isMultipart()) return null;
  try {
    const part = await request.file();
    if (!part) return null;
    if (part.fieldname !== PHOTO_FIELD) {
      throw new AppError('VALIDATION_ERROR', 'Unexpected file field', {
        [part.fieldname]: `Only a "${PHOTO_FIELD}" file is accepted`,
      });
    }
    return await part.toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (statusOf(error) === 413) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Photo is larger than 10 MB');
    }
    // Everything else here is a malformed body from the client (busboy and the plugin's own errors).
    throw new AppError('VALIDATION_ERROR', 'Invalid multipart body');
  }
}
