import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseHealth, closePool } from './database/pool.js';

let server: import('node:http').Server | undefined;

async function start() {
  try {
    logger.info({ nodeEnv: env.NODE_ENV, port: env.PORT }, 'Initializing ZAYQORA API Server...');

    // Validate database readiness
    logger.info('Checking PostgreSQL database connection...');
    await checkDatabaseHealth();
    logger.info('Database connection established successfully.');

    // Start listening
    server = app.listen(env.PORT, () => {
      logger.info(`ZAYQORA API server listening on http://localhost:${env.PORT}`);
      logger.info(`Health check available at http://localhost:${env.PORT}/api/v1/health`);
      logger.info(`Readiness check available at http://localhost:${env.PORT}/api/v1/ready`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start ZAYQORA API server');
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received. Starting graceful shutdown...');

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed, no longer accepting connections.');
      try {
        await closePool();
        logger.info('All resources released. Process exiting cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error closing resources during shutdown');
        process.exit(1);
      }
    });

    // Force exit if not closed within 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown timeout reached. Terminating process.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception thrown');
  process.exit(1);
});

start();
