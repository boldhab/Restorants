import type { PoolClient } from 'pg';
import { commerceQueries } from './commerce.queries.js';
export const commerceRepository = {
  execute(
    client: Pick<PoolClient, 'query'>,
    operation: keyof typeof commerceQueries,
    values: unknown[] = []
  ) {
    return client.query(commerceQueries[operation], values);
  },
};
