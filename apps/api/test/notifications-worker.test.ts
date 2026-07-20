import { describe, expect, it } from "vitest";

import { notificationSlotAt } from "../src/notifications/worker.js";

describe("notification scheduling", () => {
  it("uses America/New_York wall time across daylight saving changes", () => {
    expect(notificationSlotAt("2026-01-15", 9).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
    expect(notificationSlotAt("2026-01-15", 18).toISOString()).toBe(
      "2026-01-15T23:00:00.000Z",
    );
    expect(notificationSlotAt("2026-07-15", 9).toISOString()).toBe(
      "2026-07-15T13:00:00.000Z",
    );
    expect(notificationSlotAt("2026-07-15", 18).toISOString()).toBe(
      "2026-07-15T22:00:00.000Z",
    );
  });
});
