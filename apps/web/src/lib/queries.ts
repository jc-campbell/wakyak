import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { FeedFilter, FeedMode, TopWindow } from "@wakyak/contracts";

import { api } from "@/lib/api";

export const keys = {
  me: ["me"] as const,
  authConfig: ["auth-config"] as const,
  feeds: ["feeds"] as const,
  feed: (mode: FeedMode, filter: FeedFilter, window: TopWindow) =>
    ["feeds", mode, filter, window] as const,
  post: (id: string) => ["posts", id] as const,
  comments: (postId: string) => ["posts", postId, "comments"] as const,
  replies: (commentId: string) => ["comments", commentId, "replies"] as const,
  profiles: ["profiles"] as const,
  profile: (id: string) => ["profiles", id] as const,
  profilePosts: (id: string) => ["profiles", id, "posts"] as const,
  profileComments: (id: string) => ["profiles", id, "comments"] as const,
  profileMedia: (id: string) => ["profiles", id, "media"] as const,
  social: (kind: "followers" | "following") => ["me", kind] as const,
  blocks: ["me", "blocks"] as const,
  notifications: (state: "all" | "unread") => ["notifications", state] as const,
  settings: ["settings"] as const,
  subscription: (postId: string) => ["posts", postId, "subscription"] as const,
  adminAccess: ["admin", "access"] as const,
  invitations: ["admin", "invitations"] as const,
};

export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: api.me,
  retry: false,
  staleTime: 30_000,
});

export const authConfigQuery = queryOptions({
  queryKey: keys.authConfig,
  queryFn: api.authConfig,
  staleTime: Number.POSITIVE_INFINITY,
});

export function feedQuery(
  mode: FeedMode,
  filter: FeedFilter,
  window: TopWindow,
) {
  return infiniteQueryOptions({
    queryKey: keys.feed(mode, filter, window),
    queryFn: ({ pageParam }) =>
      api.feed({ mode, filter, window, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

export function commentsQuery(postId: string) {
  return infiniteQueryOptions({
    queryKey: keys.comments(postId),
    queryFn: ({ pageParam }) => api.comments(postId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function repliesQuery(commentId: string) {
  return infiniteQueryOptions({
    queryKey: keys.replies(commentId),
    queryFn: ({ pageParam }) => api.replies(commentId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function notificationsQuery(state: "all" | "unread") {
  return infiniteQueryOptions({
    queryKey: keys.notifications(state),
    queryFn: ({ pageParam }) =>
      api.notifications(state, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 30_000
        : false,
    refetchIntervalInBackground: false,
  });
}

export const invitationsQuery = infiniteQueryOptions({
  queryKey: keys.invitations,
  queryFn: ({ pageParam }) => api.invitations(pageParam ?? undefined),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
});

export const adminAccessQuery = queryOptions({
  queryKey: keys.adminAccess,
  queryFn: async () => {
    await api.adminAccess();
    return null;
  },
  retry: false,
  staleTime: 60_000,
});
