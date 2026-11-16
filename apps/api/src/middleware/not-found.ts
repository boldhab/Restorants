import { NotFoundError } from '../shared/errors/app-error.js';

export function notFound(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}
