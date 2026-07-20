# WakYak web testbed

React and Vite client for exercising the WakYak backend. It uses code-based TanStack Router routes, TanStack Query for authenticated API state, Better Auth's React client, and shadcn/ui components.

## Routes

- `/` — session-aware redirect
- `/sign-in` and `/sign-up` — invitation-aware authentication
- `/onboarding` — authenticated profile creation
- `/feed/:mode` — Hot, New, Top, and Following feeds
- `/posts/:postId` — conversation view
- `/notifications` — all and unread notifications
- `/profiles/:profileId` — public profile content
- `/me/followers` and `/me/following` — owner-private social lists
- `/settings` — member preferences and block management
- `/admin/invitations` — owner-only invitation administration

The authenticated route guard reads `/v1/me`. A signed-in user with `profile: null` is redirected to `/onboarding` before member content renders. Admin authorization is a separate server-side access check; `/v1/me` does not expose an owner flag, the admin screen is lazy-loaded only after authorization succeeds, and all invitation endpoints enforce the owner guard independently.

From the repository root, run `pnpm dev`. The web app defaults to `http://localhost:5173` and reads an optional local-development API override from `VITE_API_ORIGIN`. When Tailscale is connected, the root dev command also prints and serves a private HTTPS URL; API and authentication requests from that URL are proxied through Vite to the local Fastify server.

Production builds use the page's own origin for API and authentication requests. The Fastify service serves `apps/web/dist`, including an `index.html` fallback for client-side routes, so production does not require a separate static-site service.
