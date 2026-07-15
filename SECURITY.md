# Security policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, session tokens, personal data, or reset links. Report vulnerabilities privately to the repository owner or the private security contact configured for the project. Include affected revision, reproduction steps, impact, and any suggested mitigation. Allow time for investigation before public disclosure.

## Secrets

Never commit:

- `BETTER_AUTH_SECRET`
- database production credentials or connection URLs
- Google client secrets
- Apple `.p8` private keys or generated client-secret JWTs
- Brevo API keys
- session cookies or tokens
- verification or password-reset URLs/tokens
- provider access, refresh, or ID tokens

The root `.env`, `cookies.txt`, generated logs, and local Apple key files are ignored. Use the deployment platform's secret manager outside local development. Rotate a secret immediately if it is exposed.

## Session assumptions

Better Auth owns authentication and stores opaque sessions in PostgreSQL. The application does not issue JWT access tokens, refresh tokens, or a parallel session. Session cookies are HTTP-only, `SameSite=Lax`, path-wide, and `Secure` in production. HTTPS is mandatory for deployment-like production settings. Logout invalidates the current database session; `/v1/logout-all` revokes the other sessions and then signs out the current session.

Authentication and profile creation are separate. `Profile.authUserId` is derived only from the authenticated session and is excluded from all public/application response schemas. Database constraints enforce one profile per auth user and globally unique public identifiers.

## Local and deployment configuration

Local development may use placeholder PostgreSQL credentials, console email, HTTP, and disabled OAuth providers. These settings are not appropriate for an internet-exposed service.

Production validation requires HTTPS origins, Brevo email, a strong Better Auth secret, explicit trusted origins, and non-placeholder database credentials. Enable `TRUST_PROXY` only when the API is reachable solely through a controlled reverse proxy. An overly broad proxy trust setting lets clients spoof forwarded information.

## OAuth credentials and linking

OAuth provider configuration is omitted unless its explicit flag is enabled. Better Auth performs OAuth code and ID-token validation. The application does not reimplement it. Implicit provider linking is restricted to trusted configured providers and retains Better Auth's local-email-verification ownership gate; explicit linking requires an authenticated session.

Use a Google Web application client and restrict its redirect URIs. For Apple web authentication, use a Service ID associated with the correct primary App ID. Restrict domains and Return URLs to controlled HTTPS origins. Remove unused provider credentials and rotate them on personnel or ownership changes.

## Apple private keys

Apple `.p8` keys should be stored in a secret manager or an ignored file with restrictive filesystem permissions. `APPLE_PRIVATE_KEY_FILE` is preferable for local multiline handling; `APPLE_PRIVATE_KEY` supports literal newlines or escaped `\n`. Apple keys are downloadable only once, so protect the original and revoke/reissue it if exposure is suspected. Never log the key or the generated client-secret JWT.

## Email and sensitive links

Console mode deliberately exposes verification and reset URLs for local testing and clearly states that no email was delivered. Never use console mode on a shared or production system. Brevo mode sends text and HTML but does not log complete sensitive URLs. Password-reset responses do not reveal whether an account exists.

## Logging and responses

Structured logs redact authorization/cookie headers, response cookies, passwords, client secrets, API keys, OAuth codes/tokens, reset and verification tokens, and private keys. Auth request bodies are not explicitly logged. Application errors suppress Prisma errors, SQL, connection strings, constraint names, and stack traces. Public profile serializers allow only `userId`, `handle`, and `displayName`.

## Dependency maintenance

Keep the supported Node LTS line, Fastify, Better Auth, Prisma, PostgreSQL image, Brevo SDK, and security plugins current. Review upstream security advisories and lockfile changes before merging updates. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, and `pnpm build` after dependency changes. Re-run live OAuth and email-provider checks after relevant provider or authentication upgrades.
