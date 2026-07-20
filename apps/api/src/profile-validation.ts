import { z } from "zod";

const reserved = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "help",
  "moderator",
  "root",
  "security",
  "settings",
  "support",
  "system",
  "webmaster",
]);

export const userIdSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z](?:[a-z0-9]|-(?!-))*[a-z0-9]$/)
      .refine((value) => !reserved.has(value), "This identifier is reserved."),
  );

export const handleSchema = z
  .string()
  .transform((value) =>
    (value.startsWith("@") ? value.slice(1) : value).toLowerCase(),
  )
  .pipe(
    z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-z][a-z0-9_]*$/)
      .refine((value) => !reserved.has(value), "This handle is reserved."),
  );

export const displayNameSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => [...value].length >= 1 && [...value].length <= 80, {
    message: "Display name must contain between 1 and 80 Unicode code points.",
  });

export const createProfileBodySchema = z
  .object({
    userId: userIdSchema,
    handle: handleSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const updateProfileBodySchema = z
  .object({
    handle: handleSchema.optional(),
    displayName: displayNameSchema.optional(),
    avatarUrl: z.url().max(2048).nullable().optional(),
    bio: z.string().trim().max(280).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one editable field is required.",
  });
