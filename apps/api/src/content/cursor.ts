import { AppError } from "../errors.js";

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify({ v: 1, ...value })).toString("base64url");
}

export function decodeCursor<T extends Record<string, unknown>>(
  encoded: string | undefined,
  expected: Record<string, string>,
): T | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as Record<string, unknown>;
    if (parsed.v !== 1) throw new Error();
    for (const [key, value] of Object.entries(expected)) {
      if (parsed[key] !== value) throw new Error();
    }
    return parsed as T;
  } catch {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Invalid or incompatible cursor.",
    );
  }
}
