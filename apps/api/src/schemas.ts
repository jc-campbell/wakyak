import { z } from "zod";

export const publicProfileSchema = z.object({
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
});

export const profileResponseSchema = z.object({ profile: publicProfileSchema });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
});

export const meResponseSchema = z.object({
  user: authUserSchema,
  profile: publicProfileSchema.nullable(),
});

export const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  500: errorResponseSchema,
  503: errorResponseSchema,
};
