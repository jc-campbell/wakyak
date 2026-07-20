import type { FeedMode, TopWindow } from "@wakyak/contracts";
import { lazy, Suspense } from "react";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";
import { adminAccessQuery, meQuery } from "@/lib/queries";
import { queryClient } from "@/lib/query-client";
import {
  AuthScreen,
  FeedScreen,
  MemberLayout,
  NotificationsScreen,
  OnboardingScreen,
  ProfileScreen,
  RootLayout,
  SettingsScreen,
  SocialListScreen,
  ThreadScreen,
} from "@/wired-app";

const adminInvitationsScreen = lazy(() => import("@/admin-invitations"));

function adminInvitationsRouteComponent() {
  const Component = adminInvitationsScreen;
  return (
    <Suspense
      fallback={
        <div className="h-40 animate-pulse border-b border-stone-200 bg-stone-50" />
      }
    >
      <Component />
    </Suspense>
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-dvh place-items-center bg-stone-100 p-5 text-stone-950">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold">WakYak hit a snag</h1>
        <p className="mt-2 text-sm text-stone-500">{error.message}</p>
        <button
          className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQuery);
      throw redirect(
        me.profile
          ? {
              to: "/feed/$mode",
              params: { mode: "hot" },
              search: { filter: "all", window: "week" },
            }
          : { to: "/onboarding" },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: "/sign-in", search: { redirect: undefined } });
      throw error;
    }
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: (input: Record<string, unknown>) => ({
    redirect:
      typeof input.redirect === "string" && input.redirect.startsWith("/")
        ? input.redirect
        : undefined,
  }),
  component: () => (
    <AuthScreen mode="sign-in" redirect={signInRoute.useSearch().redirect} />
  ),
});
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  component: () => <AuthScreen mode="sign-up" />,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: async ({ context, location }) => {
    try {
      return { me: await context.queryClient.ensureQueryData(meQuery) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: "/sign-in", search: { redirect: location.href } });
      throw error;
    }
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/onboarding",
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData(meQuery.queryKey);
    if (me?.profile)
      throw redirect({
        to: "/feed/$mode",
        params: { mode: "hot" },
        search: { filter: "all", window: "week" },
      });
  },
  component: OnboardingScreen,
});

const memberRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "member",
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData(meQuery.queryKey);
    if (!me?.profile) throw redirect({ to: "/onboarding" });
  },
  component: MemberLayout,
});

const feedRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/feed/$mode",
  params: {
    parse: ({ mode }) => ({
      mode: (["hot", "new", "top", "following"].includes(mode)
        ? mode
        : "hot") as FeedMode,
    }),
    stringify: ({ mode }) => ({ mode }),
  },
  validateSearch: (input: Record<string, unknown>) => ({
    filter: input.filter === "unread" ? ("unread" as const) : ("all" as const),
    window: (["day", "week", "month", "all"].includes(String(input.window))
      ? input.window
      : "week") as TopWindow,
  }),
  component: () => {
    const { mode } = feedRoute.useParams();
    const { filter, window } = feedRoute.useSearch();
    return <FeedScreen mode={mode} filter={filter} window={window} />;
  },
});

const threadRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/posts/$postId",
  component: () => <ThreadScreen postId={threadRoute.useParams().postId} />,
});

const notificationsRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/notifications",
  validateSearch: (input: Record<string, unknown>) => ({
    state: input.state === "unread" ? ("unread" as const) : ("all" as const),
  }),
  component: () => (
    <NotificationsScreen state={notificationsRoute.useSearch().state} />
  ),
});

const profileRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/profiles/$profileId",
  validateSearch: (input: Record<string, unknown>) => ({
    tab: (["posts", "replies", "media"].includes(String(input.tab))
      ? input.tab
      : "posts") as "posts" | "replies" | "media",
  }),
  component: () => {
    const { profileId } = profileRoute.useParams();
    return (
      <ProfileScreen profileId={profileId} tab={profileRoute.useSearch().tab} />
    );
  },
});

const followersRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/me/followers",
  component: () => <SocialListScreen kind="followers" />,
});
const followingRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/me/following",
  component: () => <SocialListScreen kind="following" />,
});
const settingsRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/settings",
  component: SettingsScreen,
});
const adminInvitationsRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "/admin/invitations",
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(adminAccessQuery);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403)
        throw redirect({ to: "/settings" });
      throw error;
    }
  },
  component: adminInvitationsRouteComponent,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  authenticatedRoute.addChildren([
    onboardingRoute,
    memberRoute.addChildren([
      feedRoute,
      threadRoute,
      notificationsRoute,
      profileRoute,
      followersRoute,
      followingRoute,
      settingsRoute,
      adminInvitationsRoute,
    ]),
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
