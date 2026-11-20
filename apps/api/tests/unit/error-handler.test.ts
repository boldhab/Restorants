import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/error-handler.js';

function responseFor(error: unknown) {
  let status = 0;
  let body: any;
  const response = {
    status(value: number) {
      status = value;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
  };
  errorHandler(
    error,
    { id: 'validation-regression' } as Request,
    response as Response,
    (() => {}) as NextFunction
  );
  return { status, body };
}

test('preserves the specific currency-conflict explanation', () => {
  const result = responseFor({
    code: '23514',
    message: 'Currency cannot change after menu prices exist',
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'CONFLICT');
  assert.equal(result.body.error.message, 'Currency cannot change after menu prices exist');
});

test('does not mislabel unrelated integrity failures as currency changes or leak SQL details', () => {
  const result = responseFor({
    code: '23514',
    message: 'private check constraint for cash session',
    detail: 'private ledger record',
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'CONFLICT');
  assert.equal(result.body.error.message, 'The change violates a data integrity rule');
  assert.doesNotMatch(JSON.stringify(result.body), /currency|private/i);
});

test('returns a safe validation error for invalid database input', () => {
  const result = responseFor({
    code: '22P02',
    message: 'invalid input syntax for uuid: "private-value"',
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.equal(result.body.error.message, 'Invalid resource identifier or value');
  assert.doesNotMatch(JSON.stringify(result.body), /private-value/);
});
