# ZAYQORA

A multi-restaurant SaaS with Phase 2 restaurant profiles, images, menus, private previews and published restaurant websites, built on identity, verified accounts, PostgreSQL sessions, transactional onboarding, tenant permissions, and a responsive workspace. Application code, shared contracts, scripts, and tests use TypeScript. The API remains an Express modular monolith; Next.js uses the App Router and Tailwind.

Use Node.js 24 LTS and npm. One root lockfile resolves the workspace dependencies.

```bash
npm ci
npm run setup:dev
# Skip Compose if PostgreSQL already runs locally.
docker compose -f infrastructure/docker/compose.dev.yml up -d
npm run db:migrate
npm run db:seed # optional; DEVELOPMENT ONLY
npm run dev
```

Visit http://localhost:3000. `setup:dev` preserves existing environment files. The API defaults to port 4000. The local database uses the supplied PostgreSQL account; see the ignored local environment file or example for development connection settings. Never reuse these defaults in staging.

With the default development memory email adapter, open http://localhost:3000/api/v1/dev/emails to inspect verification/reset links. This endpoint exists only with a nonproduction memory transport. Memory capture disappears when the process restarts. Alternatively set `EMAIL_PROVIDER=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025` and use Mailpit at http://localhost:8025.

Development demo accounts: `owner1@example.com`, `owner2@example.com`, `staff@example.com`, `multitenant@example.com`, and `admin@example.com`. Their development-only password is `Password123!`. Only the explicitly seeded platform account has a separate platform assignment. Registration can never assign privileges. Seeds are repeatable and are refused outside development/test.

| Command                               | Purpose                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                         | Build contracts and start web + API                             |
| `npm run dev:web` / `npm run dev:api` | Start one app (build contracts first on a clean checkout)       |
| `npm run build`                       | Compile contracts, API, and frontend production output          |
| `npm run lint`                        | ESLint and TypeScript checks                                    |
| `npm run test:unit`                   | Password, token, validation and permission tests                |
| `npm run test:api`                    | Unit, PostgreSQL integration, and isolation tests               |
| `npm run test:e2e`                    | Playwright journeys; starts dedicated test servers on 3100/4100 |
| `npm run db:migrate`                  | Apply ordered SQL migrations under a migration lock             |
| `npm run db:seed`                     | Optional demo data, never part of production migrations         |
| `npm run start -w @zayqora/api`       | Start compiled API after build                                  |
| `npm run start -w @zayqora/web`       | Start production frontend after build                           |

For tests, create a separate database ending in `_test`. The destructive helper rejects other database names. Do not run API and browser suites concurrently against the same test database.

```bash
# Compose creates this database automatically on a fresh volume.
# For an existing local PostgreSQL server:
createdb -h 127.0.0.1 -U postgres zayqora_test
NODE_ENV=test DATABASE_URL=postgres://postgres:1234@127.0.0.1:5432/zayqora_test npm run db:migrate
npm run test:api
npx playwright install chromium
npm run test:e2e
```

Set `TEST_DATABASE_URL` to override the test connection. Test fixtures truncate ONLY that test database and recreate RBAC. Browser test accounts have unique addresses and do not truncate development data.

Documentation: [environment](docs/environment.md), [architecture and security](docs/architecture.md), [API contract](docs/openapi.json), [staging and recovery](docs/staging.md), [verification results](docs/phase-1-verification.md).

Phase 2: [setup, publishing rules, storage, API, caching and release boundaries](docs/phase-2.md). After the optional development seed, run `npm run db:seed:phase2` for two distinct unpublished demonstration menus. Open **Menu & website** in a restaurant workspace. Public routes start at `/r/{slug}` after publishing.

Local abandoned-object cleanup: `npm run media:cleanup` is a dry run; add `-- --apply` to remove only untracked objects older than seven days. Referenced draft and historical images are retained.

Phase 2 execution evidence and per-step status: [verification report](docs/phase-2-verification.md).
