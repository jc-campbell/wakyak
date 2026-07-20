# WakYak

TypeScript monorepo for WakYak. It contains a Fastify API, Better Auth, PostgreSQL through Prisma, S3-compatible object storage, transactional email, shared runtime contracts, and a React/Vite application built with TanStack Router, TanStack Query, and Tailwind CSS.

## Prerequisites

- Node.js 24 LTS or newer
- pnpm 10.33.2 (Corepack is recommended)
- Docker Desktop with Docker Compose

## Repository layout

```text
apps/api                    Fastify API, Better Auth, routes, and tests
apps/web                    React member application and typed API client
packages/contracts          Canonical Zod request and response contracts
packages/database           Prisma schema, migration, generated client boundary
packages/database/prisma    Schema and committed migration history
compose.yaml                Development PostgreSQL 17 and S3Mock services
```

`@wakyak/database` owns the only Prisma client. The API consumes that workspace package; it does not construct another client.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

Replace `BETTER_AUTH_SECRET`, `ANONYMITY_SECRET`, and `INVITATION_COOKIE_SECRET` in `.env` with independent development secrets:

```bash
openssl rand -base64 48
```

Then start PostgreSQL and local object storage, apply the committed migration, and run the API:

```bash
docker compose up -d
docker compose ps
pnpm db:migrate
pnpm dev
```

The default API origin is `http://localhost:4000` and the web app is `http://localhost:5173`. When Tailscale is installed and connected, `pnpm dev` also discovers the machine's MagicDNS hostname and exposes the complete web app through a temporary, tailnet-only HTTPS Serve proxy. The terminal prints the URL. Stopping the dev command stops the proxy; when Tailscale is unavailable, localhost development continues normally. The first use may ask you to enable HTTPS for the tailnet. Development attachment uploads use the web server's same-origin `/__storage` proxy, so they also work from the printed tailnet URL instead of pointing the remote browser at its own `localhost`.

`docker compose ps` should show the `postgres` and `s3mock` services as healthy. S3Mock exposes its AWS-compatible endpoint at `http://localhost:9090` and creates the `wakyak-attachments` bucket automatically. `POSTGRES_PORT` and `S3MOCK_PORT` can change the exposed host ports; update `DATABASE_URL` and `S3_ENDPOINT` to match.

To use the production Cloudflare R2 bucket during local development, keep local PostgreSQL running but replace the `S3_*` values in the ignored `.env` with the bucket-scoped R2 credentials:

```dotenv
S3_ENDPOINT=https://13c55b38e666b5936e558963a09a1a8c.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=wakyak-attachments
S3_ACCESS_KEY_ID=your-r2-access-key-id
S3_SECRET_ACCESS_KEY=your-r2-secret-access-key
S3_FORCE_PATH_STYLE=true
```

The R2 bucket remains private. The API issues short-lived presigned URLs, and the development web server proxies uploads through `/__storage`. Restart both applications after changing `.env`.

The initial migration is `20260715030000_initial_auth_and_profile`. Migrations—not `prisma db push`—are the canonical database setup.

## Commands

```bash
pnpm dev                 # run API + web watch mode and Tailscale Serve when available
pnpm dev:apps            # run only the API and web app in watch mode
pnpm build               # production TypeScript builds
pnpm typecheck           # strict TypeScript checks
pnpm lint                # typed ESLint checks
pnpm format              # format all maintained files
pnpm verify              # formatting, types, lint, unit tests, and production build
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
| `TEST_DATABASE_URL`                                                  | Distinct disposable database used by integration tests             |
| `S3MOCK_PORT`                                                        | S3Mock HTTP port used during development                           |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`                              | Attachment object-storage location                                 |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`    | Attachment object-storage client settings                          |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                              | Better Auth signing secret and public base URL                     |
| `SITE_OWNER_EMAIL`                                                   | Sole owner account; may register without an invitation             |
| `ANONYMITY_SECRET`, `INVITATION_COOKIE_SECRET`                       | Independent HMAC and signed-redemption-cookie secrets              |
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

Application-owned routes include:

| Method            | Route                                      | Authentication           |
| ----------------- | ------------------------------------------ | ------------------------ |
| `GET`             | `/health`, `/ready`, `/v1/auth/config`     | Public                   |
| `GET`             | `/v1/me`                                   | Required                 |
| `POST`            | `/v1/profile`                              | Required                 |
| `PATCH`           | `/v1/me/profile`                           | Required                 |
| `GET`             | `/v1/profiles/:profileId` and subresources | Profile required         |
| `GET`             | `/v1/feed`                                 | Profile required         |
| `PUT`             | `/v1/feed/seen`                            | Profile required         |
| `PUT/DELETE`      | `/v1/follows/:handle`                      | Profile required         |
| `PUT/GET/DELETE`  | `/v1/blocks`, `/v1/me/blocks`              | Profile required         |
| `GET/PUT`         | `/v1/notifications...`                     | Profile required         |
| `GET/PUT`         | `/v1/posts/:postId/subscription`           | Profile required         |
| `GET/PATCH`       | `/v1/settings`                             | Profile required         |
| `POST`            | `/v1/invitations/redeem`                   | Public                   |
| `GET`             | `/v1/admin/access`                         | Owner + profile required |
| `GET/POST/DELETE` | `/v1/admin/invitations...`                 | Owner + profile required |
| `GET/POST/DELETE` | `/v1/posts...`, `/v1/comments...`          | Profile required         |
| `PUT/DELETE`      | `/v1/{posts,comments}/:id/reaction`        | Profile required         |
| `GET/POST/DELETE` | `/v1/attachments...`                       | Profile required         |

Application errors use `{ "error": { "code", "message", "requestId" } }`. Better Auth keeps its native response format.

The web app exposes `/sign-in`, `/sign-up`, `/onboarding`, `/feed/:mode`, `/posts/:postId`, `/notifications`, `/profiles/:profileId`, the private follower/following lists, `/settings`, and the owner-only `/admin/invitations` screen. Its route guards preserve the requested destination across sign-in and separate authenticated users who still need a profile from completed members.

Owner status is not included in `/v1/me` or another identity payload. The admin route performs `GET /v1/admin/access` before lazy-loading its screen, and every invitation read or mutation independently runs the API's owner guard. Client-side visibility is therefore only a presentation concern; authority remains server-side.

## Attachment upload origins

The browser validates at most four supported images of at most 10 MB each, then uses reserve → object upload → complete. In development, the API converts local S3Mock upload URLs to `/__storage/...`; Vite proxies that path to `S3_ENDPOINT`. This keeps both `http://localhost:5173` and the tailnet HTTPS origin same-origin and avoids mixed-content failures.

Production keeps the presigned object-storage URL direct. The `wakyak-attachments` R2 bucket allows `PUT` from `https://wakyak.onrender.com` with the `Content-Type` header. Keep that origin synchronized if the production hostname changes, and avoid wildcard origins when credentials are enabled.

## Backend-only manual test

Keep cookies in a jar so each request uses the database-backed opaque session. First redeem an owner-created invitation (the configured owner email is the only bypass):

```bash
API=http://localhost:4000
rm -f cookies.txt

curl -i -c cookies.txt -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"code":"CODE-FROM-THE-OWNER"}' \
  "$API/v1/invitations/redeem"

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
  -d '{"handle":"new_handle","displayName":"New Display Name","bio":"Hello"}' \
  "$API/v1/me/profile"

curl -i -b cookies.txt "$API/v1/profiles/person-123"
```

`userId` is immutable. Public profile details include counts and Wakarma, while embedded authors use the smaller public-author contract.

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

The versioned `render.yaml` Blueprint creates a free Docker web service named `wakyak-docker` in Render's Virginia region and connects it to the existing free Render Postgres resource named `postgres`. The database is referenced by name rather than managed by the Blueprint, so syncing the Blueprint does not attempt to create or replace it. The Fastify API serves the compiled Vite application and its client-side route fallback, keeping browser, API, and authentication requests on the same origin. The image builds Sharp against a custom libvips/libheif installation and fails its build if HEIF/HEIC input support is absent.

Render's pre-deploy command is unavailable on free web services, so the container applies pending migrations before starting the API. A failed migration prevents that container from becoming healthy. The startup command honors Render's `PORT`; `/ready` is the HTTP health check and verifies PostgreSQL connectivity before Render routes traffic.

Create the Blueprint in the same Render workspace as the existing `postgres` database, then provide the values marked `sync: false`: the owner email, Brevo key and verified sender, and the bucket-scoped R2 access-key pair. Render generates the three independent application secrets and wires `DATABASE_URL` to that database's private connection string. Auto-deploy waits for all GitHub CI checks to pass.

Render's free Postgres instance is suitable only for this short-lived deployment: it has a 1 GB limit, no backups, and expires 30 days after creation. Render provides a 14-day upgrade grace period before deleting an expired database and its data.

Use `https://wakyak-docker.onrender.com` for `API_ORIGIN`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, R2 CORS, and any Google OAuth callback enabled for this temporary Docker deployment. `TRUST_PROXY=true` is set because the service is behind Render's controlled proxy. Do not set `VITE_API_ORIGIN` in production; production web builds always use their own origin. A separate Render static-site service, persistent disk, and cross-origin production cookies are not required.

## Common failures

- **Cookie is not returned:** use `-c cookies.txt -b cookies.txt`; confirm the browser request includes credentials and its origin is in both `TRUSTED_ORIGINS` and CORS configuration.
- **Secure cookie missing locally:** local HTTP intentionally uses non-`Secure` cookies. Production mode requires HTTPS and secure cookies.
- **CORS error:** never use `*` with credentials. Add the exact scheme, host, and port.
- **OAuth redirect mismatch:** `BETTER_AUTH_URL` must be the externally visible API origin and the exact callback must be allowlisted at the provider.
- **Redirect rejected:** callback URLs are restricted by Better Auth's trusted origins.
- **Wrong scheme behind a proxy:** set the public HTTPS origins explicitly and enable `TRUST_PROXY` only for the controlled deployment proxy.
- **Database isn't ready:** wait for `docker compose ps` to report healthy, verify `DATABASE_URL`, then run `pnpm db:migrate:deploy`.
- **Attachment storage isn't ready:** wait for `s3mock` to report healthy, then verify `http://localhost:9090/favicon.ico` responds successfully.

For security expectations and secret handling, see [SECURITY.md](./SECURITY.md).
