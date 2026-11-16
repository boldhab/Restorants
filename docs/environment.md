# Environment reference

`apps/api/.env` is loaded relative to the API source. Deployment supplies process environment variables; these take precedence. The compiled server expects deployment environment variables rather than copying a secrets file into its build directory. `apps/web/.env.local` configures the web build. Actual environment files are ignored.

| Variable                                           | Meaning / development default                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| NODE_ENV                                           | `development`, `test`, or `production`                                                                    |
| PORT                                               | API listener, 4000                                                                                        |
| DATABASE_URL                                       | PostgreSQL URL; required explicitly in production                                                         |
| PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE | Alternative development connection components; 127.0.0.1 / 5432 / postgres / local password / zayqora_dev |
| PGSSL                                              | `true` enables TLS with certificate verification; default false                                           |
| ALLOWED_ORIGINS                                    | Comma-separated exact browser origins; http://localhost:3000                                              |
| APP_URL                                            | Public web origin for emailed links; http://localhost:3000                                                |
| SESSION_TTL_HOURS                                  | Absolute lifetime, integer 1–720; 168                                                                     |
| SESSION_SECRET                                     | Reserved server secret; at least 32 characters; production must replace default                           |
| COOKIE_SECRET                                      | At least 32 characters; signs session-bound CSRF values; replace default in production                    |
| COOKIE_NAME                                        | Host-only HttpOnly session cookie name; zayqora_sid                                                       |
| COOKIE_SECURE                                      | false locally, must be true in production                                                                 |
| COOKIE_SAME_SITE                                   | lax (default) or strict; topology uses same-origin web requests                                           |
| TRUST_PROXY_HOPS                                   | 0 by default; set only to the exact number of controlled reverse proxies                                  |
| EMAIL_PROVIDER                                     | memory locally, smtp for actual delivery; production forbids memory                                       |
| EMAIL_FROM                                         | Sender address / display name                                                                             |
| SMTP_HOST / SMTP_PORT                              | Required host for SMTP; local Mailpit uses 127.0.0.1:1025                                                 |
| SMTP_SECURE                                        | Implicit SMTP TLS; false for Mailpit, typically true for port 465                                         |
| SMTP_USER / SMTP_PASS                              | Credentials if SMTP requires authentication                                                               |
| TEST_DATABASE_URL                                  | Test harness only; database path must end in `_test`                                                      |
| API_PROXY_URL                                      | **Web server/build only** API origin; http://127.0.0.1:4000                                               |

Production refuses missing DATABASE_URL, development secrets, insecure cookies, non-HTTPS application/origin URLs, or a memory/missing SMTP configuration. Invalid ports, lifetimes, enums, origins and URLs fail initialization with field names. No database/auth/email settings are prefixed `NEXT_PUBLIC_`. Browser code uses a fixed relative `/api/v1` address, so server environment values cannot enter the browser client module.

The browser sends cookies to the Next.js origin. Next.js rewrites `/api/v1/*` to Express. Production exposes only the web reverse proxy and isolates the API on a private network. CORS is an additional exact-origin allowlist; cookies never use wildcard origins. Websocket, worker, Redis and billing placeholders are outside Phase 1.
