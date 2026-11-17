import { readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pool } from '../src/database/pool.js';
import '../src/config/env.js';
if (process.env.MEDIA_STORAGE === 's3')
  throw new Error('Remote inventory cleanup requires an operator-reviewed bucket inventory');
const root = resolve(process.env.MEDIA_LOCAL_ROOT || '/tmp/zayqora-media');
const apply = process.argv.includes('--apply');
try {
  const keys = new Set(
    (await pool.query('SELECT object_key FROM media_assets')).rows.map((r) => r.object_key)
  );
  for (const key of await readdir(root)) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(key) || keys.has(key)) continue;
    const path = join(root, key),
      info = await stat(path);
    if (!info.isFile() || Date.now() - info.mtimeMs < 7 * 86400000) continue;
    console.log(`${apply ? 'Removing' : 'Would remove'} abandoned object ${key}`);
    if (apply) await unlink(path);
  }
} finally {
  await pool.end();
}
