import { ErrorCodes } from './error-codes.js';

export class AppError extends Error {
  statusCode: number;
  errorCode: string;
  details: unknown;
  constructor(
    message: string,
    statusCode = 500,
    errorCode: string = ErrorCodes.INTERNAL_SERVER_ERROR,
    details: unknown = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details: unknown = null) {
    super(message, 400, ErrorCodes.VALIDATION_ERROR, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ErrorCodes.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, ErrorCodes.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, ErrorCodes.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, ErrorCodes.CONFLICT);
  }
}

export class UnverifiedEmailError extends AppError {
  constructor(message = 'Email address must be verified before performing this action') {
    super(message, 403, ErrorCodes.UNVERIFIED_EMAIL);
  }
}

export class CsrfError extends AppError {
  constructor(message = 'Invalid or missing CSRF token') {
    super(message, 403, ErrorCodes.CSRF_ERROR);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, ErrorCodes.RATE_LIMITED);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'Database service unavailable') {
    super(message, 503, ErrorCodes.DATABASE_UNAVAILABLE);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = 'Idempotency key was already used with a different request payload') {
    super(message, 409, ErrorCodes.IDEMPOTENCY_CONFLICT);
  }
}
