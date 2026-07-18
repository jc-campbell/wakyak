import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  createTestApp,
  login,
  registerAndVerify,
} from "./helpers.js";

let app: FastifyInstance;
let emailService: Awaited<ReturnType<typeof createTestApp>>["email"];

beforeEach(async () => {
  await cleanDatabase();
  ({ app, email: emailService } = await createTestApp());
});

afterEach(async () => {
  await app.close();
});

async function authenticatedUser(email: string): Promise<string> {
  await registerAndVerify(app, emailService, email);
  return login(app, email);
}

describe("profile routes", () => {
  it("requires authentication and validates strict profile input", async () => {
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/profile",
      payload: {
        userId: "person-one",
        handle: "person_one",
        displayName: "Person",
      },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const cookie = await authenticatedUser("validation@example.com");
    for (const payload of [
      { userId: "1bad", handle: "valid_handle", displayName: "Person" },
      { userId: "valid-user", handle: "bad-handle", displayName: "Person" },
      { userId: "valid-user", handle: "valid_handle", displayName: "   " },
      { userId: "admin", handle: "valid_handle", displayName: "Person" },
      {
        userId: "valid-user",
        handle: "valid_handle",
        displayName: "Person",
        authUserId: "attacker",
      },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/profile",
        headers: { cookie },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("creates, normalizes, retrieves, and updates only public profile fields", async () => {
    const cookie = await authenticatedUser("profile@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie },
      payload: {
        userId: "Person-123",
        handle: "@Person_123",
        displayName: "  Person  ",
      },
    });
    expect(created.statusCode).toBe(201);
    const expected = {
      userId: "person-123",
      handle: "person_123",
      displayName: "Person",
    };
    expect(created.json()).toEqual({ profile: expected });

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie },
      payload: {
        userId: "other-user",
        handle: "other_user",
        displayName: "Other",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: { code: "PROFILE_ALREADY_EXISTS" },
    });

    for (const url of [
      "/v1/profiles/PERSON-123",
      "/v1/profiles/by-handle/@PERSON_123",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ profile: typeof expected }>();
      expect(body).toEqual({ profile: expected });
      expect(Object.keys(body.profile).sort()).toEqual([
        "displayName",
        "handle",
        "userId",
      ]);
      expect(response.body).not.toMatch(
        /authUserId|email|session|account|provider/i,
      );
    }

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: { cookie },
      payload: { handle: "@New_Handle", displayName: "  New Display Name  " },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      profile: {
        ...expected,
        handle: "new_handle",
        displayName: "New Display Name",
      },
    });

    for (const payload of [
      {},
      { userId: "changed-id" },
      { authUserId: "changed" },
      { bio: "no" },
    ]) {
      const response = await app.inject({
        method: "PATCH",
        url: "/v1/profile",
        headers: { cookie },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(
      await prisma.profile.findUnique({ where: { userId: expected.userId } }),
    ).toMatchObject({
      userId: expected.userId,
    });
  });

  it("returns not found for absent profiles and users without a profile", async () => {
    const cookie = await authenticatedUser("missing@example.com");
    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: { cookie },
      payload: { displayName: "No Profile" },
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json()).toMatchObject({
      error: { code: "PROFILE_NOT_FOUND" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie },
      payload: {
        userId: "missing-viewer",
        handle: "missing_viewer",
        displayName: "Missing Viewer",
      },
    });

    for (const url of [
      "/v1/profiles/missing-user",
      "/v1/profiles/by-handle/missing_handle",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: "PROFILE_NOT_FOUND" },
      });
    }
  });

  it("maps user ID and handle uniqueness conflicts without changing existing data", async () => {
    const first = await authenticatedUser("first@example.com");
    const second = await authenticatedUser("second@example.com");
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: first },
      payload: {
        userId: "first-user",
        handle: "first_handle",
        displayName: "First",
      },
    });

    const userIdConflict = await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: second },
      payload: {
        userId: "first-user",
        handle: "second_handle",
        displayName: "Second",
      },
    });
    expect(userIdConflict.statusCode).toBe(409);
    expect(userIdConflict.json()).toMatchObject({
      error: { code: "USER_ID_TAKEN" },
    });

    const handleConflict = await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: second },
      payload: {
        userId: "second-user",
        handle: "first_handle",
        displayName: "Second",
      },
    });
    expect(handleConflict.statusCode).toBe(409);
    expect(handleConflict.json()).toMatchObject({
      error: { code: "HANDLE_TAKEN" },
    });

    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: second },
      payload: {
        userId: "second-user",
        handle: "second_handle",
        displayName: "Second",
      },
    });
    const failedUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: { cookie: second },
      payload: { handle: "first_handle" },
    });
    expect(failedUpdate.statusCode).toBe(409);
    expect(failedUpdate.json()).toMatchObject({
      error: { code: "HANDLE_TAKEN" },
    });
    expect(
      await prisma.profile.findUnique({ where: { userId: "second-user" } }),
    ).toMatchObject({
      handle: "second_handle",
    });
  });

  it("enforces concurrent uniqueness races in PostgreSQL", async () => {
    const first = await authenticatedUser("race-one@example.com");
    const second = await authenticatedUser("race-two@example.com");
    const results = await Promise.all(
      [first, second].map((cookie, index) =>
        app.inject({
          method: "POST",
          url: "/v1/profile",
          headers: { cookie },
          payload: {
            userId: "same-user-id",
            handle: `race_handle_${index}`,
            displayName: `Race ${index}`,
          },
        }),
      ),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      results.find((result) => result.statusCode === 409)!.json(),
    ).toMatchObject({
      error: { code: "USER_ID_TAKEN" },
    });

    await cleanDatabase();
    const third = await authenticatedUser("race-three@example.com");
    const fourth = await authenticatedUser("race-four@example.com");
    const handleResults = await Promise.all(
      [third, fourth].map((cookie, index) =>
        app.inject({
          method: "POST",
          url: "/v1/profile",
          headers: { cookie },
          payload: {
            userId: `race-user-${index}`,
            handle: "same_handle",
            displayName: `Race ${index}`,
          },
        }),
      ),
    );
    expect(handleResults.map((result) => result.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      handleResults.find((result) => result.statusCode === 409)!.json(),
    ).toMatchObject({
      error: { code: "HANDLE_TAKEN" },
    });
  });
});

describe("database profile constraints", () => {
  it("enforces one profile per auth user, unique fields, and cascade deletion", async () => {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Database User",
        email: "database@example.com",
        emailVerified: true,
      },
    });
    await prisma.profile.create({
      data: {
        userId: "database-user",
        authUserId: user.id,
        handle: "database_user",
        displayName: "Database User",
      },
    });
    await expect(
      prisma.profile.create({
        data: {
          userId: "another-id",
          authUserId: user.id,
          handle: "another_handle",
          displayName: "Another",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.user.delete({ where: { id: user.id } });
    expect(
      await prisma.profile.findUnique({ where: { userId: "database-user" } }),
    ).toBeNull();
  });
});
