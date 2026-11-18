import { defineConfig } from '@playwright/test';
const production = process.env.E2E_PRODUCTION === 'true';
const database =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test';
if (!new URL(database).pathname.endsWith('_test'))
  throw new Error('Browser tests require a database ending in _test');
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 360000,
  expect: { timeout: 45000 },
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', actionTimeout: 45000 },
  webServer: [
    {
      command: 'npm exec -w @zayqora/api -- tsx src/server.ts',
      url: 'http://127.0.0.1:4100/api/v1/ready',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '4100',
        DATABASE_URL: database,
        APP_URL: 'http://localhost:3100',
        ALLOWED_ORIGINS: 'http://localhost:3100',
        EMAIL_PROVIDER: 'memory',
      },
    },
    {
      command: production
        ? 'npm exec -w @zayqora/web -- next start -p 3100'
        : 'npm exec -w @zayqora/web -- next dev -p 3100 --webpack',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      env: {
        API_PROXY_URL: 'http://127.0.0.1:4100',
        PUBLIC_ORIGIN: 'http://localhost:3100',
        NEXT_DIST_DIR: production ? '.next-e2e-production' : '.next-e2e',
      },
    },
  ],
});
