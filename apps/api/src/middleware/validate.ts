import { ValidationError } from '../shared/errors/app-error.js';

export function validate(schema: import('zod').ZodType, source: 'body' = 'body') {
  return (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) => {
    try {
      const dataToValidate = req[source];
      const result = schema.safeParse(dataToValidate);
      if (!result.success) {
        const details = result.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        throw new ValidationError('Validation failed', details);
      }
      req[source] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}
