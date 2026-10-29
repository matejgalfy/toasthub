// The throwaway MinIO of the integration tests (started in global-setup.ts, passed to the app in
// setup-int.ts).
export const TEST_S3 = {
  bucket: 'toasthub-photos',
  accessKeyId: 'toasthub',
  secretAccessKey: 'toasthub-secret',
} as const;
