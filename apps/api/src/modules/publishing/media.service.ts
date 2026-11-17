import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { pool } from '../../database/pool.js';
import { withTransaction } from '../../database/transaction.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { mediaIds } from '@zayqora/contracts';
import { publishingRepository as repo } from './publishing.repository.js';
import { storage } from './storage.js';
export async function uploadImage(restaurantId: string, body: Buffer, alt: string) {
  if (!body.length || body.length > 5 * 1024 * 1024)
    throw new ValidationError('Image must be between 1 byte and 5 MB');
  let processed: Buffer;
  let width: number, height: number;
  try {
    const image = sharp(body, { limitInputPixels: 24000000, animated: false, failOn: 'warning' });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format || '') ||
      (meta.pages ?? 1) > 1 ||
      !meta.width ||
      !meta.height ||
      meta.width > 6000 ||
      meta.height > 6000
    )
      throw new Error('Unsupported format or dimensions');
    const result = await image.rotate().webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    processed = result.data;
    width = result.info.width;
    height = result.info.height;
  } catch {
    throw new ValidationError(
      'Use a valid, nonanimated JPEG, PNG or WebP image, at most 6000px per side and 24 megapixels'
    );
  }
  const key = `${randomUUID()}.webp`;
  await storage.put(key, processed);
  try {
    return await withTransaction(async (client) => {
      await repo.locked(client, restaurantId);
      return (
        await repo.execute(client, 'insertMediaAssets', [
          restaurantId,
          key,
          alt,
          width,
          height,
          processed.length,
        ])
      ).rows[0];
    });
  } catch (error) {
    await storage.remove(key).catch(() => {});
    throw error;
  }
}
export async function deleteImage(restaurantId: string, assetId: string) {
  const key = await withTransaction(async (client) => {
    const d = await repo.locked(client, restaurantId);
    if (mediaIds(d.content).includes(assetId))
      throw new ConflictError('Detach this image from the saved draft first');
    if ((await repo.execute(client, 'selectPublicationAssets', [restaurantId, assetId])).rowCount)
      throw new ConflictError('Publication history retains this image');
    const row = (await repo.execute(client, 'deleteMediaAssets', [restaurantId, assetId])).rows[0];
    if (!row) throw new NotFoundError('Image not found');
    return row.object_key;
  });
  await storage.remove(key);
  return { deleted: true };
}
export async function imageBytes(assetId: string, restaurantId?: string, slug?: string) {
  const result = restaurantId
    ? await repo.execute(pool, 'selectMediaAssets3', [restaurantId, assetId])
    : await repo.execute(pool, 'selectMediaAssets4', [assetId, slug]);
  if (!result.rows[0]) throw new NotFoundError('Image not found');
  return storage.get(result.rows[0].object_key);
}
