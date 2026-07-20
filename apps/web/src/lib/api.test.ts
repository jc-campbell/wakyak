import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, apiRequestVoid } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP API client", () => {
  it("parses a valid authenticated response and sends cookies", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      return new Response(
        JSON.stringify({
          user: {
            id: "auth-1",
            email: "member@example.com",
            emailVerified: true,
          },
          profile: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.me()).resolves.toMatchObject({
      user: { email: "member@example.com" },
    });
  });

  it("supports empty successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(
      apiRequestVoid("/v1/feed/seen", {
        method: "PUT",
        body: JSON.stringify({ postIds: [] }),
      }),
    ).resolves.toBeUndefined();
  });

  it("checks admin access without receiving an owner identity flag", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.adminAccess()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/admin/access"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("keeps development object uploads on the same-origin proxy", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.putUpload(
      "/__storage/wakyak-attachments/upload?signature=test",
      new File(["image"], "image.png", { type: "image/png" }),
      { "content-type": "image/png" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/__storage/wakyak-attachments/upload?signature=test",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("rejects unsupported uploads before making a reservation request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(() =>
      api.reserveUploads([{ contentType: "text/plain", byteSize: 5 }]),
    ).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes application errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "UNAUTHENTICATED",
                message: "Authentication is required.",
                requestId: "request-1",
              },
            }),
            { status: 401 },
          ),
      ),
    );
    const error = await api.me().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      requestId: "request-1",
    });
  });

  it("announces expiry for protected requests other than the session guard", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await expect(api.settings()).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "wakyak:unauthenticated" }),
    );
  });

  it("rejects responses that violate the shared contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: null }), { status: 200 }),
      ),
    );
    await expect(api.me()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
