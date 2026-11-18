import { writeFile } from 'node:fs/promises';
import { workerOnce } from '../src/modules/commerce/worker.js';
import { pool } from '../src/database/pool.js';
import { logger } from '../src/config/logger.js';
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
try {
  do {
    try {
      logger.info(await workerOnce(), 'Commerce worker cycle');
      await writeFile(
        process.env.WORKER_HEARTBEAT_FILE || '/tmp/zayqora-worker-heartbeat',
        String(Date.now())
      );
    } catch (error) {
      logger.error({ error }, 'Commerce worker cycle failed');
      if (process.argv.includes('--once')) throw error;
    }
    if (!stopped && !process.argv.includes('--once'))
      await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (!stopped && !process.argv.includes('--once'));
} finally {
  await pool.end();
}
