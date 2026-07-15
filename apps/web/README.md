# WakYak web testbed

React and Vite client for exercising the WakYak backend. It uses code-based TanStack Router routes, TanStack Query for authenticated API state, Better Auth's React client, and shadcn/ui components.

## Routes

- `/` — public landing page
- `/sign-in` — password and Google sign-in
- `/sign-up` — password and Google sign-up
- `/profile` — authenticated profile onboarding
- `/protected` — authenticated test route requiring a completed profile

The authenticated route guard reads `/v1/me`. A signed-in user with `profile: null` is redirected to `/profile` before protected content renders.

From the repository root, run `pnpm dev`. The web app defaults to `http://localhost:5173` and reads the API origin from `VITE_API_ORIGIN`.
