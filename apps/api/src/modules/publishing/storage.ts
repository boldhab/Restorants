import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
// Objects are private. Both adapters deliver through authenticated/publication-aware API routes.
const root = resolve(process.env.MEDIA_LOCAL_ROOT || '/tmp/zayqora-media');
const sourceRoot = resolve(fileURLToPath(import.meta.url).split('/apps/api/')[0]);
function validateLocalRoot() {
  if (
    root === sourceRoot ||
    root.startsWith(sourceRoot + '/') ||
    ['/usr', '/bin', '/sbin', '/etc'].some((p) => root === p || root.startsWith(p + '/'))
  )
    throw new Error('Media storage must be outside source and executable directories');
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest();
async function objectRequest(method: string, key: string, body?: Buffer) {
  const endpoint = process.env.MEDIA_S3_ENDPOINT;
  if (
    !endpoint ||
    !process.env.MEDIA_S3_BUCKET ||
    !process.env.MEDIA_S3_ACCESS_KEY ||
    !process.env.MEDIA_S3_SECRET_KEY
  )
    throw new Error('S3 storage configuration is incomplete');
  const url = new URL(
    `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(process.env.MEDIA_S3_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`
  );
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production')
    throw new Error('Production object storage requires HTTPS');
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8),
    region = process.env.MEDIA_S3_REGION || 'us-east-1';
  const payload = hash(body ?? '');
  const headers = `host:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n`;
  const signed = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = `${method}\n${url.pathname}\n\n${headers}\n${signed}\n${payload}`;
  const scope = `${day}/${region}/s3/aws4_request`;
  const signing = hmac(
    hmac(hmac(hmac(`AWS4${process.env.MEDIA_S3_SECRET_KEY}`, day), region), 's3'),
    'aws4_request'
  );
  const signature = createHmac('sha256', signing)
    .update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`)
    .digest('hex');
  const response = await fetch(url, {
    method,
    body: body ? new Uint8Array(body) : undefined,
    headers: {
      'x-amz-date': date,
      'x-amz-content-sha256': payload,
      Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.MEDIA_S3_ACCESS_KEY}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Object storage ${method} failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
export const storage = {
  async put(key: string, body: Buffer) {
    if (process.env.MEDIA_STORAGE === 's3') {
      await objectRequest('PUT', key, body);
      return;
    }
    if (process.env.NODE_ENV === 'production' && !process.env.MEDIA_LOCAL_ROOT)
      throw new Error('Production local storage requires a persistent MEDIA_LOCAL_ROOT');
    validateLocalRoot();
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, key), body, { flag: 'wx', mode: 0o600 });
  },
  async get(key: string) {
    validateLocalRoot();
    return process.env.MEDIA_STORAGE === 's3'
      ? objectRequest('GET', key)
      : readFile(join(root, key));
  },
  async remove(key: string) {
    if (process.env.MEDIA_STORAGE === 's3') await objectRequest('DELETE', key);
    else await unlink(join(root, key));
  },
};
