import {
  editableProfileSchema,
  meResponseSchema,
  profileDetailsSchema,
} from "@wakyak/contracts";
import { z } from "zod";

export const editableProfileResponseSchema = z.object({
  profile: editableProfileSchema,
});
export const profileDetailsResponseSchema = z.object({
  profile: profileDetailsSchema,
});
/** @deprecated Prefer the response schema for the specific profile route. */
export const profileResponseSchema = editableProfileResponseSchema;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export { meResponseSchema };

export const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  500: errorResponseSchema,
  503: errorResponseSchema,
};
