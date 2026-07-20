import { afterEach, describe, expect, it, vi } from "vitest";

import { feedQuery, notificationsQuery } from "@/lib/queries";

afterEach(() => vi.unstubAllGlobals());

describe("query refresh policy", () => {
  it("keeps a mounted feed stable while still refetching on route entry", () => {
    const options = feedQuery("hot", "all", "week");
    expect(options.refetchOnMount).toBe("always");
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchInterval).toBeUndefined();
  });

  it("polls notifications only while the document is visible", () => {
    const interval = notificationsQuery("unread").refetchInterval;
    expect(typeof interval).toBe("function");
    vi.stubGlobal("document", { visibilityState: "visible" });
    expect((interval as () => number | false)()).toBe(30_000);
    vi.stubGlobal("document", { visibilityState: "hidden" });
    expect((interval as () => number | false)()).toBe(false);
  });
});
