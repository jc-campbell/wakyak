import type {
  BlockDto,
  CommentDto,
  FeedFilter,
  FeedMode,
  FeedResponse,
  NotificationDto,
  PostDto,
  ProfileDto,
  SettingsDto,
  ThreadSubscriptionDto,
  TopWindow,
} from "@wakyak/contracts";

import {
  initialComments,
  initialNotifications,
  initialPosts,
  initialSettings,
  profiles,
  viewer,
} from "@/showcase/data";

type BlockSource = {
  sourceType: "post" | "comment" | "notification" | "profile";
  sourceId: string;
};

interface FeedInput {
  mode: FeedMode;
  filter: FeedFilter;
  window: TopWindow;
  cursor?: string | null;
}

const sourceKey = (type: BlockSource["sourceType"], id: string) =>
  `${type}:${id}`;
const normalizeHandle = (handle: string) =>
  handle.replace(/^@/, "").trim().toLowerCase();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockApiClient {
  private sequence = 9000;
  private posts = clone(initialPosts);
  private comments = clone(initialComments);
  private notifications = clone(initialNotifications);
  private settings = clone(initialSettings);
  private seenPostIds = new Set(
    initialPosts
      .filter(
        (post) => post.isMine || post.createdAt <= "2026-07-18T15:45:00.000Z",
      )
      .map((post) => post.id),
  );
  private following = new Set(["mayawalks", "theooutside"]);
  private blocks = new Map<string, BlockDto>();
  private blockedActorByBlock = new Map<string, string>();
  private subscriptions = new Map([[initialPosts[1].id, true]]);

  // This is deliberately private. Anonymous actor resolution never crosses the
  // mock API boundary, just as it must not cross the real one.
  private actorBySource = new Map<string, string>([
    [sourceKey("post", initialPosts[0].id), "actor-porch"],
    [sourceKey("post", initialPosts[2].id), "profile-maya"],
    [sourceKey("post", initialPosts[3].id), "actor-ladder"],
    [sourceKey("post", initialPosts[4].id), "profile-theo"],
    [sourceKey("post", initialPosts[5].id), "profile-nora"],
    [sourceKey("comment", initialComments[0].id), "profile-maya"],
    [sourceKey("comment", initialComments[2].id), "actor-moth"],
    [sourceKey("comment", initialComments[4].id), "actor-porch"],
    [sourceKey("notification", initialNotifications[0].id), "profile-maya"],
    [sourceKey("notification", initialNotifications[1].id), "actor-badger"],
    [sourceKey("notification", initialNotifications[2].id), "actor-moth"],
    [sourceKey("notification", initialNotifications[3].id), "profile-theo"],
    ...profiles
      .slice(1)
      .map(
        (profile) =>
          [sourceKey("profile", profile.userId), profile.userId] as const,
      ),
  ]);

  getFeed(input: FeedInput): FeedResponse {
    let result = this.posts.filter(
      (post) => !this.isSourceBlocked("post", post.id),
    );
    if (input.mode === "following") {
      result = result.filter(
        (post) =>
          !post.isMine &&
          post.author !== null &&
          this.following.has(normalizeHandle(post.author.handle)),
      );
    }
    if (input.filter === "unread") {
      result = result.filter((post) => !this.seenPostIds.has(post.id));
    }
    if (input.mode === "new" || input.mode === "following") {
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (input.mode === "top") {
      result.sort((a, b) => b.netScore - a.netScore);
    }

    const offset = input.cursor ? Number(input.cursor) : 0;
    const page = result.slice(offset, offset + 4);
    const nextOffset = offset + page.length;
    return {
      posts: clone(page),
      nextCursor: nextOffset < result.length ? String(nextOffset) : null,
    };
  }

  markPostSeen(postId: string): { seen: true } {
    const post = this.posts.find((item) => item.id === postId);
    if (!post) throw new Error("Post not found");
    this.seenPostIds.add(postId);
    return { seen: true };
  }

  getPost(postId: string): PostDto | undefined {
    const post = this.posts.find((item) => item.id === postId);
    return post && !this.isSourceBlocked("post", post.id)
      ? clone(post)
      : undefined;
  }

  getComments(postId: string): {
    comments: CommentDto[];
    nextCursor: string | null;
  } {
    return {
      comments: clone(
        this.comments.filter(
          (comment) =>
            comment.postId === postId &&
            !this.isSourceBlocked("comment", comment.id),
        ),
      ),
      nextCursor: "more-root-comments",
    };
  }

  reactToPost(postId: string, reaction: -1 | 1): PostDto {
    const post = this.posts.find((item) => item.id === postId);
    if (!post) throw new Error("Post not found");
    const previous = post.viewerReaction ?? 0;
    post.viewerReaction = previous === reaction ? null : reaction;
    post.netScore += (post.viewerReaction ?? 0) - previous;
    return clone(post);
  }

  reactToComment(commentId: string, reaction: -1 | 1): CommentDto {
    const comment = this.comments.find((item) => item.id === commentId);
    if (!comment) throw new Error("Comment not found");
    const previous = comment.viewerReaction ?? 0;
    comment.viewerReaction = previous === reaction ? null : reaction;
    comment.netScore += (comment.viewerReaction ?? 0) - previous;
    return clone(comment);
  }

  createPost(input: { body: string; isAnonymous: boolean }): { post: PostDto } {
    const post: PostDto = {
      id: this.nextId(),
      body: input.body,
      author: input.isAnonymous
        ? null
        : {
            userId: viewer.userId,
            handle: viewer.handle,
            displayName: viewer.displayName,
            avatarUrl: viewer.avatarUrl,
          },
      anonymousIdentity: input.isAnonymous
        ? { emoji: "🦌", color: "#0f766e", paletteVersion: "v1" }
        : null,
      isMine: true,
      isPostAuthor: true,
      viewerReaction: null,
      isAnonymous: input.isAnonymous,
      netScore: 1,
      commentCount: 0,
      attachments: [],
      createdAt: candidate,
      updatedAt: candidate,
    };
    this.posts.unshift(post);
    return { post: clone(post) };
  }

  createComment(input: {
    postId: string;
    parentCommentId?: string;
    body: string;
    isAnonymous: boolean;
  }): { comment: CommentDto } {
    const parent = input.parentCommentId
      ? this.comments.find((item) => item.id === input.parentCommentId)
      : undefined;
    const comment: CommentDto = {
      id: this.nextId(),
      postId: input.postId,
      parentCommentId: input.parentCommentId ?? null,
      depth: parent ? parent.depth + 1 : 0,
      body: input.body,
      author: input.isAnonymous
        ? null
        : {
            userId: viewer.userId,
            handle: viewer.handle,
            displayName: viewer.displayName,
            avatarUrl: viewer.avatarUrl,
          },
      anonymousIdentity: input.isAnonymous
        ? { emoji: "🦌", color: "#0f766e", paletteVersion: "v1" }
        : null,
      isMine: true,
      isPostAuthor: true,
      viewerReaction: null,
      isAnonymous: input.isAnonymous,
      status: "ACTIVE",
      netScore: 1,
      replyCount: 0,
      createdAt: candidate,
      updatedAt: candidate,
    };
    this.comments.push(comment);
    const post = this.posts.find((item) => item.id === input.postId);
    if (post) post.commentCount += 1;
    if (!this.subscriptions.has(input.postId))
      this.subscriptions.set(input.postId, true);
    return { comment: clone(comment) };
  }

  getProfile(profileId: string): ProfileDto | undefined {
    return clone(profiles.find((profile) => profile.userId === profileId));
  }

  getProfilePosts(profileId: string): PostDto[] {
    return clone(
      this.posts.filter(
        (post) => !post.isAnonymous && post.author?.userId === profileId,
      ),
    );
  }

  getProfileComments(profileId: string): CommentDto[] {
    return clone(
      this.comments.filter(
        (comment) =>
          !comment.isAnonymous && comment.author?.userId === profileId,
      ),
    );
  }

  isFollowing(handle: string): boolean {
    return this.following.has(normalizeHandle(handle));
  }

  follow(handle: string): { following: true } {
    const normalized = normalizeHandle(handle);
    const profile = profiles.find(
      (item) => normalizeHandle(item.handle) === normalized,
    );
    if (!profile || profile.userId === viewer.userId)
      throw new Error("Profile not found");
    this.following.add(normalized);
    return { following: true };
  }

  unfollow(handle: string): { following: false } {
    this.following.delete(normalizeHandle(handle));
    return { following: false };
  }

  getSocialList(kind: "followers" | "following"): {
    profiles: ProfileDto[];
    nextCursor: null;
  } {
    const list =
      kind === "following"
        ? profiles.filter((profile) =>
            this.following.has(normalizeHandle(profile.handle)),
          )
        : [profiles[3], profiles[1]];
    return { profiles: clone(list), nextCursor: null };
  }

  getNotifications(filter: "all" | "unread"): {
    notifications: NotificationDto[];
    nextCursor: null;
  } {
    const result = this.notifications.filter(
      (notification) =>
        !this.isSourceBlocked("notification", notification.id) &&
        (filter === "all" || notification.readAt === null),
    );
    return { notifications: clone(result), nextCursor: null };
  }

  markNotificationRead(id: string): { notification: NotificationDto } {
    const notification = this.notifications.find((item) => item.id === id);
    if (!notification) throw new Error("Notification not found");
    notification.readAt ??= candidate;
    return { notification: clone(notification) };
  }

  markAllNotificationsRead(): { readAt: string } {
    for (const notification of this.notifications)
      notification.readAt ??= candidate;
    return { readAt: candidate };
  }

  getSettings(): SettingsDto {
    return clone(this.settings);
  }

  updateSettings(patch: Partial<SettingsDto>): SettingsDto {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  getSubscription(postId: string): ThreadSubscriptionDto {
    return { enabled: this.subscriptions.get(postId) ?? true };
  }

  updateSubscription(postId: string, enabled: boolean): ThreadSubscriptionDto {
    this.subscriptions.set(postId, enabled);
    return { enabled };
  }

  block(input: BlockSource): BlockDto {
    const actorKey = this.actorBySource.get(
      sourceKey(input.sourceType, input.sourceId),
    );
    if (!actorKey)
      throw new Error("This item cannot be used to block an account.");
    const existing = [...this.blockedActorByBlock.entries()].find(
      ([, actor]) => actor === actorKey,
    );
    if (existing) return clone(this.blocks.get(existing[0])!);

    const snapshot = this.snapshotForSource(input);
    const block: BlockDto = {
      blockId: this.nextId(),
      createdAt: candidate,
      displaySnapshot: snapshot,
    };
    this.blocks.set(block.blockId, block);
    this.blockedActorByBlock.set(block.blockId, actorKey);
    const profile = profiles.find((item) => item.userId === actorKey);
    if (profile) this.following.delete(normalizeHandle(profile.handle));
    return clone(block);
  }

  getBlocks(): { blocks: BlockDto[] } {
    return { blocks: clone([...this.blocks.values()]) };
  }

  unblock(blockId: string): { unblocked: true } {
    this.blocks.delete(blockId);
    this.blockedActorByBlock.delete(blockId);
    return { unblocked: true };
  }

  private nextId(): string {
    this.sequence += 1;
    return `90000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  private isSourceBlocked(
    type: BlockSource["sourceType"],
    id: string,
  ): boolean {
    const actor = this.actorBySource.get(sourceKey(type, id));
    return actor
      ? [...this.blockedActorByBlock.values()].includes(actor)
      : false;
  }

  private snapshotForSource(input: BlockSource): BlockDto["displaySnapshot"] {
    if (input.sourceType === "post") {
      const post = this.posts.find((item) => item.id === input.sourceId);
      if (post?.anonymousIdentity)
        return { label: "Anonymous", ...post.anonymousIdentity };
      if (post?.author)
        return {
          label: post.author.displayName,
          emoji: null,
          color: null,
          paletteVersion: null,
        };
    }
    if (input.sourceType === "comment") {
      const comment = this.comments.find((item) => item.id === input.sourceId);
      if (comment?.anonymousIdentity)
        return { label: "Anonymous", ...comment.anonymousIdentity };
      if (comment?.author)
        return {
          label: comment.author.displayName,
          emoji: null,
          color: null,
          paletteVersion: null,
        };
    }
    if (input.sourceType === "notification") {
      const notification = this.notifications.find(
        (item) => item.id === input.sourceId,
      );
      const identity = notification?.payload.anonymousIdentity as
        { emoji: string; color: string; paletteVersion: string } | undefined;
      const actor = notification?.payload.actor as
        { displayName: string } | undefined;
      if (identity) return { label: "Anonymous", ...identity };
      if (actor)
        return {
          label: actor.displayName,
          emoji: null,
          color: null,
          paletteVersion: null,
        };
    }
    const profile = profiles.find((item) => item.userId === input.sourceId);
    return {
      label: profile?.displayName ?? "Account",
      emoji: null,
      color: null,
      paletteVersion: null,
    };
  }
}

export const formatRelativeTime = (iso: string): string => {
  const minutes = Math.max(
    0,
    Math.round((Date.parse(candidate) - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
};
