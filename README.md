# WakYak

TypeScript monorepo for WakYak. It contains a Fastify API, Better Auth, PostgreSQL through Prisma, transactional email, the minimal public profile model, and a React/Vite testbed built with TanStack Router, TanStack Query, and shadcn/ui.

## Prerequisites

- Node.js 24 LTS or newer
- pnpm 10.33.2 (Corepack is recommended)
- Docker Desktop with Docker Compose

## Repository layout

```text
apps/api                    Fastify API, Better Auth, routes, and tests
apps/web                    React testbed for auth, profile onboarding, and route guards
packages/database           Prisma schema, migration, generated client boundary
packages/database/prisma    Schema and committed migration history
compose.yaml                Development PostgreSQL 17 service
```

`@wakyak/database` owns the only Prisma client. The API consumes that workspace package; it does not construct another client.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

Replace `BETTER_AUTH_SECRET` in `.env` with a development secret:

```bash
openssl rand -base64 48
```

Then start PostgreSQL, apply the committed migration, and run the API:

```bash
docker compose up -d
docker compose ps
pnpm db:migrate
pnpm dev
```

The default API origin is `http://localhost:4000` and the web app is `http://localhost:5173`. `docker compose ps` should show the `postgres` service as healthy. `POSTGRES_PORT` can change the exposed host port; update `DATABASE_URL` to match.

The initial migration is `20260715030000_initial_auth_and_profile`. Migrations—not `prisma db push`—are the canonical database setup.

## Commands

```bash
pnpm dev                 # run the API and web app in watch mode
pnpm build               # production TypeScript builds
pnpm typecheck           # strict TypeScript checks
pnpm lint                # typed ESLint checks
pnpm format              # format all maintained files
pnpm test                # provider-independent unit/route tests
pnpm test:integration    # real PostgreSQL auth/profile tests
pnpm db:generate         # generate the Prisma 7 client
pnpm db:migrate          # create/apply development migrations
pnpm db:migrate:deploy   # apply committed migrations non-interactively
pnpm db:studio           # open Prisma Studio
pnpm db:reset            # DESTRUCTIVE: erase and rebuild the configured database
```

## Configuration

The ignored root `.env` is used locally. Deployment values belong in the host's secret manager.

| Variable                                                             | Purpose                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                                                           | `development`, `test`, or `production`                             |
| `API_HOST`, `API_PORT`, `API_ORIGIN`                                 | Listen address and externally visible API origin                   |
| `TRUST_PROXY`                                                        | Trust Fastify proxy headers; enable only behind a controlled proxy |
| `TRUSTED_ORIGINS`                                                    | Comma-separated, explicit browser origins; `*` is rejected         |
| `VITE_API_ORIGIN`                                                    | Local-development API origin used by the browser application       |
| `BODY_LIMIT_BYTES`                                                   | Maximum request body size                                          |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Compose PostgreSQL settings                                        |
| `DATABASE_URL`                                                       | Prisma PostgreSQL connection URL                                   |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                              | Better Auth signing secret and public base URL                     |
| `SESSION_EXPIRES_IN_SECONDS`, `SESSION_UPDATE_AGE_SECONDS`           | Database session lifetime and refresh age                          |
| `GOOGLE_AUTH_ENABLED`                                                | Configure Google only when `true`                                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                           | Google web OAuth client credentials                                |
| `EMAIL_MODE`                                                         | `console` locally/tests or `brevo`                                 |
| `BREVO_API_KEY`                                                      | Brevo transactional email key                                      |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`                              | Verified Brevo sender                                              |

If Google authentication is disabled, empty Google credentials are allowed and the provider is not passed to Better Auth. If enabled, incomplete credentials fail startup. Production additionally requires HTTPS origins, Brevo mode, a strong auth secret, and non-placeholder database credentials.

## Routes

Better Auth is mounted at `/api/auth/*`. Its relevant native endpoints include:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/send-verification-email`
- `GET /api/auth/verify-email`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`
- `POST /api/auth/sign-out`
- Better Auth's session listing/revocation and social sign-in endpoints

Application-owned routes are exactly:

| Method  | Route                            | Authentication            |
| ------- | -------------------------------- | ------------------------- |
| `GET`   | `/health`                        | Public; no database query |
| `GET`   | `/ready`                         | Public; checks PostgreSQL |
| `GET`   | `/v1/me`                         | Required                  |
| `POST`  | `/v1/profile`                    | Required                  |
| `PATCH` | `/v1/profile`                    | Required                  |
| `GET`   | `/v1/profiles/:userId`           | Public                    |
| `GET`   | `/v1/profiles/by-handle/:handle` | Public                    |
| `POST`  | `/v1/logout-all`                 | Required                  |

Application errors use `{ "error": { "code", "message", "requestId" } }`. Better Auth keeps its native response format.

The web testbed exposes `/`, `/sign-in`, `/sign-up`, `/profile`, and `/protected`. The final two require authentication, and `/protected` also requires a completed public profile.

## Backend-only manual test

Keep cookies in a jar so each request uses the database-backed opaque session:

```bash
API=http://localhost:4000
rm -f cookies.txt

curl -i -c cookies.txt -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Person","email":"person@example.com","password":"correct-horse-battery-staple"}' \
  "$API/api/auth/sign-up/email"
```

In `EMAIL_MODE=console`, the API logs that the message was **not delivered**, along with its recipient, type, and verification URL. Open that URL or pass it to `curl -i` exactly as logged. Then sign in:

```bash
curl -i -c cookies.txt -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"person@example.com","password":"correct-horse-battery-staple"}' \
  "$API/api/auth/sign-in/email"

curl -i -c cookies.txt -b cookies.txt "$API/v1/me"
```

Create the separately managed public profile:

```bash
curl -i -c cookies.txt -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"userId":"person-123","handle":"@person_123","displayName":"Person"}' \
  "$API/v1/profile"

curl -i -c cookies.txt -b cookies.txt \
  -X PATCH -H 'content-type: application/json' \
  -d '{"handle":"new_handle","displayName":"New Display Name"}' \
  "$API/v1/profile"

curl -i "$API/v1/profiles/person-123"
curl -i "$API/v1/profiles/by-handle/@new_handle"
```

`userId` is immutable. Only `handle` and `displayName` may be patched. Public results contain only those three public profile properties.

Request and complete a password reset:

```bash
curl -i -H 'content-type: application/json' \
  -d '{"email":"person@example.com","redirectTo":"http://localhost:5173/reset-password"}' \
  "$API/api/auth/request-password-reset"
```

Use the reset token from the console-mode URL with the native reset endpoint:

```bash
curl -i -H 'content-type: application/json' \
  -d '{"token":"TOKEN_FROM_THE_URL_PATH","newPassword":"a-new-strong-password"}' \
  "$API/api/auth/reset-password"
```

Normal logout invalidates the current session; logout-all invalidates every active session for the user:

```bash
curl -i -c cookies.txt -b cookies.txt -X POST "$API/api/auth/sign-out"
curl -i -c cookies.txt -b cookies.txt -X POST "$API/v1/logout-all"
```

## Google OAuth setup

Follow the current [Better Auth Google guide](https://www.better-auth.com/docs/authentication/google) and Google Cloud Console:

1. Create or select a Google Cloud project.
2. Configure its OAuth consent screen.
3. Create an OAuth client ID with application type **Web application**.
4. Add `http://localhost:4000/api/auth/callback/google` as a local authorized redirect URI.
5. Add `https://wakyak.onrender.com/api/auth/callback/google` as the deployment redirect URI.
6. For this server-side redirect flow, an authorized JavaScript origin is not required by the backend. Add the eventual browser application's exact origin if its Google configuration requires one.
7. Put the client ID and secret in the ignored `.env` or deployment secret store, set `GOOGLE_AUTH_ENABLED=true`, restart, and initiate `POST /api/auth/sign-in/social` with `{"provider":"google","callbackURL":"..."}`.
8. Complete the browser consent/callback, confirm a session cookie, and call `/v1/me`.

No live Google flow is claimed by the automated suite.

## Brevo setup

1. Create a Brevo account and verify the sender/domain under Brevo's sender configuration.
2. Create a transactional email API key.
3. Set `EMAIL_MODE=brevo`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME` in `.env` or the deployment secret store.
4. Restart the API, sign up a new email address, and confirm the verification message contains both plain text and minimal HTML.
5. Request a password reset and confirm the reset message likewise arrives.

Brevo mode never logs the sensitive verification/reset URL. No live Brevo delivery is claimed by the automated suite.

## Render configuration

Deploy one Render web service. The Fastify API serves the compiled Vite application and its client-side route fallback, keeping browser, API, and authentication requests on the same origin.

Use this build command:

```bash
pnpm install --frozen-lockfile && pnpm db:generate && pnpm build
```

On a free service, apply migrations in the start command:

```bash
pnpm db:migrate:deploy && API_HOST=0.0.0.0 API_PORT=$PORT pnpm --filter @wakyak/api start
```

Use `https://wakyak.onrender.com` for `API_ORIGIN`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, and the Google OAuth callback above. Set `TRUST_PROXY=true` because the service is behind Render's controlled proxy. Do not set `VITE_API_ORIGIN` in production; production web builds always use their own origin. A separate Render static-site service and cross-origin production cookies are not required.

## Common failures

- **Cookie is not returned:** use `-c cookies.txt -b cookies.txt`; confirm the browser request includes credentials and its origin is in both `TRUSTED_ORIGINS` and CORS configuration.
- **Secure cookie missing locally:** local HTTP intentionally uses non-`Secure` cookies. Production mode requires HTTPS and secure cookies.
- **CORS error:** never use `*` with credentials. Add the exact scheme, host, and port.
- **OAuth redirect mismatch:** `BETTER_AUTH_URL` must be the externally visible API origin and the exact callback must be allowlisted at the provider.
- **Redirect rejected:** callback URLs are restricted by Better Auth's trusted origins.
- **Wrong scheme behind a proxy:** set the public HTTPS origins explicitly and enable `TRUST_PROXY` only for the controlled deployment proxy.
- **Database isn't ready:** wait for `docker compose ps` to report healthy, verify `DATABASE_URL`, then run `pnpm db:migrate:deploy`.

For security expectations and secret handling, see [SECURITY.md](./SECURITY.md).
