import { describe, expect, it } from "vitest";

import {
  createProfileBodySchema,
  displayNameSchema,
  handleSchema,
  userIdSchema,
} from "../src/profile-validation.js";
import { loadEnv } from "../src/config/env.js";

describe("profile validation", () => {
  it("normalizes valid identifiers and display names", () => {
    expect(userIdSchema.parse("Person-123")).toBe("person-123");
    expect(handleSchema.parse("@Person_123")).toBe("person_123");
    expect(displayNameSchema.parse("  Person  ")).toBe("Person");
  });

  it.each(["ab", "1person", "person--one", "person_1", "@person", "person-"])(
    "rejects invalid userId %s",
    (value) => expect(userIdSchema.safeParse(value).success).toBe(false),
  );

  it.each(["ab", "1person", "person-name", "person name", "@@person"])(
    "rejects invalid handle %s",
    (value) => expect(handleSchema.safeParse(value).success).toBe(false),
  );

  it("rejects reserved identifiers, blank names, and unknown fields", () => {
    expect(userIdSchema.safeParse("admin").success).toBe(false);
    expect(handleSchema.safeParse("@support").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(
      createProfileBodySchema.safeParse({
        userId: "person-one",
        handle: "person_one",
        displayName: "Person",
        authUserId: "attacker-controlled",
      }).success,
    ).toBe(false);
  });
});

describe("environment validation", () => {
  const base = {
    DATABASE_URL: "postgresql://user:password@localhost/database",
    BETTER_AUTH_SECRET: "a-strong-test-secret-with-more-than-32-characters",
    BETTER_AUTH_URL: "http://localhost:4000",
    API_ORIGIN: "http://localhost:4000",
    TRUSTED_ORIGINS: "http://localhost:5173",
    SITE_OWNER_EMAIL: "owner@example.com",
    ANONYMITY_SECRET: "an-anonymity-secret-with-at-least-32-characters",
    INVITATION_COOKIE_SECRET:
      "an-invitation-secret-with-at-least-32-characters",
    S3_ENDPOINT: "http://localhost:9090",
    S3_REGION: "us-east-1",
    S3_BUCKET: "wakyak-test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_FORCE_PATH_STYLE: "true",
  };

  it("requires enabled provider credentials", () => {
    expect(() => loadEnv({ ...base, GOOGLE_AUTH_ENABLED: "true" })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  it("rejects wildcard credentialed origins and insecure production", () => {
    expect(() => loadEnv({ ...base, TRUSTED_ORIGINS: "*" })).toThrow(
      /explicit origins/,
    );
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/HTTPS/);
  });

  it("adds an automatically discovered Tailscale host in development", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "development",
      VITE_TAILSCALE_HOST: "jackmac.example.ts.net",
    });

    expect(env.trustedOrigins).toContain("https://jackmac.example.ts.net");
  });
});
