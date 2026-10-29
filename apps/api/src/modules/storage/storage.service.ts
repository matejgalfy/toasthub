import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { ConfigService } from '../../config/config.service';

/** How long a presigned photo URL stays valid (SPEC §6). */
export const PRESIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Object storage for photos on any S3-compatible API (MinIO in dev). Callers check visibility before they
 * ask for a URL; this service only signs.
 */
@Injectable()
export class StorageService implements OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
      },
      // Checksums only where S3 demands them: not every S3-compatible store accepts the SDK's defaults.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Succeeds when the object is already gone. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** A GET URL for `key`, valid for one hour. Signing is local: it doesn't contact the store. */
  presignGet(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
    });
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
