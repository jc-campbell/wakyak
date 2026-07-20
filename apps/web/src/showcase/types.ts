import type {
  AnonymousIdentity,
  BlockDto,
  FeedFilter,
  FeedMode,
  NotificationDto,
  ProfileDto,
  SettingsDto,
  TopWindow,
} from "@wakyak/contracts";

export type MockView =
  | "home"
  | "thread"
  | "notifications"
  | "profile"
  | "public-profile"
  | "social-list"
  | "settings";

export type NotificationFilter = "all" | "unread";
export type ProfileTab = "posts" | "replies" | "media";
export type SocialListKind = "followers" | "following";
export type ComposeTarget =
  | { type: "post" }
  | { type: "reply"; postId: string; parentCommentId?: string };

export interface BlockIntent {
  sourceType: "post" | "comment" | "notification" | "profile";
  sourceId: string;
  snapshot: { label: string; anonymousIdentity?: AnonymousIdentity };
}

export interface ToastState {
  message: string;
  undoBlockId?: string;
}

export type {
  BlockDto,
  FeedFilter,
  FeedMode,
  NotificationDto,
  ProfileDto,
  SettingsDto,
  TopWindow,
};
