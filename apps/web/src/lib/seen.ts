import type { FeedResponse } from "@wakyak/contracts";
import type { InfiniteData } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

const queued = new Set<string>();
let timer: number | undefined;
let flushing = false;

export function queuePostSeen(postId: string): void {
  queued.add(postId);
  if (timer !== undefined) return;
  timer = window.setTimeout(() => void flushSeenPosts(), 350);
}

async function flushSeenPosts(): Promise<void> {
  timer = undefined;
  if (flushing || queued.size === 0) return;
  flushing = true;
  const postIds = [...queued].slice(0, 50);
  postIds.forEach((id) => queued.delete(id));
  try {
    await api.markSeen(postIds);
    const seen = new Set(postIds);
    queryClient.setQueriesData<InfiniteData<FeedResponse>>(
      {
        predicate: ({ queryKey }) =>
          queryKey[0] === "feeds" && queryKey[2] === "unread",
      },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                posts: page.posts.filter((post) => !seen.has(post.id)),
              })),
            }
          : data,
    );
  } catch {
    postIds.forEach((id) => queued.add(id));
  } finally {
    flushing = false;
    if (queued.size > 0 && timer === undefined)
      timer = window.setTimeout(() => void flushSeenPosts(), 1_000);
  }
}
