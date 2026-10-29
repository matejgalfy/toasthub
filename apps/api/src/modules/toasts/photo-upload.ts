import { PHOTO_FIELD } from '@toasthub/shared';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error';

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

export interface PhotoUpload {
  /** The text fields of the body, by name. */
  fields: Record<string, string>;
  /** The bytes of the optional `photo` file part. */
  photo: Buffer | null;
}

/**
 * Reads a `multipart/form-data` body: its text fields and the optional `photo` file part. A request that
 * isn't multipart has neither. `@fastify/multipart` enforces the size limit while streaming (413 past
 * `PHOTO_MAX_BYTES`).
 */
export async function readPhotoUpload(request: FastifyRequest): Promise<PhotoUpload> {
  const upload: PhotoUpload = { fields: {}, photo: null };
  if (!request.isMultipart()) return upload;
  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') upload.fields[part.fieldname] = part.value;
        continue;
      }
      if (part.fieldname !== PHOTO_FIELD) {
        throw new AppError('VALIDATION_ERROR', 'Unexpected file field', {
          [part.fieldname]: `Only a "${PHOTO_FIELD}" file is accepted`,
        });
      }
      upload.photo = await part.toBuffer();
    }
    return upload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (statusOf(error) === 413) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Photo is larger than 10 MB');
    }
    // Everything else here is a malformed body from the client (busboy and the plugin's own errors).
    throw new AppError('VALIDATION_ERROR', 'Invalid multipart body');
  }
}
