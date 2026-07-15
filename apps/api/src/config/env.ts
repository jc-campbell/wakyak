import "dotenv/config";

import { readFileSync } from "node:fs";

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
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10_485_760)
    .default(1_048_576),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SESSION_EXPIRES_IN_SECONDS: z.coerce.number().int().min(300).default(604_800),
  SESSION_UPDATE_AGE_SECONDS: z.coerce.number().int().min(60).default(86_400),
  GOOGLE_AUTH_ENABLED: booleanFromString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  APPLE_AUTH_ENABLED: booleanFromString,
  APPLE_CLIENT_ID: optionalString,
  APPLE_TEAM_ID: optionalString,
  APPLE_KEY_ID: optionalString,
  APPLE_PRIVATE_KEY: optionalString,
  APPLE_PRIVATE_KEY_FILE: optionalString,
  APPLE_APP_BUNDLE_IDENTIFIER: optionalString,
  EMAIL_MODE: z.enum(["console", "brevo"]).default("console"),
  BREVO_API_KEY: optionalString,
  EMAIL_FROM_ADDRESS: optionalString,
  EMAIL_FROM_NAME: optionalString,
});

export type Env = z.infer<typeof baseSchema> & {
  trustedOrigins: string[];
  applePrivateKey?: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = baseSchema.parse(source);
  const trustedOrigins = parsed.TRUSTED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (trustedOrigins.length === 0 || trustedOrigins.includes("*")) {
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

  let applePrivateKey = parsed.APPLE_PRIVATE_KEY?.replaceAll("\\n", "\n");
  if (parsed.APPLE_PRIVATE_KEY_FILE) {
    applePrivateKey = readFileSync(parsed.APPLE_PRIVATE_KEY_FILE, "utf8");
  }

  if (
    parsed.APPLE_AUTH_ENABLED &&
    (!parsed.APPLE_CLIENT_ID ||
      !parsed.APPLE_TEAM_ID ||
      !parsed.APPLE_KEY_ID ||
      !applePrivateKey)
  ) {
    throw new Error(
      "Apple authentication is enabled; APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and either APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_FILE are required.",
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
    trustedOrigins,
    ...(applePrivateKey ? { applePrivateKey } : {}),
  };
}
