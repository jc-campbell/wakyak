import "dotenv/config";

import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  API_ORIGIN: z.url().default("http://localhost:4000"),
  TRUST_PROXY: booleanFromString,
  TRUSTED_ORIGINS: z.string().min(1).default("http://localhost:5173"),
  VITE_TAILSCALE_HOST: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i)
    .optional(),
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10_485_760)
    .default(1_048_576),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SITE_OWNER_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
  ANONYMITY_SECRET: z.string().min(32),
  INVITATION_COOKIE_SECRET: z.string().min(32),
  SESSION_EXPIRES_IN_SECONDS: z.coerce.number().int().min(300).default(604_800),
  SESSION_UPDATE_AGE_SECONDS: z.coerce.number().int().min(60).default(86_400),
  GOOGLE_AUTH_ENABLED: booleanFromString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  EMAIL_MODE: z.enum(["console", "brevo"]).default("console"),
  BREVO_API_KEY: optionalString,
  EMAIL_FROM_ADDRESS: optionalString,
  EMAIL_FROM_NAME: optionalString,
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString,
});

export type Env = z.infer<typeof baseSchema> & {
  trustedOrigins: string[];
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = baseSchema.parse(source);
  const trustedOrigins = parsed.TRUSTED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsed.NODE_ENV === "development" && parsed.VITE_TAILSCALE_HOST) {
    trustedOrigins.push(`https://${parsed.VITE_TAILSCALE_HOST}`);
  }

  const uniqueTrustedOrigins = [...new Set(trustedOrigins)];

  if (uniqueTrustedOrigins.length === 0 || uniqueTrustedOrigins.includes("*")) {
    throw new Error(
      "TRUSTED_ORIGINS must contain explicit origins and cannot contain '*'.",
    );
  }

  if (
    parsed.GOOGLE_AUTH_ENABLED &&
    (!parsed.GOOGLE_CLIENT_ID || !parsed.GOOGLE_CLIENT_SECRET)
  ) {
    throw new Error(
      "Google authentication is enabled; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.",
    );
  }

  if (
    parsed.EMAIL_MODE === "brevo" &&
    (!parsed.BREVO_API_KEY ||
      !parsed.EMAIL_FROM_ADDRESS ||
      !parsed.EMAIL_FROM_NAME)
  ) {
    throw new Error(
      "Brevo email mode requires BREVO_API_KEY, EMAIL_FROM_ADDRESS, and EMAIL_FROM_NAME.",
    );
  }

  if (parsed.NODE_ENV === "production") {
    if (
      !parsed.BETTER_AUTH_URL.startsWith("https://") ||
      !parsed.API_ORIGIN.startsWith("https://")
    ) {
      throw new Error(
        "Production BETTER_AUTH_URL and API_ORIGIN must use HTTPS.",
      );
    }
    if (parsed.EMAIL_MODE !== "brevo") {
      throw new Error("Production requires EMAIL_MODE=brevo.");
    }
    if (parsed.DATABASE_URL.includes("app-development-only")) {
      throw new Error(
        "Production DATABASE_URL must not use the development placeholder password.",
      );
    }
  }

  return {
    ...parsed,
    trustedOrigins: uniqueTrustedOrigins,
  };
}
