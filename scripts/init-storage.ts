import 'dotenv/config';
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Local development only: creates the MinIO bucket from .env and makes objects publicly readable,
 * like the CDN in production. In AWS, create the bucket and CDN with your infrastructure tooling instead.
 */
async function main(): Promise<void> {
  const bucket = process.env['S3_BUCKET'];
  const endpoint = process.env['S3_ENDPOINT'];
  if (!bucket || !endpoint) throw new Error('Set S3_BUCKET and S3_ENDPOINT in .env (see .env.example).');

  const client = new S3Client({
    region: process.env['S3_REGION'] ?? 'ap-south-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? '',
      secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? '',
    },
  });
  const exists = await client.send(new HeadBucketCommand({ Bucket: bucket })).then(
    () => true,
    () => false,
  );
  if (!exists) await client.send(new CreateBucketCommand({ Bucket: bucket }));
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          { Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] },
        ],
      }),
    }),
  );
  console.info(`${exists ? 'Updated' : 'Created'} bucket "${bucket}" (public read) at ${endpoint}.`);
}

await main();
