import { Router } from 'express';
import { checkDatabaseHealth } from '../database/pool.js';
import { logger } from '../config/logger.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (req, res) => {
  try {
    await checkDatabaseHealth();
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : 'Database unavailable' },
      'Readiness probe failed: database unreachable'
    );
    res.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});
