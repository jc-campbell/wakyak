import sharp from "sharp";
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
afterEach(async () => app.close());

describe("attachments against S3Mock", () => {
  it("presigns, validates, converts, redirects, and deletes an unattached image", async () => {
    await registerAndVerify(app, emailService, "images@example.com");
    const cookie = await login(app, "images@example.com");
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie },
      payload: {
        userId: "image-user",
        handle: "image_user",
        displayName: "Image User",
      },
    });
    const source = await sharp({
      create: { width: 48, height: 24, channels: 4, background: "#ff00aa" },
    })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: "remove me" } } })
      .toBuffer();
    const requested = await app.inject({
      method: "POST",
      url: "/v1/attachments/uploads",
      headers: { cookie },
      payload: {
        files: [{ contentType: "image/png", byteSize: source.length }],
      },
    });
    expect(requested.statusCode).toBe(201);
    const upload = requested.json<{
      uploads: {
        id: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }[];
    }>().uploads[0]!;
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: source,
    });
    expect(put.ok).toBe(true);
    const completed = await app.inject({
      method: "POST",
      url: `/v1/attachments/${upload.id}/complete`,
      headers: { cookie },
    });
    expect(completed.statusCode).toBe(200);
    expect(
      completed.json<{
        attachment: { status: string; width: number; height: number };
      }>().attachment,
    ).toMatchObject({
      status: "READY",
      width: 48,
      height: 24,
    });

    const content = await app.inject({
      method: "GET",
      url: `/v1/attachments/${upload.id}/content`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(302);
    expect(content.headers["cross-origin-resource-policy"]).toBe(
      "cross-origin",
    );
    const normalized = Buffer.from(
      await (await fetch(content.headers.location!)).arrayBuffer(),
    );
    const metadata = await sharp(normalized).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 48, height: 24 });
    expect(metadata.exif).toBeUndefined();

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/attachments/${upload.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);
  });
});
