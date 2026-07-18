export type MockView = "home" | "thread" | "notifications" | "profile";
export type FeedSort = "hot" | "new" | "top";
export type TopWindow = "day" | "week" | "month" | "all";
export type NotificationFilter = "all" | "mentions";
export type ProfileTab = "posts" | "replies" | "media";

export interface ProfileData {
  name: string;
  handle: string;
  initials: string;
  bio: string;
  joined: string;
  posts: number;
  friends: number;
}

export interface PostData {
  id: string;
  identity: string;
  avatar: string;
  handle?: string;
  time: string;
  body: string;
  comments: number;
  score: number;
  image?: boolean;
  mine?: boolean;
  unread?: boolean;
}

export interface CommentData {
  id: string;
  parentId?: string;
  identity: string | null;
  avatar?: string;
  handle?: string;
  time: string;
  body: string | null;
  score: number;
  replies: number;
  depth: number;
  postAuthor?: boolean;
}

export interface NotificationData {
  id: string;
  kind: "reply" | "vote" | "mention" | "system";
  avatar: string;
  actor: string;
  text: string;
  excerpt?: string;
  time: string;
  unread: boolean;
}
