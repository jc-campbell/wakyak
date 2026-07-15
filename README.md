# WakYak backend

Backend-only TypeScript monorepo for WakYak. It contains a Fastify API, Better Auth, PostgreSQL through Prisma, transactional email, and the minimal public profile model. There is no frontend application in this repository.

## Prerequisites

- Node.js 24 LTS or newer
- pnpm 10.33.2 (Corepack is recommended)
- Docker Desktop with Docker Compose

## Repository layout

```text
apps/api                    Fastify API, Better Auth, routes, and tests
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

The default API origin is `http://localhost:4000`. `docker compose ps` should show the `postgres` service as healthy. `POSTGRES_PORT` can change the exposed host port; update `DATABASE_URL` to match.

The initial migration is `20260715030000_initial_auth_and_profile`. Migrations—not `prisma db push`—are the canonical database setup.

## Commands

```bash
pnpm dev                 # watch the API
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
| `BODY_LIMIT_BYTES`                                                   | Maximum request body size                                          |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Compose PostgreSQL settings                                        |
| `DATABASE_URL`                                                       | Prisma PostgreSQL connection URL                                   |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                              | Better Auth signing secret and public base URL                     |
| `SESSION_EXPIRES_IN_SECONDS`, `SESSION_UPDATE_AGE_SECONDS`           | Database session lifetime and refresh age                          |
| `GOOGLE_AUTH_ENABLED`                                                | Configure Google only when `true`                                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                           | Google web OAuth client credentials                                |
| `APPLE_AUTH_ENABLED`                                                 | Configure Apple only when `true`                                   |
| `APPLE_CLIENT_ID`                                                    | Apple Service ID for the web flow                                  |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`                                      | Apple developer team and Sign in with Apple key identifiers        |
| `APPLE_PRIVATE_KEY`                                                  | `.p8` key with literal newlines or escaped `\n` sequences          |
| `APPLE_PRIVATE_KEY_FILE`                                             | Alternative path to an untracked local `.p8` file                  |
| `APPLE_APP_BUNDLE_IDENTIFIER`                                        | Optional native App ID audience for later native clients           |
| `EMAIL_MODE`                                                         | `console` locally/tests or `brevo`                                 |
| `BREVO_API_KEY`                                                      | Brevo transactional email key                                      |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`                              | Verified Brevo sender                                              |

If a provider flag is false, its empty credentials are allowed and the provider is not passed to Better Auth. If enabled, incomplete credentials fail startup. Production additionally requires HTTPS origins, Brevo mode, a strong auth secret, and non-placeholder database credentials.

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

## Sign in with Apple setup

Follow the current [Better Auth Apple guide](https://www.better-auth.com/docs/authentication/apple) and Apple Developer portal:

1. Create an App ID and enable Sign in with Apple.
2. Create a **Service ID** for the web flow; this is `APPLE_CLIENT_ID`.
3. Associate the Service ID with the primary App ID.
4. Configure `wakyak.onrender.com` under Domains and Subdomains.
5. Configure `https://wakyak.onrender.com/api/auth/callback/apple` as the Return URL.
6. Create a Sign in with Apple key, download the `.p8` file once, and record its Key ID and the account Team ID.
7. Store the `.p8` contents in `APPLE_PRIVATE_KEY` or point `APPLE_PRIVATE_KEY_FILE` at an ignored file. Set the remaining Apple variables and `APPLE_AUTH_ENABLED=true`.
8. Restart, initiate the Better Auth social sign-in endpoint with provider `apple`, complete the browser flow, then verify the session through `/v1/me`.

The configured provider dynamically signs Apple's ES256 client-secret JWT and rotates it on process/configuration re-creation. Apple web Return URLs require HTTPS and do not support a plain localhost Return URL. For local end-to-end testing, use a stable HTTPS tunnel, add its domain and exact `/api/auth/callback/apple` Return URL in Apple Developer, and set `BETTER_AUTH_URL`/`API_ORIGIN` to that tunnel. `http://localhost:4000/api/auth/callback/apple` is the route shape but is not an Apple-acceptable web Return URL.

`APPLE_APP_BUNDLE_IDENTIFIER` is needed only when a future native client sends Apple ID tokens whose audience is the native App ID.

No live Apple flow is claimed by the automated suite.

## Brevo setup

1. Create a Brevo account and verify the sender/domain under Brevo's sender configuration.
2. Create a transactional email API key.
3. Set `EMAIL_MODE=brevo`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME` in `.env` or the deployment secret store.
4. Restart the API, sign up a new email address, and confirm the verification message contains both plain text and minimal HTML.
5. Request a password reset and confirm the reset message likewise arrives.

Brevo mode never logs the sensitive verification/reset URL. No live Brevo delivery is claimed by the automated suite.

## Deployment-like Render configuration

Use `https://wakyak.onrender.com` for `API_ORIGIN`, `BETTER_AUTH_URL`, and the OAuth callbacks above. Set `API_HOST=0.0.0.0`, map `API_PORT` to the port Render expects, set `TRUST_PROXY=true` only because the service is behind Render's controlled proxy, and supply explicit browser origins in `TRUSTED_ORIGINS`. Apply migrations with `pnpm db:migrate:deploy` before starting `pnpm --filter @wakyak/api start`.

## Common failures

- **Cookie is not returned:** use `-c cookies.txt -b cookies.txt`; confirm the browser request includes credentials and its origin is in both `TRUSTED_ORIGINS` and CORS configuration.
- **Secure cookie missing locally:** local HTTP intentionally uses non-`Secure` cookies. Production mode requires HTTPS and secure cookies.
- **CORS error:** never use `*` with credentials. Add the exact scheme, host, and port.
- **OAuth redirect mismatch:** `BETTER_AUTH_URL` must be the externally visible API origin and the exact callback must be allowlisted at the provider.
- **Redirect rejected:** callback URLs are restricted by Better Auth's trusted origins.
- **Wrong scheme behind a proxy:** set the public HTTPS origins explicitly and enable `TRUST_PROXY` only for the controlled deployment proxy.
- **Apple fails locally:** Apple web authentication requires a configured HTTPS domain/Return URL; use a tunnel rather than plain localhost.
- **Database isn't ready:** wait for `docker compose ps` to report healthy, verify `DATABASE_URL`, then run `pnpm db:migrate:deploy`.

For security expectations and secret handling, see [SECURITY.md](./SECURITY.md).
