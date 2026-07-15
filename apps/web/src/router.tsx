import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { ApiError, meQueryOptions } from "@/lib/api";
import { RootLayout } from "@/layouts/root-layout";
import { queryClient } from "@/lib/query-client";

const LandingView = lazyRouteComponent(
  () => import("@/views/landing-view"),
  "LandingView",
);
const NotFoundView = lazyRouteComponent(
  () => import("@/views/not-found-view"),
  "NotFoundView",
);
const ProfileView = lazyRouteComponent(
  () => import("@/views/profile-view"),
  "ProfileView",
);
const ProtectedView = lazyRouteComponent(
  () => import("@/views/protected-view"),
  "ProtectedView",
);
const SignInView = lazyRouteComponent(
  () => import("@/views/sign-in-view"),
  "SignInView",
);
const SignUpView = lazyRouteComponent(
  () => import("@/views/sign-up-view"),
  "SignUpView",
);

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundView,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingView,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInView,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  component: SignUpView,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions);
      return { me };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw redirect({ to: "/sign-in" });
      }
      throw error;
    }
  },
});

const profileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/profile",
  component: ProfileView,
});

const completedProfileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "completed-profile",
  beforeLoad: ({ context }) => {
    if (!context.me.profile) {
      throw redirect({ to: "/profile" });
    }
  },
});

const protectedRoute = createRoute({
  getParentRoute: () => completedProfileRoute,
  path: "/protected",
  component: ProtectedView,
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  signInRoute,
  signUpRoute,
  authenticatedRoute.addChildren([
    profileRoute,
    completedProfileRoute.addChildren([protectedRoute]),
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
