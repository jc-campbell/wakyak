import { createHmac } from "node:crypto";

const PALETTE_VERSION = "v1";
const ANIMALS = [
  "🐂",
  "🐆",
  "🐘",
  "🦊",
  "🐸",
  "🦒",
  "🦔",
  "🐨",
  "🦦",
  "🦉",
  "🐼",
  "🐧",
  "🦭",
  "🐅",
  "🐢",
  "🦓",
] as const;
const COLORS = [
  "amber",
  "blue",
  "coral",
  "emerald",
  "grape",
  "indigo",
  "lime",
  "magenta",
  "mint",
  "orange",
  "pink",
  "purple",
  "red",
  "sky",
  "teal",
  "yellow",
] as const;

export interface AnonymousIdentity {
  emoji: string;
  color: string;
  paletteVersion: string;
}

export function anonymousIdentity(
  postId: string,
  profileId: string,
  secret: string,
): AnonymousIdentity {
  const digest = createHmac("sha256", secret)
    .update(`${PALETTE_VERSION}\0${postId}\0${profileId}`)
    .digest();
  return {
    emoji: ANIMALS[digest[0]! % ANIMALS.length]!,
    color: COLORS[digest[1]! % COLORS.length]!,
    paletteVersion: PALETTE_VERSION,
  };
}
