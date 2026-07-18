import type { Env } from "../config/env.js";
import { anonymousIdentity } from "./anonymity.js";

interface Author {
  userId: string;
  handle: string;
  displayName: string;
}

interface ContentBase {
  id: string;
  postId?: string;
  authorProfileId: string | null;
  author: Author | null;
  body: string | null;
  isAnonymous: boolean;
  status: "ACTIVE" | "DELETED" | "REMOVED";
  netScore: number;
  createdAt: Date;
  updatedAt: Date;
  reactions: { value: number }[];
}

export function contentIdentity(
  value: ContentBase,
  postId: string,
  viewerProfileId: string,
  postAuthorProfileId: string | null,
  env: Env,
) {
  const active = value.status === "ACTIVE";
  const anonymous =
    active && value.isAnonymous && value.authorProfileId
      ? anonymousIdentity(postId, value.authorProfileId, env.ANONYMITY_SECRET)
      : null;
  return {
    body: active ? value.body : null,
    author: active && !value.isAnonymous ? value.author : null,
    anonymousIdentity: anonymous,
    isMine: value.authorProfileId === viewerProfileId,
    isPostAuthor: value.authorProfileId === postAuthorProfileId,
    viewerReaction: value.reactions[0]?.value ?? null,
  };
}

export function postDto(
  post: ContentBase & {
    commentCount: number;
    attachments: {
      id: string;
      width: number | null;
      height: number | null;
      order: number | null;
    }[];
  },
  viewerProfileId: string,
  env: Env,
) {
  return {
    id: post.id,
    ...contentIdentity(
      post,
      post.id,
      viewerProfileId,
      post.authorProfileId,
      env,
    ),
    isAnonymous: post.isAnonymous,
    netScore: post.netScore,
    commentCount: post.commentCount,
    attachments: post.attachments.map((attachment) => ({
      id: attachment.id,
      width: attachment.width,
      height: attachment.height,
      url: `/v1/attachments/${attachment.id}/content`,
    })),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export function commentDto(
  comment: ContentBase & {
    postId: string;
    parentCommentId: string | null;
    depth: number;
    replyCount: number;
    post: { authorProfileId: string | null };
  },
  viewerProfileId: string,
  env: Env,
) {
  return {
    id: comment.id,
    postId: comment.postId,
    parentCommentId: comment.parentCommentId,
    depth: comment.depth,
    ...contentIdentity(
      comment,
      comment.postId,
      viewerProfileId,
      comment.post.authorProfileId,
      env,
    ),
    isAnonymous: comment.isAnonymous,
    status: comment.status,
    netScore: comment.netScore,
    replyCount: comment.replyCount,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}
