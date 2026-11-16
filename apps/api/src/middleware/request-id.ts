import crypto from 'crypto';

export function requestId(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  const incomingId = req.headers['x-request-id'];
  const id =
    typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
