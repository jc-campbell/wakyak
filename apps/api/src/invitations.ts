import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITATION_COOKIE = "wakyak_invitation";
const MAX_AGE_SECONDS = 30 * 60;

export function normalizeInvitationCode(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[-_\s]/g, "");
  if (normalized.length !== 16 || !/^[0-9A-HJKMNP-TV-Z]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function generateInvitationCode(): string {
  const bytes = randomBytes(16);
  let result = "";
  for (const byte of bytes) result += ALPHABET[byte & 31];
  return result;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createInvitationCookie(
  invitationId: string,
  secret: string,
  secure: boolean,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ v: 1, invitationId, expiresAt }),
  ).toString("base64url");
  const value = `${payload}.${signature(payload, secret)}`;
  return `${INVITATION_COOKIE}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearInvitationCookie(secure: boolean): string {
  return `${INVITATION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function invitationIdFromCookie(
  cookieHeader: string | null | undefined,
  secret: string,
): string | null {
  const cookie = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${INVITATION_COOKIE}=`));
  const value = cookie?.slice(INVITATION_COOKIE.length + 1);
  if (!value) return null;
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      v?: unknown;
      invitationId?: unknown;
      expiresAt?: unknown;
    };
    if (
      parsed.v !== 1 ||
      typeof parsed.invitationId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed.invitationId;
  } catch {
    return null;
  }
}

export function formatInvitationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}
