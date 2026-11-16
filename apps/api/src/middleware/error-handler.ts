import { AppError } from '../shared/errors/app-error.js';
import { ErrorCodes } from '../shared/errors/error-codes.js';
import { logger } from '../config/logger.js';

export function errorHandler(
  err: any,
  req: import('express').Request,
  res: import('express').Response,
  _next: import('express').NextFunction
) {
  const requestId = req.id || 'unknown';

  // Handle body parser syntax error (malformed JSON)
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    logger.warn({ requestId, err: err.message }, 'Malformed JSON in request body');
    return res.status(400).json({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Malformed JSON payload',
        details: null,
        requestId,
      },
    });
  }

  // Handle body size limit exceeded
  if (err.type === 'entity.too.large') {
    logger.warn({ requestId, err: err.message }, 'Payload too large');
    return res.status(413).json({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request payload exceeds size limit',
        details: null,
        requestId,
      },
    });
  }

  if (err.code === '23505')
    err = new AppError('A record with these details already exists', 409, 'CONFLICT');
  if (err.code === '22P02')
    err = new AppError('Invalid resource identifier', 400, 'VALIDATION_ERROR');

  // Handle AppError
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ requestId, err }, `Server AppError: ${err.message}`);
    } else {
      logger.warn({ requestId, code: err.errorCode, message: err.message }, `Client AppError`);
    }

    return res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
  }

  // Handle unexpected unhandled errors
  logger.error({ requestId, err }, `Unhandled exception: ${err.message}`);

  const statusCode = 500;
  const message = 'An unexpected error occurred. Please contact support.';

  return res.status(statusCode).json({
    error: {
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message,
      details: null,
      requestId,
    },
  });
}
