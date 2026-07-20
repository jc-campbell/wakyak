import type { FeedResponse } from "@wakyak/contracts";
import type { InfiniteData } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { keys } from "@/lib/queries";
import { queuePostSeen } from "@/lib/seen";

const postId = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("seen post batching", () => {
  it("deduplicates observations and removes acknowledged posts only from unread feeds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout });
    const markSeen = vi.spyOn(api, "markSeen").mockResolvedValue(undefined);
    const page: FeedResponse = {
      posts: [
        {
          id: postId,
          body: "Visible post",
          author: null,
          anonymousIdentity: {
            emoji: "🌱",
            color: "#0f766e",
            paletteVersion: "v1",
          },
          isMine: false,
          isPostAuthor: false,
          viewerReaction: null,
          isAnonymous: true,
          netScore: 0,
          commentCount: 0,
          attachments: [],
          createdAt: "2026-07-19T12:00:00.000Z",
          updatedAt: "2026-07-19T12:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    queryClient.setQueryData<InfiniteData<FeedResponse>>(
      keys.feed("hot", "unread", "week"),
      { pages: [page], pageParams: [null] },
    );
    queryClient.setQueryData<InfiniteData<FeedResponse>>(
      keys.feed("hot", "all", "week"),
      { pages: [page], pageParams: [null] },
    );

    queuePostSeen(postId);
    queuePostSeen(postId);
    await vi.advanceTimersByTimeAsync(350);

    expect(markSeen).toHaveBeenCalledOnce();
    expect(markSeen).toHaveBeenCalledWith([postId]);
    expect(
      queryClient.getQueryData<InfiniteData<FeedResponse>>(
        keys.feed("hot", "unread", "week"),
      )?.pages[0]?.posts,
    ).toHaveLength(0);
    expect(
      queryClient.getQueryData<InfiniteData<FeedResponse>>(
        keys.feed("hot", "all", "week"),
      )?.pages[0]?.posts,
    ).toHaveLength(1);
  });
});
