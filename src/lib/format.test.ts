import { describe, it, expect } from "vitest";
import { describeAudit, timeAgo } from "./format";

describe("format", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  it("timeAgo", () => {
    expect(timeAgo("2026-11-13T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-13T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-11-11T12:00:00Z", now)).toBe("2 days ago");
  });
  it("describeAudit", () => {
    expect(describeAudit("form.created", { title: "Intake" })).toBe("Created “Intake”");
    expect(describeAudit("form.status_changed", { from: "draft", to: "published" })).toContain("draft to published");
    expect(describeAudit("something.else", {})).toBe("something.else");
  });
});
