import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

// The throwaway MinIO of the integration tests (started in global-setup.ts, passed to the app in
// setup-int.ts).
export const TEST_S3 = {
  bucket: 'toasthub-photos',
  accessKeyId: 'toasthub',
  secretAccessKey: 'toasthub-secret',
} as const;

/** Whether the test bucket holds `key`. */
export async function objectExists(key: string): Promise<boolean> {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_S3.accessKeyId, secretAccessKey: TEST_S3.secretAccessKey },
  });
  try {
    await s3.send(new HeadObjectCommand({ Bucket: TEST_S3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  } finally {
    s3.destroy();
  }
}
